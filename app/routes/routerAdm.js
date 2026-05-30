
//  CloudMind — Router Adm


const express  = require('express');
const router   = express.Router();

const Usuario  = require('../models/Usuario');
const Denuncia = require('../models/Denuncia');
const Suporte  = require('../models/Suporte');
const mailer   = require('../helpers/mailer');

// Middlewares 
function autenticar(req, res, next) {
    if (req.session.usuario) return next();
    res.redirect('/login');
}

function adminOnly(req, res, next) {
    if (req.session.usuario && req.session.usuario.tipo === 'admin') return next();
    res.redirect('/PProdutos');
}

// Aplica autenticação + restrição de admin apenas nas rotas /adm/* e /paineladm
router.use(['/adm', '/paineladm'], autenticar, adminOnly);


//  Painel ADM — visualização

router.get('/adm', (req, res) => res.render('pages/adm'));

router.get('/paineladm', async (req, res) => {
    try {
        const [usuarios, denuncias, tickets] = await Promise.all([
            Usuario.listarTodos(),
            Denuncia.listarTodas(),
            Suporte.listarTodos()
        ]);
        res.render('pages/paineladm', { usuarios, denuncias, tickets, msg: req.query.msg || null });
    } catch (err) {
        console.error(err);
        res.render('pages/paineladm', { usuarios: [], denuncias: [], tickets: [], msg: null });
    }
});


//  Gerenciamento de usuários

router.post('/adm/suspender', async (req, res) => {
    try {
        await Usuario.atualizarStatus(req.body.id_usuario, 'suspenso');
        res.redirect('/paineladm');
    } catch (err) {
        console.error(err);
        res.redirect('/paineladm');
    }
});

router.post('/adm/reativar', async (req, res) => {
    try {
        await Usuario.atualizarStatus(req.body.id_usuario, 'ativo');
        if (req.body.id_denuncia) await Denuncia.arquivar(req.body.id_denuncia);
        res.redirect('/paineladm');
    } catch (err) {
        console.error(err);
        res.redirect('/paineladm');
    }
});

router.post('/adm/excluir-permanente', async (req, res) => {
    try {
        const { id_usuario } = req.body;
        const usuario = await Usuario.buscarPorId(id_usuario);
        if (!usuario) return res.redirect('/paineladm');

        let emailOk = false;
        try {
            await mailer.enviarEmail({
                to: usuario.email,
                subject: 'Sua conta foi encerrada — CloudMind',
                html: `
                  <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:2rem;
                               border:1px solid #e2e8f0;border-radius:12px;">
                    <h2 style="color:#2b4c7e;margin-bottom:.5rem;">CloudMind</h2>
                    <p>Olá, <strong>${usuario.nome}</strong>!</p>
                    <p>Conforme solicitado, sua conta foi <strong>excluída permanentemente</strong> da plataforma.</p>
                    <p>Esperamos te ver novamente. 💙</p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0;">
                    <p style="font-size:.8rem;color:#94a3b8;">Equipe CloudMind</p>
                  </div>`
            });
            emailOk = true;
        } catch (mailErr) {
            console.error('E-mail de exclusão não enviado:', mailErr.message);
        }

        await Usuario.excluir(id_usuario);
        if (req.body.id_denuncia) await Denuncia.arquivar(req.body.id_denuncia);
        res.redirect(`/paineladm?msg=${emailOk ? 'conta_excluida' : 'conta_excluida_sem_email'}`);
    } catch (err) {
        console.error(err);
        res.redirect('/paineladm');
    }
});

//  Gerenciamento de denúncias

router.post('/adm/arquivar-denuncia', async (req, res) => {
    try {
        await Denuncia.arquivar(req.body.id_denuncia);
        res.redirect('/paineladm');
    } catch (err) {
        console.error(err);
        res.redirect('/paineladm');
    }
});

//  Gerenciamento de tickets de suporte

router.post('/adm/fechar-ticket', async (req, res) => {
    try {
        await Suporte.fechar(req.body.id_chamada);
        res.redirect('/paineladm');
    } catch (err) {
        console.error(err);
        res.redirect('/paineladm');
    }
});

router.post('/adm/excluir-ticket', async (req, res) => {
    try {
        await Suporte.excluir(req.body.id_chamada);
        res.redirect('/paineladm');
    } catch (err) {
        console.error(err);
        res.redirect('/paineladm');
    }
});

router.post('/adm/status-ticket', async (req, res) => {
    const { id_chamada, novo_status } = req.body;
    const statusValidos = ['aberto', 'em_andamento', 'pendente', 'resolvido', 'fechado'];
    try {
        if (statusValidos.includes(novo_status)) {
            await Suporte.atualizarStatus(id_chamada, novo_status);
        }
        res.redirect('/paineladm');
    } catch (err) {
        console.error(err);
        res.redirect('/paineladm');
    }
});


//  Diagnóstico de e-mail (remova após configurar)

router.get('/adm/testar-email', async (req, res) => {
    const nodemailer = require('nodemailer');
    const user = (process.env.EMAIL_USER || '').trim();
    const pass = (process.env.EMAIL_PASS || '').trim();
    const host = (process.env.EMAIL_HOST || 'smtp-relay.brevo.com').trim();
    const port = parseInt(process.env.EMAIL_PORT || '587', 10);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.write(`=== DIAGNÓSTICO DE E-MAIL ===\n`);
    res.write(`HOST : ${host}\n`);
    res.write(`PORT : ${port}\n`);
    res.write(`USER : ${user}\n`);
    res.write(`PASS : ${pass ? pass.substring(0, 8) + '...(oculto)' : '(vazio!)'}\n\n`);

    try {
        const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
        await t.verify();
        res.write('✅ CONEXÃO OK — credenciais aceitas.\n\n');
        await t.sendMail({
            from: `"CloudMind Teste" <${user}>`,
            to: user,
            subject: 'Teste CloudMind',
            text: 'E-mail de teste enviado com sucesso!'
        });
        res.write('✅ E-MAIL ENVIADO para ' + user + '\n');
    } catch (err) {
        res.write('❌ ERRO: ' + err.message + '\n');
        res.write('\nCódigo: ' + (err.code || 'N/A') + '\n');
        res.write('Resposta SMTP: ' + (err.response || 'N/A') + '\n');
    }
    res.end();
});

module.exports = router;
