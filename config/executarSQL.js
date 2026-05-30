// ============================================================
//  CloudMind — Executar script SQL no Clever Cloud
//  Arquivo: config/executarSQL.js
//
//  Como usar:
//  1. Certifique-se que o .env está correto
//  2. No terminal rode: node config/executarSQL.js
// ============================================================

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
        database:           process.env.DB_NAME,      // ← indica o banco a usar
        port:               process.env.DB_PORT || 3306,
        multipleStatements: true   // permite rodar múltiplos comandos SQL de uma vez
    });

    console.log('✅ Conectado com sucesso!');

    // Lê o arquivo SCRIPT.sql
    const caminhoSQL = path.join(__dirname, 'SCRIPT.sql');
    const sql = fs.readFileSync(caminhoSQL, 'utf8');

    console.log('📄 Executando SCRIPT.sql...');

    await conexao.query(sql);

    console.log('✅ Banco de dados criado e populado com sucesso!');
    console.log('📋 Tabelas criadas: usuario, administrador, criador, cliente, categoria, produto, tag, produto_tag, avaliacao_produto, avaliacao_criador, favorito, carrinho, item_carrinho, pedido, item_pedido, reembolso, suporte, denuncia');

    await conexao.end();
    console.log('🔒 Conexão encerrada.');
}

executarScript().catch(err => {
    console.error('❌ Erro ao executar o script:', err.message);
    process.exit(1);
});
