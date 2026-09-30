const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarBanco } = require('./apoio/bancoFalso');
const { criarInstancia, RAIZ } = require('./apoio/instancia');
const { criarDriverMemoria } = require('../app/helpers/armazenamento');

const VENDEDOR = { id_usuario: 7, nome: 'Vendedor Teste', tipo: 'criador' };
const CLIENTE  = { id_usuario: 9, nome: 'Cliente Teste', tipo: 'cliente' };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(300, 7)]);
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(200, 3)]);
const PDF = Buffer.from('%PDF-1.4 conteudo do ebook de teste');
const PASTAS_LOCAIS = ['app/public/image/uploads', 'app/public/image/avatars', 'app/public/image/capas', 'storage/produtos']
    .map(p => path.join(RAIZ, p));
const TEMP = path.join(os.tmpdir(), 'cloudmind-uploads');

const banco = criarBanco();
const falhas = { storage: false };
const driver = criarDriverMemoria({ falhar: op => falhas.storage && op === 'enviar' });
banco.estado.usuarios.set(7, { nome: VENDEDOR.nome });
banco.estado.usuarios.set(9, { nome: CLIENTE.nome });
banco.estado.criadores.set(7, {});
const categoria = slug => String(banco.estado.categorias.find(c => c.slug_categoria === slug).id_categoria);

const listar = d => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);
const antes = PASTAS_LOCAIS.map(listar);
const esperar = ms => new Promise(r => setTimeout(r, ms));

let local, render;

function formularioProduto(extra = {}) {
    const fd = new FormData();
    const campos = { titulo: 'Ebook de teste do storage', preco: '39,90', descricao: 'Descrição com mais de vinte caracteres.',
        resumo: '', sku: '', tipo_produto: 'ebook', id_categoria: categoria('programacao'),
        'detalhes[paginas]': '120', 'detalhes[idioma]': 'pt', ...extra };
    Object.entries(campos).forEach(([k, v]) => fd.append(k, v));
    return fd;
}

async function publicar(inst, { semArquivo = false } = {}) {
    const fd = formularioProduto();
    fd.append('imagem', new Blob([PNG], { type: 'image/png' }), 'capa.png');
    fd.append('imagens_adicionais', new Blob([JPG], { type: 'image/jpeg' }), 'extra 1.jpg');
    if (!semArquivo) fd.append('arquivo', new Blob([PDF], { type: 'application/pdf' }), '../../../ebook.pdf');
    return inst.pedir('/cdstraprod', { usuario: VENDEDOR, metodo: 'POST', corpo: fd });
}

test.before(async () => {
    local = await criarInstancia({ banco, driver });
    render = await criarInstancia({ banco, driver });
});

test.after(async () => {
    await local.fechar();
    await render.fechar();
});

test('upload no LOCAL → storage + chave no banco → aparece no RENDER', async () => {
    const r = await publicar(local);
    assert.equal(r.status, 302, r.corpo.slice(0, 300));
    assert.equal(r.local, '/admvend');

    const produto = banco.estado.produtos.get(1);
    assert.equal(produto.status_produto, 'ativo');
    assert.match(produto.imagem, /^products\/1\/cover\/[a-z0-9-]+\.png$/);
    assert.match(produto.arquivo, /^products\/1\/files\/[a-z0-9-]+\.pdf$/);
    const galeria = banco.estado.imagens.filter(i => i.id_produto === 1);
    assert.equal(galeria.length, 1);
    assert.match(galeria[0].caminho, /^products\/1\/gallery\/1-[a-z0-9-]+\.jpg$/);

    assert.ok(driver.objetos.get(produto.imagem).dados.equals(PNG));
    assert.equal(driver.objetos.get(produto.imagem).publico, true);
    assert.equal(driver.objetos.get(produto.arquivo).publico, false);

    const pagina = await render.pedir('/paginnerprod?id=1');
    assert.equal(pagina.status, 200);
    assert.ok(pagina.corpo.includes(`https://storage.teste/bucket/${produto.imagem}`), 'capa com a URL do storage');
    assert.ok(pagina.corpo.includes(`https://storage.teste/bucket/${galeria[0].caminho}`), 'galeria com a URL do storage');
    assert.ok(!pagina.corpo.includes('products/1/files/'), 'a chave privada nunca aparece na página');
});

