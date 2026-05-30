// ============================================================
//  CloudMind — Pool de Conexões MySQL
// ============================================================

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || '127.0.0.1',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'CLOUDMIND',
    waitForConnections: true,
    connectionLimit:    5,
    queueLimit:         0,
    connectTimeout:     10000
});

// Evita crash do processo quando a conexão remota cai ou expira
pool.on('error', err => {
    console.error('❌ Erro no pool de conexões:', err.message);
});

// Testa a conexão ao iniciar o servidor e aplica migrações automáticas
pool.getConnection()
    .then(async conn => {
        console.log('✅ Banco de dados conectado com sucesso!');
        const [cols] = await conn.query(
            `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario' AND COLUMN_NAME = 'foto_usuario'`
        );
        if (Number(cols[0].existe) === 0) {
            await conn.query(`ALTER TABLE usuario ADD COLUMN foto_usuario VARCHAR(255) NULL DEFAULT NULL`);
            console.log('✅ Coluna foto_usuario adicionada à tabela usuario.');
        }
        const [colsCpf] = await conn.query(
            `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'criador' AND COLUMN_NAME = 'cpf'`
        );
        if (Number(colsCpf[0].existe) === 0) {
            await conn.query(`ALTER TABLE criador ADD COLUMN cpf CHAR(11) NULL`);
            console.log('✅ Coluna cpf adicionada à tabela criador.');
        }
        conn.release();
    })
    .catch(err => {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
    });

module.exports = pool;
