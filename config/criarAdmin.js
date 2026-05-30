require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function criarAdmin() {
    const conexao = await mysql.createConnection({
        host:     process.env.DB_HOST,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port:     process.env.DB_PORT || 3306
    });

    const email     = 'admin@cloudmind.com';
    const senha     = 'Admin@2025';
    const senhaHash = await bcrypt.hash(senha, 10);

    await conexao.query(
        `INSERT INTO usuario (nome_usuario, email_usuario, senha_usuario, status_usuario)
         VALUES ('CloudMind Admin', ?, ?, 'ativo')
         ON DUPLICATE KEY UPDATE senha_usuario = VALUES(senha_usuario), status_usuario = 'ativo'`,
        [email, senhaHash]
    );

    const [rows] = await conexao.query(
        'SELECT id_usuario FROM usuario WHERE email_usuario = ?', [email]
    );
    const id = rows[0].id_usuario;

    await conexao.query(
        `INSERT IGNORE INTO administrador (id_usuario, cargo) VALUES (?, 'administrador')`, [id]
    );

    const ok = await bcrypt.compare(senha, senhaHash);
    console.log('✅ Administrador criado/atualizado com sucesso!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   E-mail : ${email}`);
    console.log(`   Senha  : ${senha}`);
    console.log(`   Bcrypt : ${ok ? '✅ OK' : '❌ ERRO'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await conexao.end();
}

criarAdmin().catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
});
