// Mercado Pago falso (mesma interface do driver real de app/helpers/mercadoPago.js).
// Orders em memória, idempotência por chave e falhas programáveis por operação:
//   'timeout_perdido' → o MP cria a order, mas a resposta se perde (tempo esgotado)
//   'timeout'         → sem resposta, nada é criado
//   'erro500'         → HTTP 500
function criarMercadoPagoFalso() {
    const orders = new Map();
    const porChave = new Map();
    const chamadas = { criar: [], buscar: [], cancelar: [], reembolsar: [] };
    const falhas = { criar: [], buscar: [], cancelar: [], reembolsar: [] };
    let seq = 1;
    let checkoutUrlForcada = null;

    const copia = o => structuredClone(o);
    const erroHttp = status => Object.assign(new Error(`HTTP ${status}`), { status });
    const erroTimeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'MPConnectionError', status: 0 });

    function falhaDa(operacao) {
        const f = falhas[operacao].shift();
        if (f === 'erro500') throw erroHttp(500);
        if (f === 'timeout') throw erroTimeout();
        return f || null;
    }

    function pegar(id) {
        const o = orders.get(id);
        if (!o) throw erroHttp(404);
        return o;
    }

    return {
        nome: 'falso',
        orders,
        chamadas,
        falharProxima(operacao, tipo, vezes = 1) {
            for (let i = 0; i < vezes; i++) falhas[operacao].push(tipo);
        },
        forcarCheckoutUrl(url) { checkoutUrlForcada = url; },

        async criar({ corpo, chave }) {
            chamadas.criar.push({ corpo: copia(corpo), chave });
            const falha = falhaDa('criar');
            let o = porChave.has(chave) ? orders.get(porChave.get(chave)) : null;
            if (!o) {
                const id = `ORDTST${String(seq++).padStart(8, '0')}`;
                o = {
                    id, type: 'online', processing_mode: 'manual', status: 'created', status_detail: 'created',
                    external_reference: corpo.external_reference, total_amount: corpo.total_amount, total_paid_amount: '0.00',
                    currency: 'BRL', country_code: 'BRA', expiration_time: corpo.expiration_time || 'P1D',
                    created_date: new Date().toISOString(),
                    checkout_url: checkoutUrlForcada || `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${id}`,
                    items: corpo.items, config: corpo.config, payer: corpo.payer
                };
                orders.set(id, o);
                porChave.set(chave, id);
            }
            if (falha === 'timeout_perdido') throw erroTimeout();
            return copia(o);
        },

        async buscar({ id }) {
            chamadas.buscar.push(id);
            falhaDa('buscar');
            return copia(pegar(id));
        },

        async cancelar({ id, chave }) {
            chamadas.cancelar.push({ id, chave });
            falhaDa('cancelar');
            const o = pegar(id);
            if (o.status === 'created') Object.assign(o, { status: 'canceled', status_detail: 'canceled' });
            return copia(o);
        },

        async reembolsar({ id, chave }) {
            chamadas.reembolsar.push({ id, chave });
            falhaDa('reembolsar');
            const o = pegar(id);
            Object.assign(o, { status: 'refunded', status_detail: 'refunded' });
            return copia(o);
        },

        // ---- Simulação do que acontece no Mercado Pago ----
        definirEstado(id, campos) {
            Object.assign(pegar(id), campos);
        },
        aprovar(id, metodo = { id: 'master', type: 'credit_card' }) {
            const o = pegar(id);
            Object.assign(o, {
                status: 'processed', status_detail: 'accredited', total_paid_amount: o.total_amount,
                transactions: { payments: [{ id: `PAY${id.slice(-6)}`, status: 'processed', status_detail: 'accredited',
                    amount: o.total_amount, payment_method: metodo }] }
            });
        },
        ultimaOrder() {
            return [...orders.values()].pop();
        }
    };
}

module.exports = { criarMercadoPagoFalso };
