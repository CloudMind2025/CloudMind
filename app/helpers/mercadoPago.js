// Cliente da Orders API do Mercado Pago (Checkout Pro). Só roda no servidor:
// o Access Token nunca sai daqui, e nada deste módulo vai para as views.

const REGEX_DURACAO = /^P(?=\d|T\d)(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
const REGEX_ID_ORDER = /^[A-Za-z0-9_-]{1,64}$/;
const PAUSA_RETENTATIVA_MS = 250;

class ErroMercadoPago extends Error {
    constructor(mensagem, { status = 0, codigo = '', transitorio = false } = {}) {
        super(mensagem);
        this.name = 'ErroMercadoPago';
        this.status = status;
        this.codigo = codigo;
        this.transitorio = transitorio;
    }
}

// ---------- Configuração ----------
function config() {
    const env = process.env;
    const timeout = Number.parseInt(env.MERCADO_PAGO_TIMEOUT_MS, 10);
    return {
        accessToken: String(env.MERCADO_PAGO_ACCESS_TOKEN || '').trim(),
        timeoutMs: Number.isInteger(timeout) ? Math.min(Math.max(timeout, 1000), 20000) : 8000
    };
}

// ---------- Dinheiro (sempre em centavos inteiros; texto só na borda com o MP) ----------
function centavosParaTexto(centavos) {
    if (!Number.isSafeInteger(centavos) || centavos < 0) {
        throw new ErroMercadoPago('Valor em centavos inválido.', { codigo: 'valor_invalido' });
    }
    return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

function textoParaCentavos(valor) {
    const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(String(valor == null ? '' : valor).trim());
    return m ? Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0')) : NaN;
}

// ---------- Validações ----------
function checkoutUrlValida(url) {
    try {
        const u = new URL(String(url));
        return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
               (u.hostname === 'mercadopago.com.br' || u.hostname.endsWith('.mercadopago.com.br'));
    } catch (_) {
        return false;
    }
}

function idOrderValido(id) {
    return typeof id === 'string' && REGEX_ID_ORDER.test(id);
}

function duracaoValida(texto) {
    return REGEX_DURACAO.test(String(texto || ''));
}

// Data de expiração da order a partir de expiration_time (duração ISO 8601) e created_date.
function calcularExpiracao(order) {
    const m = REGEX_DURACAO.exec(String((order && order.expiration_time) || ''));
    if (!m) return null;
    const [, d, h, min, s] = m.map(v => Number(v || 0));
    const inicio = Date.parse((order && order.created_date) || '');
    const base = Number.isNaN(inicio) ? Date.now() : inicio;
    return new Date(base + (((d * 24 + h) * 60 + min) * 60 + s) * 1000);
}

// ---------- Corpo da order ----------
// itens: [{ titulo, centavos }] já com desconto; itens de R$ 0,00 (cupom) não vão para o MP.
function montarCorpoOrder({ id_pedido, externalReference, itens, email, urlRetorno, expiracao }) {
    const cobraveis = (itens || []).filter(i => i.centavos > 0);
    if (!cobraveis.length || cobraveis.some(i => !Number.isSafeInteger(i.centavos))) {
        throw new ErroMercadoPago('Pedido sem valor a cobrar.', { codigo: 'sem_valor' });
    }
    const total = cobraveis.reduce((soma, i) => soma + i.centavos, 0);
    const online = { success_url: urlRetorno, failure_url: urlRetorno, pending_url: urlRetorno };
    if (/^https:\/\//i.test(urlRetorno)) online.auto_return = 'approved';

    const corpo = {
        type: 'online',
        processing_mode: 'manual',
        external_reference: externalReference,
        total_amount: centavosParaTexto(total),
        description: `CloudMind - pedido #${id_pedido}`,
        items: cobraveis.map(i => ({
            title: String(i.titulo || 'Produto digital').slice(0, 250),
            unit_price: centavosParaTexto(i.centavos),
            quantity: 1
        })),
        config: { online }
    };
    if (email) corpo.payer = { email: String(email) };
    if (expiracao && duracaoValida(expiracao)) corpo.expiration_time = expiracao;
    return corpo;
}

// ---------- Drivers ----------
function normalizarErro(err) {
    if (err instanceof ErroMercadoPago) return err;
    const status = Number(err && err.status) || 0;
    const conexao = !status || (err && (err.name === 'MPConnectionError' || err.error === 'connection_error'));
    const transitorio = typeof (err && err.transitorio) === 'boolean'
        ? err.transitorio
        : conexao || status === 409 || status === 429 || status >= 500;
    return new ErroMercadoPago(
        status ? `Mercado Pago respondeu HTTP ${status}.` : 'Sem resposta do Mercado Pago (conexão ou tempo esgotado).',
        { status, codigo: String((err && (err.codigo || err.error || err.name)) || ''), transitorio }
    );
}

// SDK oficial. Um MercadoPagoConfig novo por chamada: o cliente Order grava as opções
// da requisição (inclusive a chave de idempotência) no config que recebe, então um config
// compartilhado vazaria a chave de uma compra para outra em requisições simultâneas.
// As retentativas ficam com este módulo (retries: 0 no SDK).
function criarDriverSdk(accessToken) {
    const { MercadoPagoConfig, Order } = require('mercadopago');
    const cliente = timeoutMs => new Order(new MercadoPagoConfig({ accessToken, options: { timeout: timeoutMs, retries: 0 } }));
    const limpar = resposta => {
        if (resposta && typeof resposta === 'object') delete resposta.api_response;
        return resposta;
    };
    return {
        nome: 'sdk',
        async criar({ corpo, chave, timeoutMs }) {
            return limpar(await cliente(timeoutMs).create({ body: corpo, requestOptions: { idempotencyKey: chave } }));
        },
        async buscar({ id, timeoutMs }) {
            return limpar(await cliente(timeoutMs).get({ id }));
        },
        async cancelar({ id, chave, timeoutMs }) {
            return limpar(await cliente(timeoutMs).cancel({ id, requestOptions: { idempotencyKey: chave } }));
        },
        async reembolsar({ id, chave, corpo, timeoutMs }) {
            return limpar(await cliente(timeoutMs).refund({ id, body: corpo, requestOptions: { idempotencyKey: chave } }));
        }
    };
}

let driverAtual = null;
function definirDriver(driver) {
    driverAtual = driver || null;
}

function driver() {
    if (driverAtual) return driverAtual;
    const { accessToken } = config();
    if (!accessToken) {
        throw new ErroMercadoPago('Mercado Pago não configurado: defina MERCADO_PAGO_ACCESS_TOKEN.', { codigo: 'nao_configurado' });
    }
    return criarDriverSdk(accessToken);
}

// Uma retentativa em falha transitória, com os MESMOS parâmetros (mesma chave de idempotência).
async function chamar(operacao, params) {
    const { timeoutMs } = config();
    const d = driver();
    for (let tentativa = 1; ; tentativa++) {
        try {
            return await d[operacao]({ ...params, timeoutMs });
        } catch (bruto) {
            const err = normalizarErro(bruto);
            if (!err.transitorio || tentativa >= 2) throw err;
            await new Promise(resolve => setTimeout(resolve, PAUSA_RETENTATIVA_MS));
        }
    }
}

// ---------- Operações ----------
async function criarOrder({ corpo, chave }) {
    if (!chave) throw new ErroMercadoPago('Chave de idempotência ausente.', { codigo: 'sem_chave' });
    const order = await chamar('criar', { corpo, chave });
    if (!order || !idOrderValido(String(order.id || ''))) {
        throw new ErroMercadoPago('Resposta do Mercado Pago sem id de order.', { codigo: 'resposta_invalida' });
    }
    if (!checkoutUrlValida(order.checkout_url)) {
        throw new ErroMercadoPago('checkout_url fora do domínio do Mercado Pago.', { codigo: 'checkout_url_invalida' });
    }
    return order;
}

async function buscarOrder(id) {
    if (!idOrderValido(id)) throw new ErroMercadoPago('Id de order inválido.', { codigo: 'id_invalido' });
    const order = await chamar('buscar', { id });
    if (!order || String(order.id) !== id) {
        throw new ErroMercadoPago('Resposta do Mercado Pago não corresponde à order consultada.', { codigo: 'resposta_invalida' });
    }
    return order;
}

async function cancelarOrder(id, chave) {
    if (!idOrderValido(id)) throw new ErroMercadoPago('Id de order inválido.', { codigo: 'id_invalido' });
    return chamar('cancelar', { id, chave });
}

// Não é usado por nenhuma rota: pelo Modelo A, estornos são feitos no painel do Mercado Pago
// e chegam ao CloudMind pelo Webhook/conciliação.
async function reembolsarOrder(id, chave, corpo) {
    if (!idOrderValido(id)) throw new ErroMercadoPago('Id de order inválido.', { codigo: 'id_invalido' });
    return chamar('reembolsar', { id, chave, corpo });
}

module.exports = {
    ErroMercadoPago,
    config,
    definirDriver,
    centavosParaTexto,
    textoParaCentavos,
    checkoutUrlValida,
    idOrderValido,
    duracaoValida,
    calcularExpiracao,
    montarCorpoOrder,
    criarOrder,
    buscarOrder,
    cancelarOrder,
    reembolsarOrder
};
