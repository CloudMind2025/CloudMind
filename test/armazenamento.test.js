const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const armazenamento = require('../app/helpers/armazenamento');

function arquivoTemp(conteudo) {
    const p = path.join(os.tmpdir(), `cm-teste-${process.pid}-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(p, conteudo);
    return p;
}

test('chaves: organizadas pelo registro, só pastas conhecidas, sem traversal', () => {
    const k = armazenamento.novaChave('products', 12, 'cover', 'JPG');
    assert.match(k, /^products\/12\/cover\/[a-z0-9]+-[a-f0-9]{16}\.jpg$/);
    assert.ok(armazenamento.ehChave(k));
    assert.throws(() => armazenamento.novaChave('products', 12, 'etc', 'jpg'));
    assert.throws(() => armazenamento.novaChave('products', 0, 'cover', 'jpg'));
    assert.throws(() => armazenamento.novaChave('products', 12, 'cover', '../x'));
    assert.throws(() => armazenamento.novaChave('../products', 12, 'cover', 'jpg'));
    assert.equal(armazenamento.ehChave('products/12/cover/../../etc/passwd'), false);
    assert.equal(armazenamento.ehChave('image/uploads/x.jpg'), false);
    assert.equal(armazenamento.ehChave('products/12/cover/a/b.jpg'), false);
});

test('público x privado: arquivo do produto nunca vira URL pública', () => {
    armazenamento.definirDriver(armazenamento.criarDriverMemoria());
    const capa = armazenamento.novaChave('products', 3, 'cover', 'png');
    const arquivo = armazenamento.novaChave('products', 3, 'files', 'pdf');
    assert.equal(armazenamento.ehPublica(capa), true);
    assert.equal(armazenamento.ehPublica(arquivo), false);
    assert.equal(armazenamento.urlMidia(capa), `https://storage.teste/bucket/${capa}`);
    assert.equal(armazenamento.urlMidia(arquivo), '');
    armazenamento.definirDriver(null);
});

test('urlMidia: referências antigas continuam com o caminho de sempre', () => {
    assert.equal(armazenamento.urlMidia('image/uploads/a.jpg'), '/image/uploads/a.jpg');
    assert.equal(armazenamento.urlMidia('/image/avatars/avatar-7.jpg?v=1'), '/image/avatars/avatar-7.jpg?v=1');
    assert.equal(armazenamento.urlMidia(null), '');
});

test('urlFoto: foto antiga que não está no disco vira avatar padrão (vazio)', () => {
    armazenamento.definirDriver(armazenamento.criarDriverMemoria());
    assert.equal(armazenamento.urlFoto('image/User1.png'), '/image/User1.png', 'arquivo do repositório existe');
    assert.equal(armazenamento.urlFoto('/image/avatars/avatar-999999.jpg?v=1'), '', 'enviada no Render e perdida');
    assert.equal(armazenamento.urlFoto('image/../../app.js'), '', 'fora da pasta pública');
    const chave = armazenamento.novaChave('users', 20, 'avatar', 'jpg');
    assert.equal(armazenamento.urlFoto(chave), `https://storage.teste/bucket/${chave}`, 'chave do Cellar');
    assert.equal(armazenamento.urlFoto(null), '');
    armazenamento.definirDriver(null);
});

test('enviar confirma no storage; visibilidade tem de bater com a pasta', async () => {
    const driver = armazenamento.criarDriverMemoria();
    armazenamento.definirDriver(driver);
    const p = arquivoTemp(Buffer.from('conteudo'));
    const chave = armazenamento.novaChave('products', 5, 'files', 'pdf');
    await assert.rejects(armazenamento.enviar({ chave, caminho: p, tipo: 'application/pdf', publico: true }), /Visibilidade/);
    const r = await armazenamento.enviar({ chave, caminho: p, tipo: 'application/pdf', publico: false });
    assert.equal(r.tamanho, 8);
    assert.equal(driver.objetos.get(chave).publico, false);
    fs.unlinkSync(p);
    assert.deepEqual(await armazenamento.info(chave), { tamanho: 8, tipo: 'application/pdf' });
    armazenamento.definirDriver(null);
});

test('remover é idempotente e não lança erro quando o storage falha', async () => {
    const driver = armazenamento.criarDriverMemoria({ falhar: op => op === 'remover' });
    armazenamento.definirDriver(driver);
    const chave = armazenamento.novaChave('users', 1, 'avatar', 'jpg');
    assert.equal(await armazenamento.remover(chave), false);
    armazenamento.definirDriver(armazenamento.criarDriverMemoria());
    assert.equal(await armazenamento.remover(chave), true);
    assert.equal(await armazenamento.remover('image/uploads/x.jpg'), false);
    armazenamento.definirDriver(null);
});

test('storage fora do ar: o envio falha com mensagem amigável', async () => {
    armazenamento.definirDriver(armazenamento.criarDriverMemoria({ falhar: op => op === 'enviar' }));
    const p = arquivoTemp('x');
    await assert.rejects(
        armazenamento.enviar({ chave: armazenamento.novaChave('sellers', 2, 'cover', 'png'), caminho: p, tipo: 'image/png', publico: true }),
        err => err instanceof armazenamento.ErroArmazenamento && /Não foi possível guardar/.test(err.message)
    );
    fs.unlinkSync(p);
    armazenamento.definirDriver(null);
});

test('sem configuração: storage indisponível (nunca cai para o disco local)', async () => {
    const salvo = {};
    for (const k of Object.keys(process.env)) if (/^(STORAGE_|CELLAR_ADDON_)/.test(k)) { salvo[k] = process.env[k]; delete process.env[k]; }
    armazenamento.definirDriver(null);
    assert.equal(armazenamento.configurado(), false);
    const p = arquivoTemp('x');
    await assert.rejects(
        armazenamento.enviar({ chave: armazenamento.novaChave('users', 1, 'avatar', 'png'), caminho: p, tipo: 'image/png', publico: true }),
        /não está configurado/
    );
    fs.unlinkSync(p);
    Object.assign(process.env, salvo);
});

test('URL assinada é gerada na hora e nunca para chave inválida', async () => {
    armazenamento.definirDriver(armazenamento.criarDriverMemoria());
    const chave = armazenamento.novaChave('products', 9, 'files', 'zip');
    const url = await armazenamento.urlDownload(chave, 'Meu produto.zip');
    assert.match(url, /assinatura=/);
    await assert.rejects(armazenamento.urlDownload('image/uploads/a.jpg', 'x'), /inválida/);
    armazenamento.definirDriver(null);
});
