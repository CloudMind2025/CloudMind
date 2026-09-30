const fs   = require('fs');
const path = require('path');
const { TABELAS_LIMPAR, abrirConexao, falhaAoConectar } = require('./_banco');

function decodificar(valor) {
    return valor && typeof valor === 'object' && typeof valor.__base64 === 'string'
        ? Buffer.from(valor.__base64, 'base64')
        : valor;
}

async function restaurar(conn, backup) {
    const inseridos = {};
    for (const { nome } of TABELAS_LIMPAR) {
        const linhas = (backup.tabelas[nome] && backup.tabelas[nome].linhas) || [];
        inseridos[nome] = 0;
        if (!linhas.length) continue;
        const colunas = Object.keys(linhas[0]);
        for (let i = 0; i < linhas.length; i += 200) {
            const lote = linhas.slice(i, i + 200).map(l => colunas.map(c => decodificar(l[c])));
            const [res] = await conn.query('INSERT INTO ?? (??) VALUES ?', [nome, colunas, lote]);
            inseridos[nome] += res.affectedRows;
        }
    }
    return inseridos;
}

async function reaplicarAutoIncrement(conn, backup) {
    for (const [nome, t] of Object.entries(backup.tabelas)) {
        if (t.autoIncrement) await conn.query('ALTER TABLE ?? AUTO_INCREMENT = ?', [nome, t.autoIncrement]);
    }
}

async function main() {
    const pasta = process.argv[2];
    if (!pasta) {
        console.error('Uso: node scripts/restaurarBanco.js <pasta do checkpoint>');
        process.exit(1);
    }
    const arquivo = path.resolve(pasta, 'banco', 'backup.json');
    if (!fs.existsSync(arquivo)) {
        console.error(`❌ Backup não encontrado: ${arquivo}`);
        process.exit(1);
    }
    const backup = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (backup.banco !== process.env.DB_NAME) {
        console.error(`❌ O backup é do banco "${backup.banco}", mas o .env aponta para "${process.env.DB_NAME}". Nada foi feito.`);
        process.exit(1);
    }

    const conn = await abrirConexao().catch(falhaAoConectar);
    try {
        console.log(`Restaurando o backup de ${backup.criadoEm}...\n`);
        await conn.beginTransaction();
        let inseridos;
        try {
            inseridos = await restaurar(conn, backup);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            if (err.code === 'ER_DUP_ENTRY') {
                console.error('❌ Conflito: já existe no banco um registro com a mesma chave.');
                console.error('   Provavelmente algo foi criado depois da limpeza (conta, produto...).');
                console.error(`   Detalhe: ${err.message}`);
                console.error('   Nada foi gravado.');
            } else {
                console.error('❌ Erro ao restaurar (nada foi gravado):', err.message);
            }
            process.exitCode = 1;
            return;
        }

        for (const [nome, n] of Object.entries(inseridos)) {
            if (n) console.log(`✅ ${nome.padEnd(18)} ${n} linha(s)`);
        }
        try {
            await reaplicarAutoIncrement(conn, backup);
            console.log('\n✅ Numeração (AUTO_INCREMENT) restaurada.');
        } catch (err) {
            console.log('\n⚠️  Os dados voltaram, mas a numeração não foi ajustada:', err.message);
        }
    } finally {
        await conn.end();
    }
}

if (require.main === module) main();

module.exports = { restaurar, reaplicarAutoIncrement };
