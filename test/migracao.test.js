const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const armazenamento = require('../app/helpers/armazenamento');
const migracao = require('../app/helpers/migracaoUploads');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(64, 1)]);

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-migracao-'));
const pastas = { publico: path.join(raiz, 'public'), arquivos: path.join(raiz, 'storage') };
fs.mkdirSync(path.join(pastas.publico, 'image', 'uploads'), { recursive: true });
fs.mkdirSync(path.join(pastas.publico, 'image', 'avatars'), { recursive: true });
fs.mkdirSync(pastas.arquivos, { recursive: true });
fs.writeFileSync(path.join(pastas.publico, 'image', 'uploads', '1790-imagem-a.png'), PNG);
fs.writeFileSync(path.join(pastas.publico, 'image', 'avatars', 'avatar-7.png'), PNG);
fs.writeFileSync(path.join(pastas.arquivos, '1790-abc.pdf'), '%PDF-1.4 x');

const tabelas = {
    produto: [
        { id_produto: 1, imagem: 'image/uploads/1790-imagem-a.png', arquivo: '1790-abc.pdf' },
        { id_produto: 2, imagem: 'image/uploads/perdido-no-render.jpg', arquivo: null }
    ],
    produto_imagem: [],
    usuario: [{ id_usuario: 7, foto_usuario: '/image/avatars/avatar-7.png?v=123' }]
};
const db = {
    async query(sql, p = []) {
        const s = sql.replace(/\s+/g, ' ');
        let m = /^SELECT (\w+) AS pk, (\w+) AS dono, (\w+) AS valor FROM (\w+) WHERE (.+) ORDER BY/.exec(s);
        if (m) {
            const [, pk, dono, col, tabela, filtro] = m;
            if (!tabelas[tabela] || (tabela === 'criador')) throw Object.assign(new Error('coluna'), { code: 'ER_BAD_FIELD_ERROR' });
            const casa = v => {
                if (v == null || v === '') return false;
                if (/LIKE 'image\/uploads/.test(filtro)) return String(v).startsWith('image/uploads/');
                if (/LIKE '\/image\/avatars/.test(filtro)) return String(v).startsWith('/image/avatars/');
                if (/NOT LIKE '%\/%'/.test(filtro)) return !String(v).includes('/');
                return false;
            };
            return [tabelas[tabela].filter(r => casa(r[col])).map(r => ({ pk: r[pk], dono: r[dono], valor: r[col] }))];
        }
        m = /^UPDATE (\w+) SET (\w+) = \? WHERE (\w+) = \? AND \2 = \?/.exec(s);
        if (m) {
            const [, tabela, col, pk] = m;
            const linha = tabelas[tabela].find(r => r[pk] === p[1] && r[col] === p[2]);
            if (!linha) return [{ affectedRows: 0 }];
            linha[col] = p[0];
            return [{ affectedRows: 1 }];
        }
        throw Object.assign(new Error('consulta não simulada: ' + s), { code: 'ER_BAD_FIELD_ERROR' });
    }
};

const driver = armazenamento.criarDriverMemoria();
test.before(() => armazenamento.definirDriver(driver));
test.after(() => { armazenamento.definirDriver(null); fs.rmSync(raiz, { recursive: true, force: true }); });

test('simulação: mostra o que seria migrado e não altera nada', async () => {
    const r = await migracao.migrar(db, { confirmar: false, pastas });
    assert.equal(r.seriaMigrado.length, 3);
    assert.equal(r.naoRecuperaveis.length, 1);
    assert.equal(r.naoRecuperaveis[0].valor, 'image/uploads/perdido-no-render.jpg');
    assert.equal(driver.objetos.size, 0);
    assert.equal(tabelas.produto[0].imagem, 'image/uploads/1790-imagem-a.png');
});

test('execução: envia para chaves do registro, confirma e atualiza o banco; arquivos locais ficam', async () => {
    const r = await migracao.migrar(db, { confirmar: true, pastas });
    assert.equal(r.migrados.length, 3);
    assert.equal(r.erros.length, 0);
    assert.equal(tabelas.produto[0].imagem, 'products/1/cover/legado-1790-imagem-a.png');
    assert.equal(tabelas.produto[0].arquivo, 'products/1/files/legado-1790-abc.pdf');
    assert.equal(tabelas.usuario[0].foto_usuario, 'users/7/avatar/legado-avatar-7.png');
    assert.equal(driver.objetos.get('products/1/files/legado-1790-abc.pdf').publico, false);
    assert.equal(driver.objetos.get('products/1/cover/legado-1790-imagem-a.png').publico, true);
    assert.ok(fs.existsSync(path.join(pastas.publico, 'image', 'uploads', '1790-imagem-a.png')), 'nada local é apagado');
    assert.equal(tabelas.produto[1].imagem, 'image/uploads/perdido-no-render.jpg');
});

test('rodar de novo é seguro: nada duplicado; objeto já enviado não é reenviado', async () => {
    const objetos = driver.objetos.size;
    const r1 = await migracao.migrar(db, { confirmar: true, pastas });
    assert.equal(r1.migrados.length + r1.jaNoStorage.length, 0);
    assert.equal(driver.objetos.size, objetos);

    tabelas.produto[0].imagem = 'image/uploads/1790-imagem-a.png';
    const r2 = await migracao.migrar(db, { confirmar: true, pastas });
    assert.equal(r2.jaNoStorage.length, 1);
    assert.equal(tabelas.produto[0].imagem, 'products/1/cover/legado-1790-imagem-a.png');
    assert.equal(driver.objetos.size, objetos);
});

test('verificar: toda chave do banco existe no storage', async () => {
    const r = await migracao.verificar({ async query(sql) {
        if (/FROM produto_imagem|FROM criador/.test(sql)) return [[]];
        if (/imagem AS valor/.test(sql)) return [tabelas.produto.map(p => ({ pk: p.id_produto, valor: p.imagem }))];
        if (/arquivo AS valor/.test(sql)) return [tabelas.produto.map(p => ({ pk: p.id_produto, valor: p.arquivo }))];
        if (/foto_usuario AS valor/.test(sql)) return [tabelas.usuario.map(u => ({ pk: u.id_usuario, valor: u.foto_usuario }))];
        return [[]];
    } }, { http: false });
    assert.equal(r.total, 3);
    assert.deepEqual(r.faltando, []);
});
