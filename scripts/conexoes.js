const { abrirConexao, listarConexoes, falhaAoConectar } = require('./_banco');

const encerrar = process.argv.includes('--encerrar');

function mostrar(conexoes, limite) {
    console.log(`Conexões abertas: ${conexoes.length} de ${limite}\n`);
    for (const c of conexoes) {
        const ip    = String(c.Host || '').split(':')[0];
        const acao  = c.Command === 'Sleep' ? 'parada' : c.Command;
        const texto = c.Info ? ` — ${String(c.Info).replace(/\s+/g, ' ').slice(0, 60)}` : '';
        console.log(`  #${c.Id}  ${ip.padEnd(15)}  ${String(acao).padEnd(8)}  há ${c.Time}s${c.minha ? '  (este script)' : ''}${texto}`);
    }
}

(async () => {
    const conn = await abrirConexao().catch(falhaAoConectar);

    try {
        const [[{ limite }]] = await conn.query('SELECT @@max_user_connections AS limite');
        const conexoes = await listarConexoes(conn);
        mostrar(conexoes, limite);

        const outras = conexoes.filter(c => !c.minha);
        if (!encerrar) {
            if (outras.length) console.log('\nPara derrubar as outras: node scripts/conexoes.js --encerrar');
            return;
        }

        console.log('');
        if (!outras.length) {
            console.log('Nenhuma outra conexão para encerrar.');
            return;
        }
        for (const c of outras) {
            try {
                await conn.query(`KILL ${Number(c.Id)}`);
                console.log(`✅ Conexão #${c.Id} encerrada.`);
            } catch (err) {
                console.log(`⚠️  Conexão #${c.Id}: ${err.message}`);
            }
        }
        const restantes = await listarConexoes(conn);
        console.log(`\nAgora: ${restantes.length} de ${limite} (contando este script, que fecha ao terminar).`);
    } catch (err) {
        console.error('❌ Erro:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
