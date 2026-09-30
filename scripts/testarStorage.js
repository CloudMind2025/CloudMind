const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const armazenamento = require('../app/helpers/armazenamento');

const ID_TESTE = 999999999;

async function testar({ log = console.log } = {}) {
    let falhas = 0;
    const ok = (cond, msg, extra = '') => { log(`${cond ? '  ✔' : '  ✘'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!cond) falhas++; return cond; };

    if (!armazenamento.configurado()) {
        log('❌ Storage não configurado: defina STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY e STORAGE_SECRET_KEY.');
        return 1;
    }
    const cfg = armazenamento.config();
    log(`Storage: ${cfg.endpoint} · bucket "${cfg.bucket}" · URL pública: ${cfg.urlPublica}`);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudmind-teste-'));
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), crypto.randomBytes(256)]);
    const bin = crypto.randomBytes(1024);
    const arqPng = path.join(dir, 'a.png');
    const arqBin = path.join(dir, 'b.bin');
    fs.writeFileSync(arqPng, png);
    fs.writeFileSync(arqBin, bin);
    const chavePublica = armazenamento.novaChave('products', ID_TESTE, 'cover', 'png', 'teste-');
    const chavePrivada = armazenamento.novaChave('products', ID_TESTE, 'files', 'bin', 'teste-');

    try {
        await armazenamento.enviar({ chave: chavePublica, caminho: arqPng, tipo: 'image/png', publico: true });
        ok(true, 'Objeto público enviado e confirmado (HEAD)', chavePublica);
        await armazenamento.enviar({ chave: chavePrivada, caminho: arqBin, tipo: 'application/octet-stream', publico: false });
        ok(true, 'Objeto privado enviado e confirmado (HEAD)', chavePrivada);

        fs.rmSync(dir, { recursive: true, force: true });
        ok(!fs.existsSync(arqPng), 'Arquivos locais apagados (nada depende deles)');

        const saida = execFileSync(process.execPath, ['-e', `
            require('dotenv').config({ path: ${JSON.stringify(path.join(__dirname, '..', '.env'))}, quiet: true });
            const a = require(${JSON.stringify(path.join(__dirname, '..', 'app', 'helpers', 'armazenamento'))});
            Promise.all([a.info(${JSON.stringify(chavePublica)}), a.info(${JSON.stringify(chavePrivada)})])
              .then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e.message); process.exit(1); });
        `], { encoding: 'utf8' });
        const [infoPub, infoPriv] = JSON.parse(saida.trim().split('\n').pop());
        ok(infoPub && infoPub.tamanho === png.length && infoPriv && infoPriv.tamanho === bin.length,
            'Outro processo (sem os arquivos locais) encontra os dois objetos');

        const rPub = await fetch(armazenamento.urlMidia(chavePublica));
        const corpoPub = Buffer.from(await rPub.arrayBuffer());
        ok(rPub.status === 200 && corpoPub.equals(png), 'URL pública abre com o mesmo conteúdo', `HTTP ${rPub.status}`);

        const urlSemAssinatura = `${cfg.urlPublica}/${chavePrivada}`;
        const rPriv = await fetch(urlSemAssinatura);
        ok(rPriv.status === 401 || rPriv.status === 403, 'Arquivo privado NÃO abre sem assinatura', `HTTP ${rPriv.status}`);

        const urlAssinada = await armazenamento.urlDownload(chavePrivada, 'Produto de teste.bin');
        const rAss = await fetch(urlAssinada);
        const corpoAss = Buffer.from(await rAss.arrayBuffer());
        ok(rAss.status === 200 && corpoAss.equals(bin), 'Arquivo privado abre pela URL assinada', `HTTP ${rAss.status}`);
        ok(/attachment/i.test(rAss.headers.get('content-disposition') || ''), 'Download vem como anexo com o nome do produto',
            rAss.headers.get('content-disposition') || 'sem Content-Disposition');
    } catch (err) {
        ok(false, 'Erro durante o teste', err.message);
    } finally {
        await armazenamento.remover(chavePublica);
        await armazenamento.remover(chavePrivada);
        fs.rmSync(dir, { recursive: true, force: true });
        const restou = (await armazenamento.info(chavePublica).catch(() => null)) || (await armazenamento.info(chavePrivada).catch(() => null));
        ok(!restou, 'Objetos de teste removidos');
    }
    log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTudo certo: o storage está pronto para os uploads.');
    return falhas ? 1 : 0;
}

if (require.main === module) {
    testar().then(codigo => { process.exitCode = codigo; });
}

module.exports = { testar };
