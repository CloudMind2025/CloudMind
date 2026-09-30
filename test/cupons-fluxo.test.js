const test = require('node:test');
const assert = require('node:assert/strict');
const { criarBancoLoja } = require('./apoio/bancoLoja');
const { criarInstancia } = require('./apoio/instancia');
const { criarDriverMemoria } = require('../app/helpers/armazenamento');
const cupons = require('../app/helpers/cupons');

const ADMIN   = { id_usuario: 1, nome: 'CloudMind Admin', tipo: 'admin', foto: null };
const CLIENTE = { id_usuario: 9, nome: 'Cliente Um', tipo: 'cliente' };
const CLIENTE2 = { id_usuario: 10, nome: 'Cliente Dois', tipo: 'cliente' };
const HOJE = cupons.hoje();
const dias = n => { const d = new Date(`${HOJE}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const banco = criarBancoLoja();
const E = () => banco.estado;
E().hojeBanco = HOJE;
[[1, 'CloudMind Admin'], [7, 'João Martins'], [8, 'Rodrigo Vendas'], [9, 'Cliente Um'], [10, 'Cliente Dois']]
    .forEach(([id, nome]) => E().usuarios.set(id, { nome, email: `u${id}@teste.com`, status: 'ativo', foto: null }));
E().admins.add(1);
E().criadores.add(7); E().criadores.add(8);
[[101, 7, 'Curso do João', 100], [102, 8, 'Ebook do Rodrigo', 100], [103, 7, 'Template do João', 50]]
    .forEach(([id, criador, titulo, preco]) => E().produtos.set(id, { id_produto: id, id_criador: criador, titulo, preco, tipo: 'curso', status: 'ativo', imagem: null, arquivo: null }));

let app;
const form = campos => new URLSearchParams(campos);
const cupomPorCodigo = codigo => [...E().cupons.values()].find(c => c.codigo === codigo);
const carrinhoDe = id => [...E().carrinhos.values()].find(c => c.id_cliente === id && c.status_carrinho === 'aberto');
function colocarNoCarrinho(cliente, ids) {
    E().clientes.add(cliente);
    let c = carrinhoDe(cliente);
    if (!c) { const id = E().seq.carrinho++; c = { id_carrinho: id, id_cliente: cliente, status_carrinho: 'aberto', id_cupom: null }; E().carrinhos.set(id, c); }
    ids.forEach(id => E().itensCarrinho.push({ id_carrinho: c.id_carrinho, id_produto: id, preco_unitario: E().produtos.get(id).preco }));
}
const criarCupom = campos => app.pedir('/adm/cupons', { usuario: ADMIN, metodo: 'POST', corpo: form({
    tipo_desconto: 'percentual', data_inicio: HOJE, data_fim: dias(30), limite_usos: '100', ativo: 'on', ...campos }) });
const aplicar = (cliente, codigo) => app.pedir('/carrinho/cupom', { usuario: cliente, metodo: 'POST', corpo: form({ codigo }) });
const avisoDoCarrinho = async cliente => (await app.pedir('/carrinho', { usuario: cliente })).corpo;

test.before(async () => { app = await criarInstancia({ banco, driver: criarDriverMemoria() }); });
test.after(async () => { await app.fechar(); });

test('cenários 1–3: ADM cria cupom percentual e de valor fixo vinculados ao vendedor', async () => {
    let r = await criarCupom({ codigo: 'joao 10', id_criador: '7', valor_desconto: '10' });
    assert.equal(r.local, '/adm/cupons');
    r = await criarCupom({ codigo: 'JOAO20', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '20,00', ilimitado: 'on' });
    assert.equal(r.local, '/adm/cupons');

    const j10 = cupomPorCodigo('JOAO10');
    const j20 = cupomPorCodigo('JOAO20');
    assert.equal(j10.id_criador, 7);
    assert.equal(j10.tipo_desconto, 'percentual');
    assert.equal(j20.tipo_desconto, 'fixo');
    assert.equal(j20.valor_desconto, 20);
    assert.equal(j20.limite_usos, null);

    const lista = await app.pedir('/adm/cupons', { usuario: ADMIN });
    assert.match(lista.corpo, /Cupom JOAO20 criado com sucesso/);
    assert.match(lista.corpo, /JOAO10[\s\S]*João Martins/);

    await criarCupom({ codigo: 'JOAO10', id_criador: '8', valor_desconto: '5' });
    assert.match((await app.pedir('/adm/cupons', { usuario: ADMIN })).corpo, /Já existe um cupom com o código JOAO10/);
    await criarCupom({ codigo: 'RUIM', id_criador: '7', valor_desconto: '150' });
    assert.match((await app.pedir('/adm/cupons', { usuario: ADMIN })).corpo, /A porcentagem deve ser de 1% a 100%/);
    const intruso = await app.pedir('/adm/cupons', { usuario: CLIENTE, metodo: 'POST', corpo: form({ codigo: 'HACK', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '99', data_inicio: HOJE, data_fim: dias(1), ilimitado: 'on', ativo: 'on' }) });
    assert.notEqual(intruso.local, '/adm/cupons');
    assert.equal(cupomPorCodigo('HACK'), undefined);
    assert.equal(E().cupons.size, 2);
});

test('cenários 4–5: o cupom aparece na loja do vendedor certo, e só nela', async () => {
    const lojaJoao = await app.pedir('/perfilvend?id=7');
    assert.match(lojaJoao.corpo, /Cupons de desconto/);
    assert.match(lojaJoao.corpo, /data-copiar-cupom="JOAO10"/);
    assert.match(lojaJoao.corpo, /10% OFF/);
    assert.match(lojaJoao.corpo, /R\$ 20,00 OFF/);
    const lojaRodrigo = await app.pedir('/perfilvend?id=8');
    assert.doesNotMatch(lojaRodrigo.corpo, /JOAO10|Cupons de desconto/);
});

test('cenários 7, 12 e 14: cliente aplica o cupom; desconto só no produto do vendedor', async () => {
    colocarNoCarrinho(9, [101, 102]);
    const r = await aplicar(CLIENTE, 'joao10');
    assert.equal(r.local, '/carrinho#cupom');
    assert.equal(carrinhoDe(9).id_cupom, cupomPorCodigo('JOAO10').id_cupom);

    const pagina = await avisoDoCarrinho(CLIENTE);
    assert.match(pagina, /Cupom JOAO10 aplicado: R\$ 10,00 de desconto nos produtos de João Martins/);
    assert.match(pagina, /R\$ 200,00/);
    assert.match(pagina, /− R\$ 10,00/);
    assert.match(pagina, /R\$ 190,00/);
    assert.match(pagina, /Remover cupom/);
});

test('finalização: pedido com o desconto certo e uso contabilizado', async () => {
    const r = await app.pedir('/carrinho/finalizar', { usuario: CLIENTE, metodo: 'POST' });
    assert.match(r.local, /^\/detalhepedido\?id=\d+$/);
    const id_pedido = Number(r.local.split('=')[1]);
    const itens = E().itensPedido.filter(i => i.id_pedido === id_pedido);
    assert.deepEqual(itens.map(i => [i.id_produto, i.preco_unitario, i.desconto]).sort(), [[101, 90, 10], [102, 100, 0]]);
    assert.equal(E().usos.length, 1);
    assert.equal(E().usos[0].valor_desconto, 10);
    assert.equal(carrinhoDe(9).id_cupom, null, 'cupom sai do carrinho depois de usado');

    const detalhe = await app.pedir(`/detalhepedido?id=${id_pedido}`, { usuario: CLIENTE });
    assert.match(detalhe.corpo, /Cupom JOAO10/);
    assert.match(detalhe.corpo, /R\$ 190,00/);

    const adm = await app.pedir('/adm/cupons', { usuario: ADMIN });
    assert.match(adm.corpo, /1\/100/);
    assert.match(adm.corpo, /R\$ 10,00/);
});

test('mesmo cliente não reutiliza o cupom', async () => {
    colocarNoCarrinho(9, [103]);
    await aplicar(CLIENTE, 'JOAO10');
    assert.match(await avisoDoCarrinho(CLIENTE), /Você já usou este cupom em outra compra/);
    assert.equal(carrinhoDe(9).id_cupom, null);
});

test('cenário 8: cupom em carrinho sem produto do vendedor dele', async () => {
    colocarNoCarrinho(10, [102]);
    await aplicar(CLIENTE2, 'JOAO20');
    assert.match(await avisoDoCarrinho(CLIENTE2), /vale só para produtos de João Martins/);
});

test('cenários 9–11: expirado, desativado pelo ADM e limite atingido', async () => {
    colocarNoCarrinho(10, [103]);

    const id = E().seq.cupom++;
    E().cupons.set(id, { id_cupom: id, codigo: 'VELHO', id_criador: 7, tipo_desconto: 'fixo', valor_desconto: 5,
        data_inicio: dias(-40), data_fim: dias(-1), limite_usos: null, ativo: 1 });
    await aplicar(CLIENTE2, 'VELHO');
    assert.match(await avisoDoCarrinho(CLIENTE2), /Este cupom expirou/);

    await app.pedir(`/adm/cupons/${cupomPorCodigo('JOAO20').id_cupom}/ativo`, { usuario: ADMIN, metodo: 'POST', corpo: form({ ativo: '0' }) });
    await aplicar(CLIENTE2, 'JOAO20');
    assert.match(await avisoDoCarrinho(CLIENTE2), /Cupom inválido ou indisponível/);

    await criarCupom({ codigo: 'UNICO', id_criador: '7', valor_desconto: '15', limite_usos: '1' });
    E().usos.push({ id_uso: E().seq.uso++, id_cupom: cupomPorCodigo('UNICO').id_cupom, id_cliente: 9, id_pedido: 1, valor_desconto: 1 });
    await aplicar(CLIENTE2, 'UNICO');
    assert.match(await avisoDoCarrinho(CLIENTE2), /Este cupom atingiu o limite de utilizações/);
    assert.doesNotMatch((await app.pedir('/perfilvend?id=7')).corpo, /data-copiar-cupom="UNICO"/);
});

test('cupom desativado entre aplicar e finalizar: nada é criado nem cobrado', async () => {
    await criarCupom({ codigo: 'JOAO5', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '5' });
    await aplicar(CLIENTE2, 'JOAO5');
    assert.equal(carrinhoDe(10).id_cupom, cupomPorCodigo('JOAO5').id_cupom);
    await app.pedir(`/adm/cupons/${cupomPorCodigo('JOAO5').id_cupom}/ativo`, { usuario: ADMIN, metodo: 'POST', corpo: form({ ativo: '0' }) });

    const pedidos = E().pedidos.length;
    const r = await app.pedir('/carrinho/finalizar', { usuario: CLIENTE2, metodo: 'POST' });
    assert.equal(r.local, '/carrinho');
    assert.equal(E().pedidos.length, pedidos, 'nenhum pedido');
    assert.equal(carrinhoDe(10).id_cupom, null);
    assert.match(await avisoDoCarrinho(CLIENTE2), /não pôde ser usado: Cupom inválido ou indisponível/);
});

test('valor fixo maior que os produtos do vendedor: desconto limitado ao valor deles', async () => {
    await criarCupom({ codigo: 'JOAO500', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '500' });
    await aplicar(CLIENTE2, 'JOAO500');
    const r = await app.pedir('/carrinho/finalizar', { usuario: CLIENTE2, metodo: 'POST' });
    const id_pedido = Number(r.local.split('=')[1]);
    const itens = E().itensPedido.filter(i => i.id_pedido === id_pedido);
    assert.deepEqual(itens.map(i => [i.id_produto, i.preco_unitario, i.desconto]).sort(), [[102, 100, 0], [103, 0, 50]]);
});

test('excluir: cupom já usado é desativado; sem uso é apagado', async () => {
    await app.pedir(`/adm/cupons/${cupomPorCodigo('JOAO10').id_cupom}/excluir`, { usuario: ADMIN, metodo: 'POST' });
    assert.equal(cupomPorCodigo('JOAO10').ativo, 0);
    assert.match((await app.pedir('/adm/cupons', { usuario: ADMIN })).corpo, /já foi usado em pedidos, então foi desativado/);
    await app.pedir(`/adm/cupons/${cupomPorCodigo('VELHO').id_cupom}/excluir`, { usuario: ADMIN, metodo: 'POST' });
    assert.equal(cupomPorCodigo('VELHO'), undefined);
});

test('cenários 17–18: painel ADM com vendas e faturamento reais (sem dados fixos)', async () => {
    const r = await app.pedir('/paineladm', { usuario: ADMIN });
    assert.equal(r.status, 200);
    assert.match(r.corpo, /Vendas e faturamento/);
    assert.doesNotMatch(r.corpo, /Usuários ativos/);
    const json = /<script type="application\/json" id="dadosVendas">([\s\S]*?)<\/script>/.exec(r.corpo)[1];
    const serie = JSON.parse(json);
    assert.equal(serie.dias.length, 30);
    assert.equal(serie.meses.length, 12);
    const hoje = serie.dias[serie.dias.length - 1];
    assert.equal(hoje.chave, HOJE);
    assert.equal(hoje.faturamento, 290);
    assert.equal(serie.dias.slice(0, -1).reduce((s, d) => s + d.faturamento, 0), 0, 'dias sem venda entram com zero');
    assert.equal(hoje.vendas, 4);
    assert.equal(hoje.pedidos, 2);
    assert.equal(hoje.descontos, 60);
    assert.match(r.corpo, /data-periodo="30"/);
    assert.match(r.corpo, /data-metrica="vendas"/);
});

test('cenários 15–16: avatar padrão do administrador e foto personalizada', async () => {
    const semFoto = await app.pedir('/paineladm', { usuario: ADMIN });
    assert.equal((semFoto.corpo.match(/\/image\/avatar-admin\.svg/g) || []).length, 2, 'menu e barra lateral');
    assert.match(semFoto.corpo, /Administrador/);
    const comFoto = await app.pedir('/paineladm', { usuario: { ...ADMIN, foto: 'users/1/avatar/abc123.jpg' } });
    assert.doesNotMatch(comFoto.corpo, /avatar-admin\.svg/);
    assert.match(comFoto.corpo, /https:\/\/storage\.teste\/bucket\/users\/1\/avatar\/abc123\.jpg/);

    const perdida = await app.pedir('/paineladm', { usuario: { ...ADMIN, foto: '/image/avatars/avatar-20.jpg' } });
    assert.equal((perdida.corpo.match(/\/image\/avatar-admin\.svg/g) || []).length, 2, 'menu e barra lateral');
    assert.doesNotMatch(perdida.corpo, /avatar-20\.jpg/);
});
