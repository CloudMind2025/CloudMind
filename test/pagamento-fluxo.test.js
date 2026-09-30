const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');

const TOKEN = 'TOKEN-FALSO-QUE-NUNCA-PODE-APARECER';
const SEGREDO = 'segredo-webhook-que-nunca-pode-aparecer';
Object.assign(process.env, {
    NODE_ENV: 'test',
    PAGAMENTO_MODO: 'mercadopago',
    MERCADO_PAGO_ACCESS_TOKEN: TOKEN,
    MERCADO_PAGO_WEBHOOK_SECRET: SEGREDO,
    APP_PUBLIC_URL: 'https://loja.cloudmind.teste',
    MERCADO_PAGO_EXPIRACAO: ''
});

// Tudo o que o app escreve no console fica guardado para conferir que nada sensível vazou.
const saidas = [];
for (const metodo of ['log', 'warn', 'error']) {
    const original = console[metodo];
    console[metodo] = (...args) => {
        saidas.push(args.map(a => (typeof a === 'string' ? a : (a && a.stack) || JSON.stringify(a))).join(' '));
        if (process.env.DEBUG_TESTES) original(...args);
    };
}

const { criarBancoLoja } = require('./apoio/bancoLoja');
const { criarInstancia, RAIZ } = require('./apoio/instancia');
const { criarMercadoPagoFalso } = require('./apoio/mercadoPagoFalso');
const { criarDriverMemoria } = require('../app/helpers/armazenamento');
const cupons = require('../app/helpers/cupons');

