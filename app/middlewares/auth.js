const Usuario = require('../models/Usuario');

const REVALIDAR_MS = 5 * 60 * 1000;

function caminhoInterno(valor) {
    if (typeof valor !== 'string' || !valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) return null;
    if (/[\r\n\t]/.test(valor) || valor.length > 500) return null;
    if (/^\/(login|logout|cadastro)(\/|\?|$)/i.test(valor)) return null;
    return valor;
}

function destinoDepoisDoLogin(req) {
    if (req.method === 'GET') return caminhoInterno(req.originalUrl);
    try {
        const ref = new URL(req.get('referer') || '');
        if (ref.host === req.get('host')) return caminhoInterno(ref.pathname + ref.search);
    } catch (_) {}
    return null;
}

async function autenticar(req, res, next) {
    const u = req.session.usuario;
    if (!u) {
        const destino = destinoDepoisDoLogin(req);
        if (destino) req.session.voltarPara = destino;
        return res.redirect('/login');
    }

    const agora = Date.now();
    if (!req.session.statusVerificadoEm || agora - req.session.statusVerificadoEm > REVALIDAR_MS) {
        try {
            const status = await Usuario.buscarStatus(u.id_usuario);
            if (status !== 'ativo') {
                return req.session.destroy(() => res.redirect('/login?msg=sessao_encerrada'));
            }
            req.session.statusVerificadoEm = agora;
        } catch (err) {
            console.error('Revalidação de sessão falhou:', err.message);
        }
    }
    next();
}

function adminOnly(req, res, next) {
    if (req.session.usuario && req.session.usuario.tipo === 'admin') return next();
    res.redirect('/PProdutos');
}

module.exports = { autenticar, adminOnly, caminhoInterno };