test('download: só com autorização, por URL assinada gerada na hora', async () => {
    const produto = banco.estado.produtos.get(1);
    const semCompra = await render.pedir('/downloads/1', { usuario: CLIENTE });
    assert.equal(semCompra.status, 302);
    assert.equal(semCompra.local, '/meusdowloads');

    banco.estado.compras.add('9:1');
    const comCompra = await render.pedir('/downloads/1', { usuario: CLIENTE });
    assert.equal(comCompra.status, 302);
    assert.ok(comCompra.local.startsWith(`https://storage.teste/bucket/${produto.arquivo}?assinatura=`));
    assert.match(comCompra.cache, /no-store/);

    const dono = await local.pedir('/downloads/1', { usuario: VENDEDOR });
    assert.ok(dono.local.startsWith(`https://storage.teste/bucket/${produto.arquivo}?assinatura=`));

    const visitante = await render.pedir('/downloads/1');
    assert.equal(visitante.status, 302);
    assert.equal(visitante.local, '/login');
});

test('RESTART / novo deploy: disco apagado, instância nova, tudo continua funcionando', async () => {
    fs.rmSync(TEMP, { recursive: true, force: true });
    await render.fechar();
    render = await criarInstancia({ banco, driver });

    const produto = banco.estado.produtos.get(1);
    const pagina = await render.pedir('/paginnerprod?id=1');
    assert.equal(pagina.status, 200);
    assert.ok(pagina.corpo.includes(`https://storage.teste/bucket/${produto.imagem}`));
    const download = await render.pedir('/downloads/1', { usuario: CLIENTE });
    assert.ok(download.local.startsWith(`https://storage.teste/bucket/${produto.arquivo}?assinatura=`));
});

test('upload no RENDER (capa da loja e foto) → aparece no LOCAL', async () => {
    const fdCapa = new FormData();
    fdCapa.append('capa', new Blob([PNG], { type: 'image/png' }), 'capa-loja.png');
    const capa = await render.pedir('/pgpublica/capa', { usuario: VENDEDOR, metodo: 'POST', corpo: fdCapa });
    assert.equal(capa.status, 302);
    const chaveCapa = banco.estado.criadores.get(7).capa;
    assert.match(chaveCapa, /^sellers\/7\/cover\/[a-z0-9-]+\.png$/);

    const fdFoto = new FormData();
    fdFoto.append('foto', new Blob([JPG], { type: 'image/jpeg' }), 'eu.jpg');
    const foto = await render.pedir('/perfil/foto', { usuario: VENDEDOR, metodo: 'POST', corpo: fdFoto });
    assert.equal(foto.status, 200, foto.corpo);
    const chaveFoto = banco.estado.usuarios.get(7).foto_usuario;
    assert.match(chaveFoto, /^users\/7\/avatar\/[a-z0-9-]+\.jpg$/);
    assert.equal(JSON.parse(foto.corpo).foto, `https://storage.teste/bucket/${chaveFoto}`);

    const loja = await local.pedir('/perfilvend?id=7');
    assert.equal(loja.status, 200);
    assert.ok(loja.corpo.includes(`https://storage.teste/bucket/${chaveCapa}`), 'capa da loja no outro ambiente');
    assert.ok(loja.corpo.includes(`https://storage.teste/bucket/${chaveFoto}`), 'foto no outro ambiente');
});

