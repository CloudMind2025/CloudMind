const path  = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');

const RAIZ = path.resolve(__dirname, '..');

const TABELAS_LIMPAR = [
    { nome: 'usuario',  soNaoAdmin: true },
    { nome: 'cliente',  soNaoAdmin: true },
    { nome: 'criador',  soNaoAdmin: true },
    { nome: 'cupom' },
    { nome: 'produto' },
    { nome: 'tag' },
    { nome: 'produto_imagem' },
    { nome: 'produto_tag' },
    { nome: 'pergunta_produto' },
    { nome: 'carrinho' },
    { nome: 'item_carrinho' },
    { nome: 'pedido' },
    { nome: 'item_pedido' },
    { nome: 'cupom_uso' },
    { nome: 'pagamento' },
    { nome: 'pagamento_evento' },
    { nome: 'reembolso' },
    { nome: 'favorito' },
    { nome: 'avaliacao_produto' },
    { nome: 'avaliacao_criador' },
    { nome: 'denuncia' },
    { nome: 'suporte' }
];

const TABELAS_MANTER = ['administrador', 'categoria'];

const FILTRO_NAO_ADMIN = 'id_usuario NOT IN (SELECT id_usuario FROM administrador)';

function abrirConexao() {
    return mysql.createConnection({
        host:           process.env.DB_HOST     || '127.0.0.1',
        port:           parseInt(process.env.DB_PORT) || 3306,
        user:           process.env.DB_USER     || 'root',
        password:       process.env.DB_PASSWORD || '',
        database:       process.env.DB_NAME     || 'CLOUDMIND',
        connectTimeout: 15000,
        dateStrings:    true
    });
}

async function listarConexoes(conn) {
    const [[{ minha }]] = await conn.query('SELECT CONNECTION_ID() AS minha');
    const [lista] = await conn.query('SHOW PROCESSLIST');
    return lista
        .filter(p => p.User === process.env.DB_USER)
        .map(p => ({ ...p, minha: Number(p.Id) === Number(minha) }));
}

function limiteAtingido(err) {
    return err.code === 'ER_USER_LIMIT_REACHED' || err.code === 'ER_TOO_MANY_USER_CONNECTIONS';
}

function falhaAoConectar(err) {
    console.error('❌ Não foi possível conectar:', err.message);
    if (limiteAtingido(err)) explicarLimite();
    process.exit(1);
}

function explicarLimite() {
    console.error('');
    console.error('O usuário do banco já está com todas as conexões em uso (limite do Clever Cloud).');
    console.error('  1. Pare o que estiver conectado: o app local (Ctrl+C no npm start), o app publicado,');
    console.error('     scripts e clientes SQL (DBeaver, Workbench, phpMyAdmin).');
    console.error('  2. Conexões paradas caem sozinhas em até 5 minutos (wait_timeout = 300).');
    console.error('  3. Com uma vaga livre, "node scripts/conexoes.js --encerrar" derruba as que sobrarem.');
}

module.exports = {
    RAIZ,
    TABELAS_LIMPAR,
    TABELAS_MANTER,
    FILTRO_NAO_ADMIN,
    abrirConexao,
    listarConexoes,
    falhaAoConectar
};
