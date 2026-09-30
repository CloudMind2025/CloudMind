require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

async function executarScript() {
    console.log('🔌 Conectando ao banco Clever Cloud...');

    const conexao = await mysql.createConnection({
        host:               process.env.DB_HOST,
        user:               process.env.DB_USER,
        password:           process.env.DB_PASSWORD,
        database:           process.env.DB_NAME,
        port:               process.env.DB_PORT || 3306,
        multipleStatements: true
    });

    console.log('✅ Conectado com sucesso!');

    const caminhoSQL = path.join(__dirname, 'SCRIPT.sql');
    const sql = fs.readFileSync(caminhoSQL, 'utf8');

    console.log('📄 Executando SCRIPT.sql...');

    await conexao.query(sql);

    console.log('✅ Banco de dados criado e populado com sucesso!');
    console.log('📋 Tabelas criadas: usuario, administrador, criador, cliente, categoria, produto, tag, produto_tag, avaliacao_produto, avaliacao_criador, pergunta_produto, favorito, carrinho, item_carrinho, pedido, item_pedido, cupom, cupom_uso, pagamento, pagamento_evento, reembolso, suporte, denuncia');

    await conexao.end();
    console.log('🔒 Conexão encerrada.');
}

executarScript().catch(err => {
    console.error('❌ Erro ao executar o script:', err.message);
    process.exit(1);
});
