// Conciliação: o estado real vem SEMPRE de GET /v1/orders/{id}. Notificação, URL de retorno ou
// clique do cliente só dizem "vá conferir". A consulta HTTP acontece antes de abrir qualquer
// conexão MySQL; a transação é curta (pedido travado com FOR UPDATE) e as transições são
// monotônicas, então notificações repetidas ou fora de ordem não duplicam nem regridem nada.
const pool = require('../../config/db');
const mercadoPago = require('./mercadoPago');
const Pagamento = require('../models/Pagamento');
const Pedido = require('../models/Pedido');

function classificar(order) {
    const status = String((order && order.status) || '').toLowerCase();
    const detalhe = String((order && order.status_detail) || '').toLowerCase();
    if (status === 'processed' && detalhe === 'accredited') return 'aprovado';
    if (status === 'processed' && detalhe === 'partially_refunded') return 'reembolso_parcial';
    if (status === 'refunded' || (status === 'processed' && detalhe === 'refunded')) return 'reembolsado';
    if (status === 'canceled' || status === 'cancelled' || status === 'expired') return 'cancelado';
    if (status === 'failed') return 'recusado';
    if (Pagamento.ATIVOS.includes(status)) return 'aguardando';
    return 'desconhecido';
}

const aprovada = t => t && t.status_mp === 'processed' && t.status_detail_mp === 'accredited';

function dadosDoPagamento(order) {
    const pagamentos = (order.transactions && Array.isArray(order.transactions.payments)) ? order.transactions.payments : [];
    const p = pagamentos[pagamentos.length - 1] || {};
    const metodo = p.payment_method || {};
    const texto = (v, max) => (v == null || v === '' ? null : String(v).slice(0, max));
    return {
        mp_payment_id: texto(p.id, 64),
        metodo_pagamento: texto([metodo.type, metodo.id].filter(Boolean).join('/'), 60)
    };
}

function conferir(order, local) {
    const problemas = [];
    if (order.external_reference !== local.external_reference) problemas.push('external_reference divergente');
    if (String(order.currency || '').toUpperCase() !== local.moeda) problemas.push('moeda divergente');
    if (mercadoPago.textoParaCentavos(order.total_amount) !== local.valor_centavos) problemas.push('valor total divergente');
    if (classificar(order) === 'aprovado' &&
        mercadoPago.textoParaCentavos(order.total_paid_amount) !== local.valor_centavos) {
        problemas.push('valor pago divergente');
    }
    return problemas;
}

async function registrarAlerta({ acao, mp_order_id, id_pedido, detalhe }) {
    console.warn(`⚠️  [pagamento] alerta ${acao}`, JSON.stringify({ id_pedido, mp_order_id, detalhe }));
    await Pagamento.registrarEvento({ tipo: 'alerta', acao, mp_resource_id: mp_order_id, resultado: 'alerta', detalhe })
        .catch(err => console.error('❌ [pagamento] alerta não gravado:', err.code || err.message));
}

// Retorna { resultado, classe, id_pedido, statusPedido, alerta }.
// Lança ErroMercadoPago (transitorio=true) quando o MP não responde: quem chamou decide o retry.
async function conciliar(mp_order_id, { live_mode = null } = {}) {
    const id = String(mp_order_id || '').trim();
    if (!mercadoPago.idOrderValido(id)) return { resultado: 'invalido' };

    const local = await Pagamento.buscarPorOrderId(id);
    if (!local) return { resultado: 'desconhecido' };

    const order = await mercadoPago.buscarOrder(id);
    const classe = classificar(order);
    const problemas = conferir(order, local);
    const pago = mercadoPago.textoParaCentavos(order.total_paid_amount);

    let alerta = null;
    let resultado = 'sem_mudanca';
    let statusPedido;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const pedido = await Pedido.bloquear(conn, local.id_pedido);
        const tentativas = await Pagamento.listarDoPedido(conn, local.id_pedido);
        const antes = tentativas.find(t => t.id_pagamento === local.id_pagamento) || local;
        const outraAprovada = tentativas.some(t => t.id_pagamento !== local.id_pagamento && aprovada(t));
        const maisRecente = tentativas.every(t => t.tentativa <= antes.tentativa);
        statusPedido = pedido.status;

        if (problemas.length) {
            alerta = { acao: 'divergente', detalhe: problemas.join('; ') };
        } else if (classe === 'aprovado') {
            if (pedido.status === 'pendente') {
                await Pedido.marcarPago(conn, pedido.id_pedido);
                resultado = 'pago';
            } else if (pedido.status === 'pago' && aprovada(antes)) {
                resultado = 'ja_processado';
            } else if (!aprovada(antes)) {
                // Modelo A: nada é estornado automaticamente; o alerta orienta o estorno no painel do MP.
                alerta = {
                    acao: pedido.status === 'pago' ? 'pagamento_duplicado' : `pago_com_pedido_${pedido.status}`,
                    detalhe: `Pedido #${pedido.id_pedido} está '${pedido.status}' e a order ${id} foi aprovada: estornar pelo painel do Mercado Pago.`
                };
            }
        } else if (classe === 'reembolsado') {
            if (pedido.status === 'pago' && !outraAprovada) {
                await Pedido.marcarReembolsado(conn, pedido.id_pedido);
                resultado = 'reembolsado';
            } else if (pedido.status === 'pendente' && maisRecente) {
                await Pedido.marcarCancelado(conn, pedido.id_pedido);
                resultado = 'cancelado';
            }
        } else if (classe === 'cancelado') {
            if (pedido.status === 'pendente' && maisRecente) {
                await Pedido.marcarCancelado(conn, pedido.id_pedido);
                resultado = 'cancelado';
            }
        } else if (classe === 'reembolso_parcial') {
            alerta = { acao: 'reembolso_parcial', detalhe: `Order ${id} com reembolso parcial; pedido #${pedido.id_pedido} mantido como '${pedido.status}'.` };
        } else if (classe === 'desconhecido') {
            alerta = { acao: 'status_desconhecido', detalhe: `Status '${order.status}/${order.status_detail}' sem tratamento.` };
        }

        await Pagamento.atualizarEstado(conn, local.id_pagamento, {
            status_mp: String(order.status || '').slice(0, 40) || null,
            status_detail_mp: String(order.status_detail || '').slice(0, 60) || null,
            ...dadosDoPagamento(order),
            valor_pago_centavos: Number.isSafeInteger(pago) ? pago : null,
            live_mode: typeof live_mode === 'boolean' ? (live_mode ? 1 : 0) : null,
            ultimo_erro: alerta ? `${alerta.acao}: ${alerta.detalhe}`.slice(0, 255) : null
        });
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    if (resultado === 'pago') statusPedido = 'pago';
    if (resultado === 'cancelado') statusPedido = 'cancelado';
    if (resultado === 'reembolsado') statusPedido = 'reembolsado';
    if (alerta) await registrarAlerta({ ...alerta, mp_order_id: id, id_pedido: local.id_pedido });
    return { resultado, classe, id_pedido: local.id_pedido, statusPedido, alerta: alerta ? alerta.acao : null };
}

module.exports = { conciliar, classificar };
