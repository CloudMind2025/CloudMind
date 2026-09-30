const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');

function limparModulosDoApp() {
    for (const k of Object.keys(require.cache)) {
        if (k.startsWith(path.join(RAIZ, 'app')) || k.startsWith(path.join(RAIZ, 'config'))) delete require.cache[k];
    }
}

async function criarInstancia({ banco, driver, mercadoPago = null }) {
    limparModulosDoApp();
    const dbPath = require.resolve(path.join(RAIZ, 'config', 'db'));
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: banco.pool };

    const armazenamento = require(path.join(RAIZ, 'app', 'helpers', 'armazenamento'));
    armazenamento.definirDriver(driver);
    if (mercadoPago) require(path.join(RAIZ, 'app', 'helpers', 'mercadoPago')).definirDriver(mercadoPago);

    const express = require('express');
    const session = require('express-session');
    const moment = require('moment');
    moment.locale('pt-br');

    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(RAIZ, 'app', 'views'));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(session({ secret: 'x'.repeat(32), resave: false, saveUninitialized: true }));
    app.use((req, res, next) => {
        if (req.headers['x-usuario']) {
            req.session.usuario = JSON.parse(req.headers['x-usuario']);
            req.session.statusVerificadoEm = Date.now();
        }
        res.locals.usuarioLogado = req.session.usuario || null;
        res.locals.caminhoAtual = req.path;
        res.locals.moment = moment;
        res.locals.urlMidia = armazenamento.urlMidia;
        res.locals.urlFoto = armazenamento.urlFoto;
        next();
    });
    app.use('/', require(path.join(RAIZ, 'app', 'routes', 'routerPagamento')));
    app.use('/', require(path.join(RAIZ, 'app', 'routes', 'routerAdm')));
    app.use('/', require(path.join(RAIZ, 'app', 'routes', 'router')));
    app.use((err, req, res, next) => { console.error(err); res.status(500).send(String(err && err.stack)); });

    const servidor = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
    const base = `http://localhost:${servidor.address().port}`;
    return {
        base,
        armazenamento,
        fechar: () => new Promise(resolve => servidor.close(resolve)),
        cookies: {},
        async pedir(url, { usuario, metodo = 'GET', corpo, headers: extras = {} } = {}) {
            const headers = { ...extras, ...(usuario ? { 'x-usuario': JSON.stringify(usuario) } : {}) };
            const dono = usuario ? String(usuario.id_usuario) : null;
            if (dono && this.cookies[dono]) headers.cookie = this.cookies[dono];
            const resp = await fetch(base + url, { method: metodo, headers, body: corpo, redirect: 'manual' });
            const novo = resp.headers.get('set-cookie');
            if (novo && dono) this.cookies[dono] = novo.split(';')[0];
            return { status: resp.status, local: resp.headers.get('location'), cache: resp.headers.get('cache-control'),
                     tipo: resp.headers.get('content-type'), corpo: await resp.text() };
        }
    };
}

module.exports = { criarInstancia, RAIZ };