test('substituição: nova capa e novo arquivo entram, os antigos saem do storage', async () => {
    const antigo = { ...banco.estado.produtos.get(1) };
    const fd = formularioProduto({ id_produto: '1' });
    fd.append('imagem', new Blob([JPG], { type: 'image/jpeg' }), 'nova.jpg');
    const r = await local.pedir('/produto/editar', { usuario: VENDEDOR, metodo: 'POST', corpo: fd });
    assert.equal(r.local, '/admvend', r.corpo.slice(0, 200));
    const atual = banco.estado.produtos.get(1);
    assert.match(atual.imagem, /^products\/1\/cover\/[a-z0-9-]+\.jpg$/);
    assert.ok(driver.objetos.has(atual.imagem));
    assert.ok(!driver.objetos.has(antigo.imagem), 'capa antiga removida');

    const fdArq = new FormData();
    fdArq.append('id_produto', '1');
    fdArq.append('arquivo', new Blob([Buffer.from('%PDF nova versão')], { type: 'application/pdf' }), 'v2.pdf');
    const t = await local.pedir('/produto/arquivo', { usuario: VENDEDOR, metodo: 'POST', corpo: fdArq });
    assert.equal(t.local, '/admvend');
    const depois = banco.estado.produtos.get(1);
    assert.notEqual(depois.arquivo, antigo.arquivo);
    assert.ok(driver.objetos.has(depois.arquivo));
    assert.ok(!driver.objetos.has(antigo.arquivo), 'arquivo antigo removido');
});

test('exclusão de produto sem vendas remove capa, galeria e arquivo do storage', async () => {
    const r = await publicar(local);
    assert.equal(r.local, '/admvend');
    const id = Math.max(...banco.estado.produtos.keys());
    const p = banco.estado.produtos.get(id);
    const chaves = [p.imagem, p.arquivo, ...banco.estado.imagens.filter(i => i.id_produto === id).map(i => i.caminho)];
    chaves.forEach(k => assert.ok(driver.objetos.has(k)));

    const fd = new URLSearchParams({ id_produto: String(id) });
    const ex = await render.pedir('/produto/excluir', { usuario: VENDEDOR, metodo: 'POST', corpo: fd });
    assert.equal(ex.local, '/admvend');
    assert.ok(!banco.estado.produtos.has(id));
    await esperar(30);
    chaves.forEach(k => assert.ok(!driver.objetos.has(k), `removido: ${k}`));
});

test('storage fora do ar: nada é publicado e nada fica no banco', async () => {
    const produtos = banco.estado.produtos.size;
    const objetos = driver.objetos.size;
    falhas.storage = true;
    const r = await publicar(local);
    falhas.storage = false;
    assert.equal(r.status, 200);
    assert.match(r.corpo, /Não foi possível guardar o arquivo agora/);
    assert.equal(banco.estado.produtos.size, produtos, 'reserva descartada');
    assert.equal(driver.objetos.size, objetos, 'nenhum objeto órfão');
});

test('banco falha DEPOIS do upload: os objetos enviados são apagados (sem órfãos)', async () => {
    const produtos = banco.estado.produtos.size;
    const objetos = driver.objetos.size;
    banco.estado.falhar = sql => /UPDATE produto SET imagem = \?, arquivo = \?, status_produto = 'ativo'/.test(sql);
    const r = await publicar(render);
    banco.estado.falhar = null;
    assert.equal(r.status, 200);
    assert.match(r.corpo, /Não foi possível publicar o produto agora/);
    assert.equal(banco.estado.produtos.size, produtos, 'reserva descartada');
    assert.equal(driver.objetos.size, objetos, 'objetos enviados foram removidos');

    const capaAntes = banco.estado.criadores.get(7).capa;
    banco.estado.falhar = sql => /UPDATE criador SET capa_criador/.test(sql);
    const fd = new FormData();
    fd.append('capa', new Blob([PNG], { type: 'image/png' }), 'x.png');
    await render.pedir('/pgpublica/capa', { usuario: VENDEDOR, metodo: 'POST', corpo: fd });
    banco.estado.falhar = null;
    assert.equal(banco.estado.criadores.get(7).capa, capaAntes, 'capa anterior mantida');
    assert.equal(driver.objetos.size, objetos, 'capa nova removida do storage');
});

test('arquivo falso (texto com extensão .png) é recusado antes de ir ao storage', async () => {
    const objetos = driver.objetos.size;
    const fd = new FormData();
    fd.append('capa', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'falso.png');
    await local.pedir('/pgpublica/capa', { usuario: VENDEDOR, metodo: 'POST', corpo: fd });
    assert.equal(driver.objetos.size, objetos);
});

test('nada foi gravado nas pastas locais do app, e os temporários foram apagados', async () => {
    await esperar(50);
    assert.deepEqual(PASTAS_LOCAIS.map(listar), antes);
    assert.deepEqual(listar(TEMP), []);
});
