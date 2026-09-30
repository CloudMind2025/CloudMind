const fs   = require('fs');
const path = require('path');
const { RAIZ, abrirConexao, falhaAoConectar } = require('./_banco');
const armazenamento = require('../app/helpers/armazenamento');
const migracao = require('../app/helpers/migracaoUploads');

const confirmar = process.argv.includes('--confirmar');
const modoVerificar = process.argv.includes('--verificar');
const modoOrfaos = process.argv.includes('--orfaos');

function pastaRelatorio() {
    const d = new Date();
    const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const pasta = path.join(RAIZ, '_checkpoints', `migracao-uploads-${data}`);
    fs.mkdirSync(pasta, { recursive: true });
    return pasta;
}

(async () => {
    if (!armazenamento.configurado()) {
        console.error('❌ Storage não configurado. Defina STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY e STORAGE_SECRET_KEY no .env (veja .env.example).');
        process.exit(1);
    }
    const conn = await abrirConexao().catch(falhaAoConectar);
    try {
        if (modoVerificar) {
            const r = await migracao.verificar(conn);
            console.log(`Chaves no banco: ${r.total}`);
            console.log(`Faltando no storage: ${r.faltando.length}`);
            r.faltando.forEach(f => console.log(`  ✘ ${f.tabela}#${f.id}.${f.coluna}: ${f.chave}`));
            console.log(`Públicas que não abrem pela URL: ${r.publicasInacessiveis.length}`);
            r.publicasInacessiveis.forEach(f => console.log(`  ✘ ${f.chave} (HTTP ${f.status})`));
            process.exitCode = r.faltando.length || r.publicasInacessiveis.length ? 1 : 0;
            return;
        }
        if (modoOrfaos) {
            const lista = await migracao.orfaos(conn);
            console.log(`Objetos sem registro no banco: ${lista.length} (nada foi apagado)`);
            lista.forEach(o => console.log(`  • ${o.chave} (${o.tamanho} bytes)`));
            return;
        }

        console.log(confirmar ? 'Migrando uploads antigos para o storage…' : 'SIMULAÇÃO (nada será alterado). Use --confirmar para executar.');
        const r = await migracao.migrar(conn, { confirmar, log: m => console.log(m) });
        console.log('');
        if (confirmar) {
            console.log(`✔ Migrados: ${r.migrados.length}   ✔ Já estavam no storage: ${r.jaNoStorage.length}`);
        } else {
            console.log(`Seriam migrados: ${r.seriaMigrado.length}`);
            r.seriaMigrado.forEach(i => console.log(`  • ${i.tabela}#${i.id}: ${i.valor} → ${i.chave}${i.jaNoStorage ? ' (já no storage)' : ''}`));
        }
        console.log(`✘ Não recuperáveis nesta máquina: ${r.naoRecuperaveis.length}   ✘ Erros: ${r.erros.length}`);
        r.naoRecuperaveis.forEach(i => console.log(`  • ${i.tipo} — ${i.tabela}#${i.id}: ${i.valor}`));
        r.erros.forEach(i => console.log(`  • ERRO ${i.tabela}#${i.id}: ${i.erro}`));

        const arquivo = path.join(pastaRelatorio(), confirmar ? 'relatorio.json' : 'simulacao.json');
        fs.writeFileSync(arquivo, JSON.stringify(r, null, 2));
        console.log(`\nRelatório: ${path.relative(RAIZ, arquivo)}`);
        if (r.erros.length) process.exitCode = 1;
    } catch (err) {
        console.error('❌', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
