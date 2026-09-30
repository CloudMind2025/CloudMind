const express  = require('express');
const router   = express.Router();

const Usuario  = require('../models/Usuario');
const Denuncia = require('../models/Denuncia');
const Suporte  = require('../models/Suporte');
const Pedido   = require('../models/Pedido');
const mailer   = require('../helpers/mailer');
const { autenticar, adminOnly } = require('../middlewares/auth');

router.use(['/adm', '/paineladm'], autenticar, adminOnly);

const voltar = (res, msg) => res.redirect(msg ? `/paineladm?msg=${msg}` : '/paineladm');

function idValido(valor) {
    const id = Number.parseInt(valor, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function alvoProtegido(req, id_usuario) {
    return Number(id_usuario) === Number(req.session.usuario.id_usuario) || await Usuario.ehAdmin(id_usuario);
}

//  Painel ADM — visualização

router.get('/adm', (req, res) => res.redirect('/paineladm'));

router.get('/paineladm', async (req, res) => {
    const msg = req.query.msg || null;
    try {
        const [usuarios, denuncias, tickets, serieVendas, listaCupons] = await Promise.all([
            Usuario.listarTodos(),
            Denuncia.listarTodas(),
            Suporte.listarTodos(),
            Pedido.serieVendas().catch(err => { console.error(err); return null; }),
            Cupom.listarTodos().catch(() => null)
        ]);
        const dia = cupons.hoje();
        const cuponsAtivos = listaCupons ? listaCupons.filter(c => cupons.status(c, dia) === 'ativo').length : null;
        res.render('pages/paineladm', { usuarios, denuncias, tickets, serieVendas, cuponsAtivos, msg, erroCarga: false });
    } catch (err) {
        console.error(err);
        res.render('pages/paineladm', { usuarios: [], denuncias: [], tickets: [], serieVendas: null, cuponsAtivos: null, msg, erroCarga: true });
    }
});


//  Gerenciamento de usuários

router.post('/adm/suspender', async (req, res) => {
    const id = idValido(req.body.id_usuario);
    try {
        if (!id) return voltar(res, 'erro');
        if (await alvoProtegido(req, id)) return voltar(res, 'bloqueado_admin');
        const resultado = await Usuario.suspender(id);
        if (!resultado) return voltar(res, 'erro');
        voltar(res, resultado.produtos ? 'usuario_suspenso_produtos' : 'usuario_suspenso');
    } catch (err) {
        console.error(err);
        voltar(res, 'erro');
    }
});

router.post('/adm/reativar', async (req, res) => {
    const id = idValido(req.body.id_usuario);
    try {
        if (!id) return voltar(res, 'erro');
        const resultado = await Usuario.reativar(id);
        if (!resultado) return voltar(res, 'erro');
        if (req.body.id_denuncia) await Denuncia.arquivar(req.body.id_denuncia);
        voltar(res, resultado.produtos ? 'usuario_reativado_produtos' : 'usuario_reativado');
    } catch (err) {
        console.error(err);
        voltar(res, 'erro');
    }
});

router.post('/adm/excluir-permanente', async (req, res) => {
    const id = idValido(req.body.id_usuario);
    try {
        if (!id) return voltar(res, 'erro');
        if (await alvoProtegido(req, id)) return voltar(res, 'bloqueado_admin');
        const usuario = await Usuario.buscarPorId(id);
        if (!usuario) return voltar(res, 'erro');

        const resultado = await Usuario.excluir(id);
        if (!resultado) return voltar(res, 'erro');
        if (req.body.id_denuncia) await Denuncia.arquivar(req.body.id_denuncia).catch(() => {});

        const nome = mailer.escaparHtml(usuario.nome);
        const texto = resultado === 'excluida'
            ? `<p>Conforme solicitado, sua conta foi <strong>excluída permanentemente</strong> da plataforma.</p>
               <p>Esperamos te ver novamente. 💙</p>`
            : `<p>Sua conta foi <strong>desativada</strong>. Como há vendas ou pagamentos registrados nela,
               esses registros foram mantidos (inclusive para que quem comprou seus produtos continue com acesso).</p>
               <p>Seus produtos, se houver, não aparecem mais na plataforma.</p>`;
        let emailOk = false;
        try {
            await mailer.enviarEmail({
                to: usuario.email,
                subject: resultado === 'excluida' ? 'Sua conta foi encerrada — CloudMind' : 'Sua conta foi desativada — CloudMind',
                html: `
                  <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:2rem;
                               border:1px solid #e2e8f0;border-radius:12px;">
                    <h2 style="color:#2b4c7e;margin-bottom:.5rem;">CloudMind</h2>
                    <p>Olá, <strong>${nome}</strong>!</p>
                    ${texto}
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0;">
                    <p style="font-size:.8rem;color:#64748b;">Equipe CloudMind</p>
                  </div>`
            });
            emailOk = true;
        } catch (mailErr) {
            console.error('E-mail de exclusão não enviado:', mailErr.message);
        }

        if (resultado === 'desativada') return voltar(res, emailOk ? 'conta_desativada_vendas' : 'conta_desativada_vendas_sem_email');
        voltar(res, emailOk ? 'conta_excluida' : 'conta_excluida_sem_email');
    } catch (err) {
        console.error(err);
        voltar(res, 'erro');
    }
});

//  Gerenciamento de denúncias

router.post('/adm/arquivar-denuncia', async (req, res) => {
    try {
        await Denuncia.arquivar(req.body.id_denuncia);
        voltar(res, 'denuncia_arquivada');
    } catch (err) {
        console.error(err);
        voltar(res, 'erro');
    }
});

//  Gerenciamento de tickets de suporte

router.post('/adm/fechar-ticket', async (req, res) => {
    try {
        await Suporte.fechar(req.body.id_chamada);
        voltar(res, 'ticket_atualizado');
    } catch (err) {
        console.error(err);
        voltar(res, 'erro');
    }
});

router.post('/adm/excluir-ticket', async (req, res) => {
    try {
        await Suporte.excluir(req.body.id_chamada);
        voltar(res, 'ticket_excluido');
    } catch (err) {
        console.error(err);
        voltar(res, 'erro');
    }
});

router.post('/adm/status-ticket', async (req, res) => {
    const { id_chamada, novo_status } = req.body;
    const statusValidos = ['aberto', 'em_andamento', 'pendente', 'resolvido', 'fechado'];
    try {
        if (!statusValidos.includes(novo_status)) return voltar(res, 'erro');
        await Suporte.atualizarStatus(id_chamada, novo_status);
        voltar(res, 'ticket_atualizado');
    } catch (err) {
        console.error(err);
        voltar(res, 'erro');
    }
});

// ============================================================
//  Cupons de desconto
// ============================================================
const Cupom   = require('../models/Cupom');
const Criador = require('../models/Criador');
const cupons  = require('../helpers/cupons');
const apresentacaoProduto = require('../helpers/apresentacaoProduto');

function lerFlashCupons(req) {
    const f = req.session.flashCupons || null;
    delete req.session.flashCupons;
    return f;
}

function voltarCupons(req, res, flash, ancora = '') {
    req.session.flashCupons = flash;
    res.redirect(`/adm/cupons${flash && flash.editar ? `?editar=${flash.editar}` : ''}${ancora}`);
}

router.get('/adm/cupons', async (req, res) => {
    const flash = lerFlashCupons(req);
    const dia = cupons.hoje();
    try {
        const [lista, vendedores] = await Promise.all([Cupom.listarTodos(), Criador.listarTodos()]);
        const idEditar = idValido(req.query.editar);
        const editando = idEditar ? lista.find(c => c.id_cupom === idEditar) || null : null;
        res.render('pages/admcupons', {
            cupons: lista.map(c => ({ ...c, status: cupons.status(c, dia) })),
            vendedores, editando, dia,
            aviso: flash && flash.aviso ? flash.aviso : (idEditar && !editando ? { tipo: 'erro', msg: 'Cupom não encontrado.' } : null),
            erros: flash && flash.erros ? flash.erros : [],
            campos: flash && flash.campos ? flash.campos : null,
            STATUS: cupons.STATUS, rotuloDesconto: cupons.rotuloDesconto, dataBR: cupons.dataBR,
            formatarPreco: apresentacaoProduto.formatarPreco
        });
    } catch (err) {
        console.error(err);
        res.render('pages/admcupons', {
            cupons: [], vendedores: [], editando: null, dia, erros: [], campos: null,
            aviso: { tipo: 'erro', msg: 'Não foi possível carregar os cupons agora. Recarregue a página.' },
            STATUS: cupons.STATUS, rotuloDesconto: cupons.rotuloDesconto, dataBR: cupons.dataBR,
            formatarPreco: apresentacaoProduto.formatarPreco
        });
    }
});

async function salvarCupom(req, res, id_cupom) {
    const campos = { ...req.body };
    try {
        const atual = id_cupom ? await Cupom.buscarPorId(id_cupom) : null;
        if (id_cupom && !atual) return voltarCupons(req, res, { aviso: { tipo: 'erro', msg: 'Cupom não encontrado.' } });

        const validos = new Set((await Criador.listarTodos()).map(v => Number(v.id_usuario)));
        if (atual) validos.add(Number(atual.id_criador));
        const { erros, dados } = cupons.validarDadosAdmin(req.body, {
            criadoresValidos: validos, usosAtuais: atual ? atual.usos : 0, edicao: !!atual
        });
        if (erros.length) return voltarCupons(req, res, { erros, campos, editar: id_cupom || null }, '#form-cupom');

        if (atual) await Cupom.atualizar(id_cupom, dados);
        else await Cupom.criar(dados, req.session.usuario.id_usuario);
        voltarCupons(req, res, { aviso: { tipo: 'sucesso', msg: atual ? `Cupom ${dados.codigo} atualizado.` : `Cupom ${dados.codigo} criado com sucesso.` } });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return voltarCupons(req, res, {
                erros: [`Já existe um cupom com o código ${cupons.normalizarCodigo(req.body.codigo)}. Escolha outro código.`],
                campos, editar: id_cupom || null
            }, '#form-cupom');
        }
        console.error(err);
        voltarCupons(req, res, { erros: ['Não foi possível salvar o cupom agora. Tente novamente.'], campos, editar: id_cupom || null }, '#form-cupom');
    }
}

router.post('/adm/cupons', (req, res) => salvarCupom(req, res, null));

router.post('/adm/cupons/:id', (req, res) => {
    const id = idValido(req.params.id);
    if (!id) return voltarCupons(req, res, { aviso: { tipo: 'erro', msg: 'Cupom não encontrado.' } });
    salvarCupom(req, res, id);
});

router.post('/adm/cupons/:id/ativo', async (req, res) => {
    const id = idValido(req.params.id);
    const ativar = req.body.ativo === '1';
    try {
        const cupom = id ? await Cupom.buscarPorId(id) : null;
        if (!cupom || !(await Cupom.definirAtivo(id, ativar))) {
            return voltarCupons(req, res, { aviso: { tipo: 'erro', msg: 'Cupom não encontrado.' } });
        }
        voltarCupons(req, res, { aviso: { tipo: 'sucesso', msg: ativar ? `Cupom ${cupom.codigo} ativado.` : `Cupom ${cupom.codigo} desativado: ele não pode mais ser usado.` } });
    } catch (err) {
        console.error(err);
        voltarCupons(req, res, { aviso: { tipo: 'erro', msg: 'Não foi possível alterar o cupom agora.' } });
    }
});

router.post('/adm/cupons/:id/excluir', async (req, res) => {
    const id = idValido(req.params.id);
    try {
        const cupom = id ? await Cupom.buscarPorId(id) : null;
        const resultado = cupom ? await Cupom.excluir(id) : null;
        if (!resultado) return voltarCupons(req, res, { aviso: { tipo: 'erro', msg: 'Cupom não encontrado.' } });
        voltarCupons(req, res, {
            aviso: resultado === 'excluido'
                ? { tipo: 'sucesso', msg: `Cupom ${cupom.codigo} excluído.` }
                : { tipo: 'info', msg: `O cupom ${cupom.codigo} já foi usado em pedidos, então foi desativado em vez de apagado (o histórico das compras é mantido).` }
        });
    } catch (err) {
        console.error(err);
        voltarCupons(req, res, { aviso: { tipo: 'erro', msg: 'Não foi possível excluir o cupom agora.' } });
    }
});

// ============================================================
//  Migração dos uploads antigos para o storage
// ============================================================
function paginaMigracao(res, titulo, relatorio, podeExecutar) {
    const json = JSON.stringify(relatorio, null, 2).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    res.set('Cache-Control', 'no-store').send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${titulo} — CloudMind</title><meta name="robots" content="noindex"></head>
<body style="font-family:system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px">
<h1 style="font-size:1.3rem">${titulo}</h1>
${podeExecutar ? `<form method="POST" action="/adm/migrar-uploads"><button type="submit" style="padding:10px 16px">Executar migração</button></form>` : ''}
<p><a href="/paineladm">Voltar ao painel</a></p><pre style="background:#f4f4f4;padding:12px;overflow:auto">${json}</pre></body></html>`);
}

router.get('/adm/migrar-uploads', async (req, res) => {
    try {
        const pool = require('../../config/db');
        const relatorio = await require('../helpers/migracaoUploads').migrar(pool, { confirmar: false });
        paginaMigracao(res, 'Migração de uploads — simulação', relatorio, relatorio.seriaMigrado.length > 0);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Não foi possível simular a migração: ${String(err.message).replace(/[<>&]/g, '')}`);
    }
});

router.post('/adm/migrar-uploads', async (req, res) => {
    try {
        const pool = require('../../config/db');
        const relatorio = await require('../helpers/migracaoUploads').migrar(pool, { confirmar: true, log: m => console.log('[migrar-uploads]', m) });
        paginaMigracao(res, 'Migração de uploads — resultado', relatorio, false);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Não foi possível migrar: ${String(err.message).replace(/[<>&]/g, '')}`);
    }
});

module.exports = router;
