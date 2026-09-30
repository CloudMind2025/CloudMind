require('dotenv').config();
const path    = require('path');
const crypto  = require('crypto');
const express = require("express");
const session = require("express-session");
const moment  = require("moment");
moment.locale('pt-br');

const pool = require('./config/db');
const armazenamento = require('./app/helpers/armazenamento');
const pagamento = require('./app/helpers/pagamento');
// Em produção, lança se faltar configuração ou se o modo for demonstração (o boot falha).
pagamento.validarConfiguracao().forEach(msg => console.warn(`⚠️  Pagamento: ${msg}`));
if (!pagamento.cobrancaOnline()) {
    console.warn('⚠️  Pagamento em modo DEMONSTRAÇÃO: as compras são aprovadas sem cobrança (proibido em produção).');
}
if (!armazenamento.configurado()) {
    console.warn('⚠️  Storage (Clever Cloud Cellar) não configurado: uploads ficam DESATIVADOS até definir ' +
        'STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY e STORAGE_SECRET_KEY (veja .env.example).');
}
(async () => {
    try {
        await pool.query(`ALTER TABLE suporte MODIFY COLUMN id_usuario INT NULL`);
    } catch (_) {}
    try {
        await pool.query(
            `ALTER TABLE suporte MODIFY COLUMN status_chamada ` +
            `ENUM('aberto','em_andamento','pendente','resolvido','fechado') DEFAULT 'aberto'`
        );
    } catch (_) {}
})();

process.on('uncaughtException',  err => console.error('❌ uncaughtException:',  err));
process.on('unhandledRejection', err => console.error('❌ unhandledRejection:', err));

const app  = express();
const port = process.env.APP_PORT || 3000;

const cookieSeguro = process.env.COOKIE_SECURE === 'true';
if (cookieSeguro) app.set('trust proxy', 1);

app.use((req, res, next) => {
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

app.use(express.static(path.join(__dirname, 'app', 'public')));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, 'app', 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const emProducao = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET) {
    console.warn(emProducao
        ? '❌ PRODUÇÃO sem SESSION_SECRET no .env: defina um segredo fixo (veja .env.example).'
        : '⚠️  SESSION_SECRET não definido no .env: usando um segredo temporário.');
} else if (process.env.SESSION_SECRET.length < 32) {
    console.warn('⚠️  SESSION_SECRET curto: use pelo menos 32 caracteres aleatórios (veja .env.example).');
}
if (emProducao && !cookieSeguro) {
    console.warn('❌ PRODUÇÃO sem COOKIE_SECURE=true: o cookie de login também trafega sem HTTPS (veja .env.example).');
}
app.use(session({
    name: 'cloudmind.sid',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 8,
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSeguro
    }
}));

app.use((req, res, next) => {
    res.locals.usuarioLogado = req.session.usuario || null;
    res.locals.caminhoAtual  = req.path;
    res.locals.moment        = moment;
    res.locals.urlMidia      = armazenamento.urlMidia;
    res.locals.urlFoto       = armazenamento.urlFoto;
    next();
});

var rotas    = require("./app/routes/router");
var rotasAdm = require("./app/routes/routerAdm");
var rotasPagamento = require("./app/routes/routerPagamento");

app.use("/", rotasPagamento);
app.use("/", rotasAdm);
app.use("/", rotas);

// 404 — nenhuma rota atendeu
app.use((req, res) => {
    if (req.accepts(['html', 'json']) === 'json') return res.status(404).json({ erro: 'Recurso não encontrado.' });
    res.status(404).render('pages/erro', { codigo: 404 });
});

app.use((err, req, res, next) => {
    console.error('❌ Erro não tratado em', req.method, req.originalUrl, err);
    if (res.headersSent) return next(err);
    const codigo = err.status === 403 ? 403 : 500;
    if (req.accepts(['html', 'json']) === 'json') {
        return res.status(codigo).json({ erro: 'Não foi possível concluir a ação agora. Tente novamente.' });
    }
    res.status(codigo).render('pages/erro', { codigo }, (erroRender, html) => {
        if (erroRender) {
            console.error(erroRender);
            return res.type('text').send('Não foi possível carregar a página. Tente novamente em instantes.');
        }
        res.send(html);
    });
});

app.listen(port, () => {
    console.log(`Servidor ouvindo na porta ${port}\nhttp://localhost:${port}`);
});
