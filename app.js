require('dotenv').config();
const express = require("express");
const session = require("express-session");
const moment  = require("moment");
moment.locale('pt-br');

// Migrations automáticas ao iniciar o servidor
const pool = require('./config/db');
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

app.use(express.static("./app/public"));
app.set("view engine", "ejs");
app.set("views", "./app/views");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessão
app.use(session({
    secret: 'cloudmind_secret_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// Disponibiliza para todas as views: usuário logado e helper moment
app.use((req, res, next) => {
    res.locals.usuarioLogado = req.session.usuario || null;
    res.locals.moment        = moment; // uso nas views: moment(data).format('DD/MM/YYYY')
    next();
});

var rotas    = require("./app/routes/router");
var rotasAdm = require("./app/routes/routerAdm");

app.use("/", rotasAdm);
app.use("/", rotas);

app.listen(port, () => {
    console.log(`Servidor ouvindo na porta ${port}\nhttp://localhost:${port}`);
});