const ADMIN = { id_usuario: 1, nome: 'CloudMind Admin', tipo: 'admin', foto: null };
const cliente = id => ({ id_usuario: id, nome: `Cliente ${id}`, tipo: 'cliente', email: `cliente${id}@teste.com` });
const HOJE = cupons.hoje();
const emDias = n => { const d = new Date(`${HOJE}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const banco = criarBancoLoja();
const E = () => banco.estado;
E().hojeBanco = HOJE;
[[1, 'CloudMind Admin'], [7, 'João Martins'], [8, 'Rodrigo Vendas']]
    .forEach(([id, nome]) => E().usuarios.set(id, { nome, email: `u${id}@teste.com`, status: 'ativo', foto: null }));
for (let id = 20; id <= 45; id++) E().usuarios.set(id, { nome: `Cliente ${id}`, email: `cliente${id}@teste.com`, status: 'ativo', foto: null });
E().admins.add(1);
E().criadores.add(7); E().criadores.add(8);
const PRODUTOS = {
    curso:    [201, 7, 'Curso de Node', 49.9],
    ebook:    [202, 8, 'Ebook de Vendas', 30],
    template: [203, 7, 'Template Canva', 10],
    planilha: [204, 7, 'Planilha Financeira', 25],
    icones:   [205, 8, 'Pacote de Ícones', 15],
    fontes:   [206, 7, 'Fontes Premium', 20]
};
Object.values(PRODUTOS).forEach(([id, criador, titulo, preco]) =>
    E().produtos.set(id, { id_produto: id, id_criador: criador, titulo, preco, tipo: 'curso', status: 'ativo', imagem: null, arquivo: null }));
const P = Object.fromEntries(Object.entries(PRODUTOS).map(([k, v]) => [k, v[0]]));

let app;
let mp;
const form = campos => new URLSearchParams(campos);

function colocarNoCarrinho(id_cliente, ids, precoNoCarrinho = null) {
    E().clientes.add(id_cliente);
    let c = [...E().carrinhos.values()].find(x => x.id_cliente === id_cliente && x.status_carrinho === 'aberto');
    if (!c) { const id = E().seq.carrinho++; c = { id_carrinho: id, id_cliente, status_carrinho: 'aberto', id_cupom: null }; E().carrinhos.set(id, c); }
    ids.forEach(id => E().itensCarrinho.push({ id_carrinho: c.id_carrinho, id_produto: id,
        preco_unitario: precoNoCarrinho == null ? E().produtos.get(id).preco : precoNoCarrinho }));
}
const finalizar = u => app.pedir('/carrinho/finalizar', { usuario: u, metodo: 'POST' });
const pagar = (u, id_pedido) => app.pedir('/pedido/pagar', { usuario: u, metodo: 'POST', corpo: form({ id_pedido: String(id_pedido) }) });
const pedido = id => E().pedidos.find(p => p.id_pedido === id);
const tentativas = id => E().pagamentos.filter(pg => pg.id_pedido === id).sort((a, b) => a.tentativa - b.tentativa);
const idNaUrl = local => Number(new URL(local, 'http://x').searchParams.get('id'));
const downloads = async u => (await app.pedir('/meusdowloads', { usuario: u })).corpo;
const itensNosDownloads = (html, id) => html.split(`<h2><a href="/paginnerprod?id=${id}">`).length - 1;
const criarCupom = campos => app.pedir('/adm/cupons', { usuario: ADMIN, metodo: 'POST', corpo: form({
    tipo_desconto: 'percentual', data_inicio: HOJE, data_fim: emDias(30), ilimitado: 'on', ativo: 'on', ...campos }) });
const aplicarCupom = (u, codigo) => app.pedir('/carrinho/cupom', { usuario: u, metodo: 'POST', corpo: form({ codigo }) });

function webhook(orderId, { secret = SEGREDO, assinar = true, requestId = crypto.randomUUID(), idNaQuery = orderId, corpo } = {}) {
    const ts = String(Date.now());
    const manifest = `id:${String(idNaQuery).toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    const headers = { 'content-type': 'application/json', 'x-request-id': requestId };
    if (assinar) headers['x-signature'] = `ts=${ts},v1=${v1}`;
    const body = corpo || { action: 'order.processed', api_version: 'v1', type: 'order', live_mode: false, data: { id: orderId } };
    return app.pedir(`/webhooks/mercadopago?data.id=${encodeURIComponent(idNaQuery)}&type=order`,
        { metodo: 'POST', corpo: JSON.stringify(body), headers });
}

// Cria um pedido pendente pelo checkout real da aplicação e devolve o pedido e a order do MP.
async function pedidoPendente(u, produtos) {
    colocarNoCarrinho(u.id_usuario, produtos);
    const r = await finalizar(u);
    assert.equal(r.status, 303, `esperava redirect ao Checkout Pro, veio ${r.status} ${r.local}`);
    const order = mp.ultimaOrder();
    assert.equal(r.local, order.checkout_url);
    const pg = E().pagamentos.find(x => x.mp_order_id === order.id);
    return { id_pedido: pg.id_pedido, order, pagamento: pg };
}

test.before(async () => {
    mp = criarMercadoPagoFalso();
    app = await criarInstancia({ banco, driver: criarDriverMemoria(), mercadoPago: mp });
});
test.after(async () => { await app.fechar(); });

// ---------------------------------------------------------------- Checkout
test('checkout: pedido pendente com preços do banco, chave gravada antes da chamada e redirect ao Checkout Pro', async () => {
    const u = cliente(20);
    colocarNoCarrinho(20, [P.curso, P.ebook], 0.01); // preço antigo/adulterado no carrinho é ignorado
    const criarOriginal = mp.criar;
    let chaveJaGravada = null;
    mp.criar = async args => {
        chaveJaGravada = E().pagamentos.some(pg => pg.chave_idempotencia === args.chave && pg.mp_order_id === null);
        return criarOriginal(args);
    };
    const r = await finalizar(u);
    mp.criar = criarOriginal;

    assert.equal(r.status, 303);
    const order = mp.ultimaOrder();
    assert.equal(r.local, order.checkout_url);
    assert.match(r.local, /^https:\/\/www\.mercadopago\.com\.br\//);
    assert.equal(chaveJaGravada, true, 'a chave de idempotência é gravada antes de chamar o MP');

    const [pg] = E().pagamentos.filter(x => x.mp_order_id === order.id);
    const pe = pedido(pg.id_pedido);
    assert.equal(pe.status, 'pendente');
    assert.equal(pe.data_pagamento, null);
    assert.deepEqual(E().itensPedido.filter(i => i.id_pedido === pe.id_pedido).map(i => [i.id_produto, i.preco_unitario]).sort(),
        [[P.curso, 49.9], [P.ebook, 30]]);
    assert.equal(pg.tentativa, 1);
    assert.match(pg.chave_idempotencia, /^[0-9a-f-]{36}$/);
    assert.equal(pg.external_reference, `pedido-${pe.id_pedido}`);
    assert.equal(pg.valor_centavos, 7990);
    assert.equal(pg.status_mp, 'created');

    const { corpo, chave } = mp.chamadas.criar.at(-1);
    assert.equal(chave, pg.chave_idempotencia);
    assert.equal(corpo.type, 'online');
    assert.equal(corpo.processing_mode, 'manual');
    assert.equal(corpo.total_amount, '79.90');
    assert.deepEqual(corpo.items.map(i => i.unit_price), ['49.90', '30.00']);
    assert.equal(corpo.external_reference, pg.external_reference);
    assert.equal(corpo.payer.email, 'cliente20@teste.com');
    assert.equal(corpo.config.online.success_url, `https://loja.cloudmind.teste/pagamento/retorno?pedido=${pe.id_pedido}`);
    assert.equal(corpo.config.online.auto_return, 'approved');

    assert.equal(E().itensCarrinho.filter(i => i.id_carrinho === [...E().carrinhos.values()].find(c => c.id_cliente === 20).id_carrinho).length, 0);
    assert.doesNotMatch(await downloads(u), /Curso de Node/, 'pendente não libera download');
    const detalhe = (await app.pedir(`/detalhepedido?id=${pe.id_pedido}`, { usuario: u })).corpo;
    assert.match(detalhe, /Pagar agora/);
    assert.match(detalhe, /Verificar pagamento/);
    assert.match(detalhe, /Aguardando pagamento/);
    assert.doesNotMatch(detalhe, /Compra concluída/);
    assert.doesNotMatch(detalhe, /demonstração/i);
    const carrinho = (await app.pedir('/carrinho', { usuario: u })).corpo;
    assert.doesNotMatch(carrinho + detalhe, new RegExp(`${TOKEN}|${SEGREDO}`), 'credenciais nunca vão para o HTML');
});

test('cupom: desconto entra no pedido e no total enviado ao Mercado Pago', async () => {
    await criarCupom({ codigo: 'JOAO10', id_criador: '7', valor_desconto: '10' });
    const u = cliente(21);
    colocarNoCarrinho(21, [P.planilha, P.ebook]);
    assert.equal((await aplicarCupom(u, 'JOAO10')).local, '/carrinho#cupom');
    const carrinho = (await app.pedir('/carrinho', { usuario: u })).corpo;
    assert.match(carrinho, /Você será direcionado ao Mercado Pago/);
    const r = await finalizar(u);
    assert.equal(r.status, 303);
    const { corpo } = mp.chamadas.criar.at(-1);
    assert.equal(corpo.total_amount, '52.50');
    assert.deepEqual(corpo.items.map(i => i.unit_price).sort(), ['22.50', '30.00']);
    const pg = E().pagamentos.find(x => x.mp_order_id === mp.ultimaOrder().id);
    assert.equal(pg.valor_centavos, 5250);
    assert.ok(E().usos.some(x => x.id_pedido === pg.id_pedido && x.id_cliente === 21), 'uso do cupom reservado no pedido');
});

// ---------------------------------------------------------------- R$ 0,00
test('R$ 0,00: cupom de 100% → pedido pago na hora, sem Mercado Pago', async () => {
    await criarCupom({ codigo: 'GRATIS100', id_criador: '7', valor_desconto: '100' });
    const u = cliente(22);
    colocarNoCarrinho(22, [P.template]);
    await aplicarCupom(u, 'GRATIS100');
    const chamadasAntes = mp.chamadas.criar.length;
    const ordersAntes = mp.orders.size;
    const tentativasAntes = E().pagamentos.length;

    const r = await finalizar(u);
    assert.equal(r.status, 302);
    assert.match(r.local, /^\/detalhepedido\?id=\d+$/);
    const pe = pedido(idNaUrl(r.local));
    assert.equal(pe.status, 'pago');
    assert.ok(pe.data_pagamento instanceof Date);
    assert.equal(mp.chamadas.criar.length, chamadasAntes, 'nenhuma chamada ao Mercado Pago');
    assert.equal(mp.orders.size, ordersAntes, 'nenhuma order');
    assert.equal(E().pagamentos.length, tentativasAntes, 'nenhuma tentativa de pagamento');
    assert.ok(E().usos.some(x => x.id_pedido === pe.id_pedido), 'cupom consumido');
    assert.equal(E().itensPedido.find(i => i.id_pedido === pe.id_pedido).preco_unitario, 0);

    const detalhe = (await app.pedir(r.local, { usuario: u })).corpo;
    assert.match(detalhe, /Compra concluída!/);
    assert.match(detalhe, /Sem cobrança \(pedido gratuito\)/);
    assert.match(await downloads(u), /Template Canva/, 'download liberado');
});

test('R$ 0,01 (cupom quase total) vai para o Mercado Pago', async () => {
    await criarCupom({ codigo: 'QUASE', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '9,99' });
    const u = cliente(23);
    colocarNoCarrinho(23, [P.template]);
    await aplicarCupom(u, 'QUASE');
    const r = await finalizar(u);
    assert.equal(r.status, 303);
    assert.equal(mp.chamadas.criar.at(-1).corpo.total_amount, '0.01');
    assert.equal(pedido(E().pagamentos.at(-1).id_pedido).status, 'pendente');
});

test('valores ausentes ou inválidos nunca viram pedido gratuito', () => {
    const Pedido = require(path.join(RAIZ, 'app', 'models', 'Pedido'));
    const mercadoPago = require(path.join(RAIZ, 'app', 'helpers', 'mercadoPago'));
    for (const invalido of [null, undefined, NaN, '10.00', '', -1, Infinity]) {
        assert.throws(() => Pedido.centavosDoItem(invalido), /Valor de item inválido/, String(invalido));
    }
    assert.equal(Pedido.centavosDoItem(0), 0);
    assert.equal(Pedido.centavosDoItem(29.9), 2990);
    assert.equal(Pedido.centavosDoItem(0.1 + 0.2), 30);
    assert.throws(() => mercadoPago.montarCorpoOrder({ id_pedido: 1, externalReference: 'pedido-1', itens: [{ titulo: 'x', centavos: 0 }], urlRetorno: 'https://a.b' }), /sem valor/);
    assert.throws(() => mercadoPago.centavosParaTexto(NaN), /inválido/);
    assert.equal(mercadoPago.centavosParaTexto(1), '0.01');
    assert.equal(mercadoPago.textoParaCentavos('79.9'), 7990);
    assert.ok(Number.isNaN(mercadoPago.textoParaCentavos(undefined)));
});

// ---------------------------------------------------------------- Estados
test('aprovado (processed/accredited) via webhook → pago, data_pagamento e download liberado', async () => {
    const u = cliente(24);
    const { id_pedido, order } = await pedidoPendente(u, [P.curso]);
    mp.aprovar(order.id);
    const r = await webhook(order.id);
    assert.equal(r.status, 200);
    const pe = pedido(id_pedido);
    assert.equal(pe.status, 'pago');
    assert.ok(pe.data_pagamento instanceof Date);
    const [pg] = tentativas(id_pedido);
    assert.equal(pg.status_mp, 'processed');
    assert.equal(pg.status_detail_mp, 'accredited');
    assert.equal(pg.valor_pago_centavos, 4990);
    assert.equal(pg.metodo_pagamento, 'credit_card/master');
    assert.ok(pg.mp_payment_id);
    assert.ok(E().eventos.some(e => e.mp_resource_id === order.id && e.resultado === 'processado'));
    assert.match(await downloads(u), /Curso de Node/);
    const detalhe = (await app.pedir(`/detalhepedido?id=${id_pedido}`, { usuario: u })).corpo;
    assert.match(detalhe, /Mercado Pago · cartão de crédito/);
    assert.match(detalhe, /Aprovado/);
});

test('pendente (processing / action_required) → pedido continua pendente', async () => {
    const u = cliente(25);
    const { id_pedido, order } = await pedidoPendente(u, [P.curso]);
    for (const [status, status_detail] of [['processing', 'in_process'], ['action_required', 'waiting_payment']]) {
        mp.definirEstado(order.id, { status, status_detail });
        assert.equal((await webhook(order.id)).status, 200);
        assert.equal(pedido(id_pedido).status, 'pendente');
        assert.equal(tentativas(id_pedido)[0].status_mp, status);
    }
    assert.doesNotMatch(await downloads(u), /Curso de Node/);
});

test('recusado (failed) → não pago; "Pagar agora" abre nova tentativa com chave nova', async () => {
    const u = cliente(26);
    const { id_pedido, order } = await pedidoPendente(u, [P.curso]);
    mp.definirEstado(order.id, { status: 'failed', status_detail: 'rejected_by_issuer' });
    assert.equal((await webhook(order.id)).status, 200);
    assert.equal(pedido(id_pedido).status, 'pendente');

    const ordersAntes = mp.orders.size;
    const r = await pagar(u, id_pedido);
    assert.equal(r.status, 303);
    assert.equal(mp.orders.size, ordersAntes + 1);
    const [t1, t2] = tentativas(id_pedido);
    assert.equal(t2.tentativa, 2);
    assert.notEqual(t2.chave_idempotencia, t1.chave_idempotencia);
    assert.equal(r.local, t2.checkout_url);
    assert.notEqual(t2.mp_order_id, t1.mp_order_id);
    assert.equal(t2.valor_centavos, t1.valor_centavos);
});

test('tentativa em aberto: "Pagar agora" reaproveita o checkout sem criar outra order', async () => {
    const u = cliente(27);
    const { id_pedido, order } = await pedidoPendente(u, [P.curso]);
    const criarAntes = mp.chamadas.criar.length;
    const r = await pagar(u, id_pedido);
    assert.equal(r.status, 303);
    assert.equal(r.local, order.checkout_url);
    assert.equal(mp.chamadas.criar.length, criarAntes);
    assert.equal(tentativas(id_pedido).length, 1);
    assert.equal(mp.chamadas.buscar.at(-1), order.id, 'estado conferido no MP antes de reaproveitar');
});

// ---------------------------------------------------------------- Webhook
test('webhook: assinatura errada, ausente ou data.id trocado → 401 sem efeito; outro type → 200 ignorado', async () => {
    const u = cliente(28);
    const { id_pedido, order } = await pedidoPendente(u, [P.curso]);
    mp.aprovar(order.id);
    const eventosAntes = E().eventos.length;
    const buscasAntes = mp.chamadas.buscar.length;

    assert.equal((await webhook(order.id, { secret: 'segredo-errado' })).status, 401);
    assert.equal((await webhook(order.id, { assinar: false })).status, 401);
    const trocado = await webhook(order.id, { corpo: { type: 'order', action: 'order.processed', data: { id: 'ORDOUTRA' } } });
    assert.equal(trocado.status, 401);
    const outroTipo = await webhook(order.id, { corpo: { type: 'payment', action: 'payment.updated', data: { id: order.id } } });
    assert.equal(outroTipo.status, 200);

    assert.equal(pedido(id_pedido).status, 'pendente');
    assert.equal(E().eventos.length, eventosAntes, 'nada registrado');
    assert.equal(mp.chamadas.buscar.length, buscasAntes, 'o MP nem é consultado');

    assert.equal((await webhook(order.id)).status, 200);
    assert.equal(pedido(id_pedido).status, 'pago');
});

test('webhook duplicado e fora de ordem: nenhuma duplicação nem regressão', async () => {
    const u = cliente(29);
    const { id_pedido, order } = await pedidoPendente(u, [P.curso]);
    mp.aprovar(order.id);
    const requestId = crypto.randomUUID();
    assert.equal((await webhook(order.id, { requestId })).status, 200);
    const pagoEm = pedido(id_pedido).data_pagamento;

    const repetido = await webhook(order.id, { requestId });
    assert.equal(repetido.status, 200);
    assert.match(repetido.corpo, /duplicado/);
    assert.equal((await webhook(order.id)).status, 200); // reenvio com outro x-request-id
    assert.equal(pedido(id_pedido).data_pagamento, pagoEm);
    assert.equal(E().eventos.filter(e => e.x_request_id === requestId).length, 1);

    mp.definirEstado(order.id, { status: 'created', status_detail: 'created' }); // estado "antigo" chegando depois
    assert.equal((await webhook(order.id)).status, 200);
    assert.equal(pedido(id_pedido).status, 'pago', 'nunca volta de pago para pendente');
    assert.equal(itensNosDownloads(await downloads(u), P.curso), 1);
});

test('Mercado Pago fora do ar no webhook → 500 (o MP reenvia) e nada pela metade', async () => {
    const u = cliente(30);
    const { id_pedido, order } = await pedidoPendente(u, [P.curso]);
    mp.aprovar(order.id);
    mp.falharProxima('buscar', 'erro500', 2);
    const r = await webhook(order.id);
    assert.equal(r.status, 500);
    assert.equal(pedido(id_pedido).status, 'pendente');
    assert.equal(E().eventos.at(-1).resultado, 'erro');
    assert.equal((await webhook(order.id)).status, 200, 'reenvio depois processa');
    assert.equal(pedido(id_pedido).status, 'pago');
});

// ---------------------------------------------------------------- Concorrência e timeout
test('concorrência: dois POST simultâneos → 1 pedido, 1 tentativa, 1 order', async () => {
    const u = cliente(31);
    colocarNoCarrinho(31, [P.icones]);
    // Pior caso: os dois cliques passam da pré-validação (ambos veem o carrinho cheio) e só então
    // disputam a transação. Uma transação aberta aqui segura os dois até ambos chegarem nela.
    const segurar = await banco.pool.getConnection();
    await segurar.beginTransaction();
    const cliques = [finalizar(u), finalizar(u)];
    await new Promise(resolve => setTimeout(resolve, 150));
    await segurar.commit();
    const [r1, r2] = await Promise.all(cliques);

    const pedidos = E().pedidos.filter(p => p.id_cliente === 31);
    assert.equal(pedidos.length, 1);
    const id_pedido = pedidos[0].id_pedido;
    assert.equal(tentativas(id_pedido).length, 1);
    assert.equal([...mp.orders.values()].filter(o => o.external_reference === `pedido-${id_pedido}`).length, 1);
    const destinos = [r1, r2].map(r => r.local);
    assert.ok(destinos.includes(tentativas(id_pedido)[0].checkout_url));
    assert.ok(destinos.includes(`/detalhepedido?id=${id_pedido}`), `o segundo clique vai para o pedido que já existe: ${destinos}`);

    // Sem forçar a ordem: continua 1 pedido só (o segundo pode ver o carrinho já vazio).
    const u2 = cliente(43);
    colocarNoCarrinho(43, [P.icones]);
    await Promise.all([finalizar(u2), finalizar(u2), finalizar(u2)]);
    const deles = E().pedidos.filter(p => p.id_cliente === 43);
    assert.equal(deles.length, 1);
    assert.equal(tentativas(deles[0].id_pedido).length, 1);
    assert.equal([...mp.orders.values()].filter(o => o.external_reference === `pedido-${deles[0].id_pedido}`).length, 1);
});

test('timeout: resposta perdida → retry com a MESMA chave → mesma order', async () => {
    const u = cliente(32);
    colocarNoCarrinho(32, [P.icones]);
    const antes = mp.chamadas.criar.length;
    mp.falharProxima('criar', 'timeout_perdido');
    const r = await finalizar(u);
    assert.equal(r.status, 303);
    const chamadas = mp.chamadas.criar.slice(antes);
    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[0].chave, chamadas[1].chave);
    const id_pedido = E().pedidos.filter(p => p.id_cliente === 32)[0].id_pedido;
    assert.equal([...mp.orders.values()].filter(o => o.external_reference === `pedido-${id_pedido}`).length, 1);
    assert.equal(r.local, tentativas(id_pedido)[0].checkout_url);
});

test('timeout persistente: pedido fica reservado e "Pagar agora" recupera a mesma order', async () => {
    const u = cliente(33);
    colocarNoCarrinho(33, [P.fontes]);
    const antes = mp.chamadas.criar.length;
    mp.falharProxima('criar', 'timeout_perdido', 2);
    const r = await finalizar(u);
    assert.equal(r.status, 302);
    const id_pedido = idNaUrl(r.local);
    const [t] = tentativas(id_pedido);
    assert.equal(t.mp_order_id, null);
    assert.ok(t.ultimo_erro);
    assert.match((await app.pedir(r.local, { usuario: u })).corpo, /não conseguimos abrir o pagamento/);

    const r2 = await pagar(u, id_pedido);
    assert.equal(r2.status, 303);
    const chaves = mp.chamadas.criar.slice(antes).map(c => c.chave);
    assert.equal(chaves.length, 3);
    assert.equal(new Set(chaves).size, 1, 'todas as chamadas com a mesma chave');
    assert.equal([...mp.orders.values()].filter(o => o.external_reference === `pedido-${id_pedido}`).length, 1);
    assert.equal(tentativas(id_pedido).length, 1);
});

test('checkout_url fora do domínio do Mercado Pago é recusado', async () => {
    const u = cliente(34);
    colocarNoCarrinho(34, [P.icones]);
    mp.forcarCheckoutUrl('https://mercadopago.com.br.golpe.example/pagar');
    const r = await finalizar(u);
    mp.forcarCheckoutUrl(null);
    assert.equal(r.status, 302);
    assert.match(r.local, /^\/detalhepedido\?id=\d+$/);
    assert.equal(tentativas(idNaUrl(r.local))[0].mp_order_id, null);
});

// ---------------------------------------------------------------- Fraude
test('fraude: retorno com status=approved não paga; pedido de outro cliente é recusado', async () => {
    const dono = cliente(35);
    const intruso = cliente(36);
    E().clientes.add(36);
    const { id_pedido, order } = await pedidoPendente(dono, [P.curso]);

    const forjado = await app.pedir(`/pagamento/retorno?pedido=${id_pedido}&order_id=${order.id}&status=approved&collection_status=approved&payment_id=999`, { usuario: dono });
    assert.equal(forjado.local, `/detalhepedido?id=${id_pedido}`);
    assert.equal(pedido(id_pedido).status, 'pendente');
    assert.match((await app.pedir(forjado.local, { usuario: dono })).corpo, /aguardando a confirmação do Mercado Pago/);

    const tentativasAntes = E().pagamentos.length;
    assert.equal((await app.pedir(`/pagamento/retorno?order_id=${order.id}&pedido=${id_pedido}&status=approved`, { usuario: intruso })).local, '/minhascompras');
    assert.equal((await pagar(intruso, id_pedido)).local, '/minhascompras');
    assert.equal((await app.pedir(`/detalhepedido?id=${id_pedido}`, { usuario: intruso })).local, '/minhascompras');
    assert.equal(E().pagamentos.length, tentativasAntes);

    const semAssinatura = await app.pedir(`/webhooks/mercadopago?data.id=${order.id}&type=order`, {
        metodo: 'POST', headers: { 'content-type': 'application/json' },
        corpo: JSON.stringify({ type: 'order', action: 'order.processed', data: { id: order.id } })
    });
    assert.equal(semAssinatura.status, 401);
    assert.equal(pedido(id_pedido).status, 'pendente');

    // O retorno legítimo só confirma quando o MP confirma.
    mp.aprovar(order.id);
    const legitimo = await app.pedir(`/pagamento/retorno?pedido=${id_pedido}&order_id=${order.id}`, { usuario: dono });
    assert.equal(legitimo.local, `/detalhepedido?id=${id_pedido}`);
    assert.equal(pedido(id_pedido).status, 'pago');
    assert.match((await app.pedir(legitimo.local, { usuario: dono })).corpo, /Pagamento confirmado!/);
});

test('divergência: MP devolve outro valor → pedido não é pago e o alerta é registrado', async () => {
    const u = cliente(37);
    const { id_pedido, order } = await pedidoPendente(u, [P.curso]);
    mp.definirEstado(order.id, { status: 'processed', status_detail: 'accredited', total_amount: '1.00', total_paid_amount: '1.00' });
    assert.equal((await webhook(order.id)).status, 200);
    assert.equal(pedido(id_pedido).status, 'pendente');
    assert.ok(E().eventos.some(e => e.tipo === 'alerta' && e.acao === 'divergente' && e.mp_resource_id === order.id));
    assert.match(tentativas(id_pedido)[0].ultimo_erro, /^divergente/);

    const { id_pedido: outro, order: order2 } = await pedidoPendente(cliente(38), [P.curso]);
    mp.aprovar(order2.id);
    mp.definirEstado(order2.id, { currency: 'USD' });
    await webhook(order2.id);
    assert.equal(pedido(outro).status, 'pendente', 'moeda diferente também bloqueia');
});

// ---------------------------------------------------------------- Cancelamento, reembolso e duplicidade
test('cancelado/expirado → pedido cancelado e cupom liberado para usar de novo', async () => {
    await criarCupom({ codigo: 'JOAO5', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '5' });
    const u = cliente(39);
    colocarNoCarrinho(39, [P.fontes]);
    await aplicarCupom(u, 'JOAO5');
    const r = await finalizar(u);
    assert.equal(r.status, 303);
    const order = mp.ultimaOrder();
    const id_pedido = E().pagamentos.find(x => x.mp_order_id === order.id).id_pedido;
    assert.ok(E().usos.some(x => x.id_pedido === id_pedido));

    mp.definirEstado(order.id, { status: 'canceled', status_detail: 'expired' });
    assert.equal((await webhook(order.id)).status, 200);
    assert.equal(pedido(id_pedido).status, 'cancelado');
    assert.ok(!E().usos.some(x => x.id_pedido === id_pedido), 'uso do cupom devolvido');

    colocarNoCarrinho(39, [P.fontes]);
    await aplicarCupom(u, 'JOAO5');
    assert.match((await app.pedir('/carrinho', { usuario: u })).corpo, /Cupom JOAO5 aplicado/);
    assert.equal((await pagar(u, id_pedido)).local, `/detalhepedido?id=${id_pedido}`, 'pedido cancelado não é mais pago');
});

test('reembolso (Modelo A, feito no painel do MP) → pedido reembolsado e download bloqueado', async () => {
    const u = cliente(40);
    const { id_pedido, order } = await pedidoPendente(u, [P.planilha]);
    mp.aprovar(order.id);
    await webhook(order.id);
    assert.match(await downloads(u), /Planilha Financeira/);

    mp.definirEstado(order.id, { status: 'refunded', status_detail: 'refunded' });
    assert.equal((await webhook(order.id)).status, 200);
    assert.equal(pedido(id_pedido).status, 'reembolsado');
    assert.doesNotMatch(await downloads(u), /Planilha Financeira/);
    assert.equal(mp.chamadas.reembolsar.length, 0, 'o CloudMind nunca estorna sozinho');
});

test('pagamento em dobro: alerta registrado e nenhuma segunda liberação', async () => {
    const u = cliente(41);
    const { id_pedido, order: order1 } = await pedidoPendente(u, [P.planilha]);
    mp.definirEstado(order1.id, { status: 'failed', status_detail: 'rejected_by_issuer' });
    await webhook(order1.id);
    await pagar(u, id_pedido);
    const order2 = mp.ultimaOrder();
    assert.notEqual(order2.id, order1.id);
    mp.aprovar(order2.id);
    await webhook(order2.id);
    assert.equal(pedido(id_pedido).status, 'pago');

    mp.aprovar(order1.id); // a order antiga também acabou aprovada
    assert.equal((await webhook(order1.id)).status, 200);
    assert.equal(pedido(id_pedido).status, 'pago');
    assert.ok(E().eventos.some(e => e.tipo === 'alerta' && e.acao === 'pagamento_duplicado' && e.mp_resource_id === order1.id));
    assert.equal(itensNosDownloads(await downloads(u), P.planilha), 1);

    // Estorno da duplicada pelo painel: o pedido continua pago pela outra tentativa.
    mp.definirEstado(order1.id, { status: 'refunded', status_detail: 'refunded' });
    await webhook(order1.id);
    assert.equal(pedido(id_pedido).status, 'pago');
});

test('pedido pendente com o mesmo produto: não cria outro pedido nem outra order', async () => {
    const u = cliente(42);
    const { id_pedido } = await pedidoPendente(u, [P.curso]);
    const ordersAntes = mp.orders.size;
    colocarNoCarrinho(42, [P.curso]);
    const r = await finalizar(u);
    assert.equal(r.local, `/detalhepedido?id=${id_pedido}`);
    assert.equal(E().pedidos.filter(p => p.id_cliente === 42).length, 1);
    assert.equal(mp.orders.size, ordersAntes);
    assert.match((await app.pedir(r.local, { usuario: u })).corpo, /já tem este pedido aguardando pagamento/);
    assert.match((await app.pedir('/minhascompras', { usuario: u })).corpo, /Pagar<span class="cm-sr"> o pedido #/);
});

test('exclusão de conta: cliente com pagamento real é desativado e os registros financeiros ficam', async () => {
    const u = cliente(44);
    const { id_pedido, order } = await pedidoPendente(u, [P.fontes]);
    mp.aprovar(order.id);
    await webhook(order.id);
    const Usuario = require(path.join(RAIZ, 'app', 'models', 'Usuario'));
    assert.equal(await Usuario.excluir(44), 'desativada');
    assert.equal(E().usuarios.get(44).status, 'suspenso');
    assert.equal(pedido(id_pedido).status, 'pago');
    assert.equal(tentativas(id_pedido).length, 1, 'tentativa com order no MP preservada');
});

// ---------------------------------------------------------------- Configuração e segurança
test('produção: modo demonstração ou configuração faltando impede o boot', () => {
    const pagamento = require(path.join(RAIZ, 'app', 'helpers', 'pagamento'));
    const salvo = { ...process.env };
    try {
        Object.assign(process.env, { NODE_ENV: 'production', PAGAMENTO_MODO: 'demonstracao' });
        assert.throws(() => pagamento.validarConfiguracao(), /demonstração/);
        assert.equal(pagamento.modo(), 'mercadopago', 'em produção a compra nunca é aprovada sem cobrança');
        delete process.env.PAGAMENTO_MODO;
        assert.throws(() => pagamento.validarConfiguracao(), /PAGAMENTO_MODO/);
        Object.assign(process.env, { PAGAMENTO_MODO: 'mercadopago', MERCADO_PAGO_ACCESS_TOKEN: '' });
        assert.throws(() => pagamento.validarConfiguracao(), /MERCADO_PAGO_ACCESS_TOKEN/);
        Object.assign(process.env, { MERCADO_PAGO_ACCESS_TOKEN: TOKEN, MERCADO_PAGO_WEBHOOK_SECRET: '' });
        assert.throws(() => pagamento.validarConfiguracao(), /MERCADO_PAGO_WEBHOOK_SECRET/);
        Object.assign(process.env, { MERCADO_PAGO_WEBHOOK_SECRET: SEGREDO, APP_PUBLIC_URL: 'http://loja.teste' });
        assert.throws(() => pagamento.validarConfiguracao(), /https/);
        Object.assign(process.env, { APP_PUBLIC_URL: 'https://loja.teste', MERCADO_PAGO_EXPIRACAO: 'um dia' });
        assert.throws(() => pagamento.validarConfiguracao(), /MERCADO_PAGO_EXPIRACAO/);
        Object.assign(process.env, { MERCADO_PAGO_EXPIRACAO: 'PT30M' });
        assert.deepEqual(pagamento.validarConfiguracao(), []);
        Object.assign(process.env, { NODE_ENV: 'development', MERCADO_PAGO_ACCESS_TOKEN: '' });
        assert.ok(pagamento.validarConfiguracao().length > 0, 'fora de produção só avisa');
    } finally {
        for (const k of Object.keys(process.env)) if (!(k in salvo)) delete process.env[k];
        Object.assign(process.env, salvo);
    }
});

test('logs: nenhum token, secret ou header Authorization foi escrito', () => {
    const tudo = saidas.join('\n');
    assert.ok(saidas.length > 0, 'houve logs para conferir');
    assert.doesNotMatch(tudo, new RegExp(`${TOKEN}|${SEGREDO}|Authorization|Bearer`, 'i'));
});
