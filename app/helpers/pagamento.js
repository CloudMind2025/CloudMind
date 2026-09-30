// Pagamento dos pedidos: Mercado Pago Checkout Pro (Orders API) ou demonstração (só fora de produção).
// Um pedido só vira 'pago' em Pedido.criarComItens (total R$ 0,00 ou demonstração) ou em conciliar(),
// depois de conferir a order no Mercado Pago. Nada que venha do navegador marca pagamento.
const crypto = require('crypto');
const pool = require('../../config/db');
const mercadoPago = require('./mercadoPago');
const { conciliar } = require('./conciliacaoPagamento');
const Pagamento = require('../models/Pagamento');
const Pedido = require('../models/Pedido');

const MODOS = ['mercadopago', 'demonstracao'];

// ---------- Configuração ----------
function config() {
    const env = process.env;
    const producao = env.NODE_ENV === 'production';
    const urlDefinida = String(env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    return {
        producao,
        modo: String(env.PAGAMENTO_MODO || '').trim().toLowerCase() || (producao ? '' : 'demonstracao'),
        webhookSecret: String(env.MERCADO_PAGO_WEBHOOK_SECRET || '').trim(),
        urlDefinida,
        urlPublica: urlDefinida || `http://localhost:${env.APP_PORT || 3000}`,
        expiracao: String(env.MERCADO_PAGO_EXPIRACAO || '').trim().toUpperCase()
    };
}

// Em produção nunca há demonstração, mesmo que a checagem do boot tenha sido contornada.
function modo() {
    const c = config();
    return c.producao || c.modo === 'mercadopago' ? 'mercadopago' : 'demonstracao';
}

function cobrancaOnline() {
    return modo() === 'mercadopago';
}

function webhookSecret() {
    return config().webhookSecret;
}

// Em produção lança (o boot falha); fora dela devolve os avisos para o log.
function validarConfiguracao() {
    const c = config();
    const problemas = [];
    if (!MODOS.includes(c.modo)) problemas.push('PAGAMENTO_MODO deve ser "mercadopago" ou "demonstracao".');
    if (c.producao && c.modo !== 'mercadopago') {
        problemas.push('Em produção, PAGAMENTO_MODO precisa ser "mercadopago": o modo demonstração aprova compras sem cobrança.');
    }
    if (c.modo === 'mercadopago') {
        if (!mercadoPago.config().accessToken) problemas.push('Defina MERCADO_PAGO_ACCESS_TOKEN.');
        if (!c.webhookSecret) problemas.push('Defina MERCADO_PAGO_WEBHOOK_SECRET.');
        if (!c.urlDefinida) {
            problemas.push(c.producao
                ? 'Defina APP_PUBLIC_URL com a URL pública https do site.'
                : `APP_PUBLIC_URL não definida: o retorno do Mercado Pago vai para ${c.urlPublica} (sem https não há retorno automático).`);
        } else if (!/^https?:\/\/[^/\s?#]+$/i.test(c.urlDefinida)) {
            problemas.push('APP_PUBLIC_URL deve ser só a origem do site, como https://www.exemplo.com.br.');
        } else if (c.producao && !/^https:\/\//i.test(c.urlDefinida)) {
            problemas.push('APP_PUBLIC_URL precisa usar https em produção.');
        }
        if (c.expiracao && !mercadoPago.duracaoValida(c.expiracao)) {
            problemas.push('MERCADO_PAGO_EXPIRACAO deve ser uma duração ISO 8601, como PT30M ou P1D.');
        }
    }
    if (problemas.length && c.producao) {
        throw new Error(`Configuração de pagamento inválida em produção: ${problemas.join(' ')} (veja .env.example).`);
    }
    return problemas;
}

// ---------- Logs sem dados sensíveis (nunca token, header Authorization, CPF ou dados do pagador) ----------
function resumoErro(err) {
    if (!err) return {};
    return {
        erro: err.name || 'Error',
        status: err.status || undefined,
        codigo: err.codigo || err.code || undefined,
        mensagem: String(err.message || '').slice(0, 200)
    };
}

function logErro(contexto, err, extras = {}) {
    console.error(`❌ [pagamento] ${contexto}`, JSON.stringify({ ...extras, ...resumoErro(err) }));
}

// ---------- Checkout ----------
const expirada = t => !!t.expira_em && new Date(t.expira_em).getTime() <= Date.now();
// Order criada e ainda não encerrada (status desconhecido conta como aberta: confere antes de abrir outra).
const aberta = t => !!t && !!t.mp_order_id && (t.status_mp == null || Pagamento.ATIVOS.includes(t.status_mp));

function urlRetorno(id_pedido) {
    return `${config().urlPublica}/pagamento/retorno?pedido=${id_pedido}`;
}

// Cria (ou recupera, pela mesma chave de idempotência) a order da tentativa e devolve o checkout_url.
async function abrirCheckout({ id_pagamento, id_cliente, email }) {
    const tentativa = await Pagamento.buscarPorId(id_pagamento);
    if (!tentativa) throw new Error('Tentativa de pagamento não encontrada.');
    if (tentativa.mp_order_id && mercadoPago.checkoutUrlValida(tentativa.checkout_url)) {
        return { checkout_url: tentativa.checkout_url, id_pedido: tentativa.id_pedido };
    }

    const { pedido, itens } = await Pedido.buscarComItens(tentativa.id_pedido, id_cliente);
    if (!pedido) throw new Error('Pedido não encontrado para este cliente.');
    const itensMp = itens.map(i => ({ titulo: i.titulo, centavos: Pedido.centavosDoItem(Number(i.preco_unitario)) }));
    if (itensMp.reduce((soma, i) => soma + i.centavos, 0) !== tentativa.valor_centavos) {
        throw new Error('O valor do pedido não confere com a tentativa de pagamento.');
    }
    const corpo = mercadoPago.montarCorpoOrder({
        id_pedido: pedido.id_pedido,
        externalReference: tentativa.external_reference,
        itens: itensMp,
        email,
        urlRetorno: urlRetorno(pedido.id_pedido),
        expiracao: config().expiracao
    });

    try {
        const order = await mercadoPago.criarOrder({ corpo, chave: tentativa.chave_idempotencia });
        await Pagamento.registrarOrder(tentativa.id_pagamento, {
            mp_order_id: order.id,
            checkout_url: order.checkout_url,
            status_mp: order.status,
            status_detail_mp: order.status_detail,
            expira_em: mercadoPago.calcularExpiracao(order)
        });
        return { checkout_url: order.checkout_url, id_pedido: pedido.id_pedido };
    } catch (err) {
        await Pagamento.registrarErro(tentativa.id_pagamento, `${err.name}: ${err.message}`).catch(() => {});
        throw err;
    }
}

// Abre uma tentativa nova com o pedido travado. Se outro clique já abriu uma, reaproveita.
async function novaTentativa(id_pedido, anterior) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const pedido = await Pedido.bloquear(conn, id_pedido);
        if (!pedido || pedido.status !== 'pendente') {
            await conn.rollback();
            return { status: pedido ? pedido.status : null };
        }
        const tentativas = await Pagamento.listarDoPedido(conn, id_pedido);
        const ultima = tentativas[tentativas.length - 1];
        if (ultima && (!anterior || ultima.id_pagamento !== anterior.id_pagamento)) {
            await conn.commit();
            return { status: 'pendente', id_pagamento: ultima.id_pagamento };
        }
        const valor_centavos = anterior ? anterior.valor_centavos : await Pedido.totalCentavos(conn, id_pedido);
        const id_pagamento = await Pagamento.criarTentativa(conn, {
            id_pedido, tentativa: (ultima ? ultima.tentativa : 0) + 1, chave: crypto.randomUUID(),
            external_reference: `pedido-${id_pedido}`, valor_centavos
        });
        await conn.commit();
        return { status: 'pendente', id_pagamento };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// "Pagar agora" de um pedido pendente. Resultado: { tipo: 'checkout', checkout_url }
// | { tipo: 'status', status } (o pedido não está mais pendente) | { tipo: 'nao_encontrado' }.
async function retomarPagamento({ id_pedido, id_cliente, email }) {
    const status = await Pedido.buscarStatus(id_pedido, id_cliente);
    if (!status) return { tipo: 'nao_encontrado' };
    if (status !== 'pendente') return { tipo: 'status', status };

    let ultima = await Pagamento.ultimaDoPedido(id_pedido);
    if (aberta(ultima)) {
        const r = await conciliar(ultima.mp_order_id);
        if (r.statusPedido && r.statusPedido !== 'pendente') return { tipo: 'status', status: r.statusPedido };
        ultima = await Pagamento.ultimaDoPedido(id_pedido);
    }

    // Order ainda não criada (erro/timeout antes): mesma tentativa, mesma chave → mesma order no MP.
    if (ultima && !ultima.mp_order_id) {
        return { tipo: 'checkout', ...(await abrirCheckout({ id_pagamento: ultima.id_pagamento, id_cliente, email })) };
    }
    // Tentativa ainda em aberto: reaproveita o checkout.
    if (aberta(ultima) && !expirada(ultima) && mercadoPago.checkoutUrlValida(ultima.checkout_url)) {
        return { tipo: 'checkout', checkout_url: ultima.checkout_url, id_pedido };
    }
    // Recusada, cancelada ou expirada: tenta encerrar a antiga (se ainda aberta) e abre outra.
    if (aberta(ultima)) {
        await mercadoPago.cancelarOrder(ultima.mp_order_id, crypto.randomUUID())
            .catch(err => logErro('cancelar order expirada', err, { id_pedido, mp_order_id: ultima.mp_order_id }));
    }
    const nova = await novaTentativa(id_pedido, ultima);
    if (nova.status !== 'pendente') return nova.status ? { tipo: 'status', status: nova.status } : { tipo: 'nao_encontrado' };
    return { tipo: 'checkout', ...(await abrirCheckout({ id_pagamento: nova.id_pagamento, id_cliente, email })) };
}

// Volta do Checkout Pro (ou "Verificar pagamento"): acha a tentativa do PRÓPRIO cliente e confere
// no Mercado Pago. Parâmetros como status=approved são ignorados.
async function confirmarRetorno({ id_pedido, order_id, id_cliente }) {
    let alvo = null;
    if (order_id && mercadoPago.idOrderValido(order_id)) {
        alvo = await Pagamento.buscarDoCliente({ mp_order_id: order_id, id_cliente });
    }
    if (!alvo && id_pedido) alvo = await Pagamento.buscarDoCliente({ id_pedido, id_cliente });

    const pedidoAlvo = alvo ? alvo.id_pedido : id_pedido;
    let status = alvo ? alvo.status_pedido : (id_pedido ? await Pedido.buscarStatus(id_pedido, id_cliente) : null);
    if (!status) return null;
    if (alvo && alvo.mp_order_id && status === 'pendente') {
        try {
            const r = await conciliar(alvo.mp_order_id);
            if (r.statusPedido) status = r.statusPedido;
        } catch (err) {
            logErro('conciliar no retorno', err, { id_pedido: pedidoAlvo, mp_order_id: alvo.mp_order_id });
        }
    }
    return { id_pedido: pedidoAlvo, status };
}

module.exports = {
    config,
    modo,
    cobrancaOnline,
    webhookSecret,
    validarConfiguracao,
    logErro,
    abrirCheckout,
    retomarPagamento,
    confirmarRetorno
};
