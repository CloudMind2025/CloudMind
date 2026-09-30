var express = require('express');
var router  = express.Router();
const bcrypt = require('bcryptjs');
const pool   = require('../../config/db');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const os     = require('os');

const Usuario = require('../models/Usuario');
const Cliente = require('../models/Cliente');
const Criador = require('../models/Criador');
const Produto  = require('../models/Produto');
const Pedido   = require('../models/Pedido');
const Pagamento = require('../models/Pagamento');
const Carrinho = require('../models/Carrinho');
const Favorito = require('../models/Favorito');
const Suporte  = require('../models/Suporte');
const Denuncia = require('../models/Denuncia');
const AvaliacaoProduto = require('../models/AvaliacaoProduto');
const PerguntaProduto  = require('../models/PerguntaProduto');
const mailer   = require('../helpers/mailer');
const apresentacaoProduto = require('../helpers/apresentacaoProduto');
const arquivosProduto     = require('../helpers/arquivosProduto');
const imagensProduto      = require('../helpers/imagensProduto');
const pagamento           = require('../helpers/pagamento');
const armazenamento       = require('../helpers/armazenamento');
const tiposProduto        = require('../helpers/tiposProduto');
const cupons              = require('../helpers/cupons');
const Cupom               = require('../models/Cupom');
const { autenticar, caminhoInterno } = require('../middlewares/auth');

const { validationResult } = require('express-validator');
const {
    validarCadastro,
    validarAlterarSenha,
    validarEditarDados,
    validarProduto,
    validarEdicaoProduto,
    validarSuporte,
    validarDenuncia,
    validarPergunta,
    validarResposta,
    validarAvaliacao,
    validarPaginaPublica
} = require('../validators/cloudmindValidator');

const tempDir = path.join(os.tmpdir(), 'cloudmind-uploads');
fs.mkdirSync(tempDir, { recursive: true });

const armazenamentoTemp = multer.diskStorage({
    destination: (req, file, cb) => fs.mkdir(tempDir, { recursive: true }, () => cb(null, tempDir)),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.tmp`)
});

function filtroImagem(req, file, cb) {
    if (imagensProduto.formatoAceito(file)) return cb(null, true);
    cb(new Error('Formato inválido. Use uma imagem JPG ou PNG.'));
}

const uploadAvatar = multer({ storage: armazenamentoTemp, limits: { fileSize: imagensProduto.TAMANHO_MAX }, fileFilter: filtroImagem });
const uploadCapa   = multer({ storage: armazenamentoTemp, limits: { fileSize: imagensProduto.TAMANHO_MAX }, fileFilter: filtroImagem });

const upload = multer({
    storage: armazenamentoTemp,
    limits: { fileSize: arquivosProduto.TAMANHO_MAX },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'arquivo') {
            if (arquivosProduto.extensaoPermitida(file.originalname)) return cb(null, true);
            return cb(new Error('Formato do arquivo do produto não aceito.'));
        }
        if (imagensProduto.formatoAceito(file)) {
            return cb(null, true);
        }
        cb(new Error('Formato de imagem inválido. Use JPG ou PNG.'));
    }
});

function limparTemporarios(req, res, next) {
    const limpar = () => {
        const arquivos = req.file ? [req.file] : Object.values(req.files || {}).flat();
        arquivos.forEach(f => { if (f && f.path) fs.unlink(f.path, () => {}); });
    };
    res.once('finish', limpar);
    res.once('close', limpar);
    next();
}

async function enviarImagem(arquivo, entidade, id, pasta, prefixoNome) {
    const tipo = imagensProduto.tipoReal(arquivo.path);
    if (!tipo) throw new armazenamento.ErroArmazenamento('A imagem não é um arquivo JPG ou PNG válido.');
    const chave = armazenamento.novaChave(entidade, id, pasta, tipo.ext, prefixoNome);
    await armazenamento.enviar({ chave, caminho: arquivo.path, tipo: tipo.mime, publico: true });
    return chave;
}

async function enviarArquivoProduto(arquivo, id_produto) {
    const ext = arquivosProduto.extensao(arquivo.originalname);
    const chave = armazenamento.novaChave('products', id_produto, 'files', ext);
    await armazenamento.enviar({ chave, caminho: arquivo.path, tipo: 'application/octet-stream', publico: false });
    return chave;
}

const PUBLICO_DIR = path.join(__dirname, '..', 'public');
function removerMidia(ref) {
    if (!ref) return;
    if (armazenamento.ehChave(ref)) return armazenamento.remover(ref);
    const rel = String(ref).split('?')[0].replace(/^\/+/, '');
    if (/^image\/(capas|avatars)\/[\w.-]+$/.test(rel)) fs.unlink(path.join(PUBLICO_DIR, rel), () => {});
}

function mensagemDeErro(err, generica) {
    return err instanceof armazenamento.ErroArmazenamento ? err.message : generica;
}

function listaFormatos(tipo) {
    return (arquivosProduto.FORMATOS_POR_TIPO[tipo] || []).map(f => f.toUpperCase()).join(', ');
}

function criadorOrAdmin(req, res, next) {
    if (req.session.usuario && (req.session.usuario.tipo === 'criador' || req.session.usuario.tipo === 'admin')) return next();
    res.redirect('/PProdutos');
}

async function garantirCliente(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect('/login');
    }

    if (req.session.usuario.tipo !== 'cliente' && req.session.usuario.tipo !== 'admin' && req.session.usuario.tipo !== 'criador') {
        return res.redirect('/PProdutos');
    }

    try {
        await Cliente.buscarOuCriar(req.session.usuario.id_usuario);
    } catch (err) {
        console.error(err);
        const msg = 'Não foi possível preparar sua conta para compras. Tente novamente em instantes.';
        if (querJson(req)) return res.status(500).json({ erro: msg });
        req.session.flashCarrinho = { tipo: 'erro', msg };
        return res.redirect(req.path === '/carrinho' ? '/PProdutos' : '/carrinho');
    }
    next();
}

function querJson(req) {
    return req.accepts(['html', 'json']) === 'json';
}

function idValido(valor) {
    const id = Number.parseInt(valor, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function lerFlash(req, chave) {
    const valor = req.session[chave] || null;
    delete req.session[chave];
    return valor;
}

// ===== Limite de tentativas de login (em memória, por IP + e-mail) =====
const tentativasLogin = new Map();
const LOGIN_MAX_FALHAS = 5;
const LOGIN_JANELA_MS  = 15 * 60 * 1000;

function chaveLogin(req, email) {
    return `${req.ip}|${String(email || '').trim().toLowerCase()}`;
}

function minutosBloqueado(chave) {
    const t = tentativasLogin.get(chave);
    if (!t) return 0;
    const decorrido = Date.now() - t.desde;
    if (decorrido > LOGIN_JANELA_MS) { tentativasLogin.delete(chave); return 0; }
    return t.falhas >= LOGIN_MAX_FALHAS ? Math.max(1, Math.ceil((LOGIN_JANELA_MS - decorrido) / 60000)) : 0;
}

function registrarFalhaLogin(chave) {
    const t = tentativasLogin.get(chave);
    if (!t || Date.now() - t.desde > LOGIN_JANELA_MS) tentativasLogin.set(chave, { falhas: 1, desde: Date.now() });
    else t.falhas++;
}

setInterval(() => {
    const agora = Date.now();
    for (const [chave, t] of tentativasLogin) if (agora - t.desde > LOGIN_JANELA_MS) tentativasLogin.delete(chave);
}, LOGIN_JANELA_MS).unref();

const MENSAGENS_LOGIN = {
    conta_inativada:     { tipo: 'info',    msg: 'Sua conta foi desativada e será excluída em 30 dias. Para cancelar, basta entrar novamente.' },
    sessao_encerrada:    { tipo: 'aviso',   msg: 'Sua sessão foi encerrada. Entre novamente para continuar.' },
    solicitacao_enviada: { tipo: 'sucesso', msg: 'Solicitação enviada! Nossa equipe analisará em breve.' },
    saiu:                { tipo: 'sucesso', msg: 'Você saiu da sua conta.' }
};
const MENSAGENS_HOME = {
    conta_reativada: { tipo: 'sucesso', msg: 'Bem-vindo de volta! Sua conta foi reativada e a exclusão foi cancelada.' }
};

const ROTAS_PERMITIDAS_ADM = ['/paineladm', '/logout', '/perfil/foto'];
router.use((req, res, next) => {
    const u = req.session.usuario;
    if (!u || u.tipo !== 'admin') return next();
    const permitida = ROTAS_PERMITIDAS_ADM.includes(req.path) ||
                      req.path.startsWith('/adm/');
    if (!permitida) return res.redirect('/paineladm');
    next();
});

// ============================================================
//  Páginas públicas
// ============================================================
router.get('/', async (req, res) => {
    const estatisticas = await Produto.estatisticasPublicas().catch(err => { console.error(err); return null; });
    res.render('pages/Main', { estatisticas, aviso: MENSAGENS_HOME[req.query.msg] || null });
});

router.get('/SobreNos', (req, res) => res.render('pages/SobreNos'));

// ============================================================
//  Suporte — funciona para logados e não-logados
// ============================================================
router.get('/suporte', async (req, res) => {
    let tickets = [];
    let erroTickets = false;
    if (req.session.usuario) {
        tickets = await Suporte.listarPorUsuario(req.session.usuario.id_usuario).catch(err => {
            console.error(err);
            erroTickets = true;
            return [];
        });
    }
    const flash = lerFlash(req, 'flashSuporte') || {};
    res.render('pages/suporte', {
        tickets,
        erroTickets,
        resultado: flash.sucesso || null,
        aviso: flash.aviso || null,
        listaErros: flash.erros || [],
        campos: flash.campos || {}
    });
});

router.post('/suporte', validarSuporte, async (req, res) => {
    const campos = { tipo_chamada: req.body.tipo_chamada, descricao: req.body.descricao };
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
        req.session.flashSuporte = { erros: erros.array().map(e => ({ msg: e.msg, path: e.path })), campos };
        return res.redirect('/suporte#ticket');
    }
    try {
        const { tipo_chamada, descricao } = req.body;
        const id_usuario = req.session.usuario ? req.session.usuario.id_usuario : null;
        await Suporte.criar({ id_usuario, tipo_chamada, descricao });
        req.session.flashSuporte = { sucesso: 'Ticket enviado com sucesso! Nossa equipe analisará em breve.' };
    } catch (err) {
        console.error(err);
        req.session.flashSuporte = {
            erros: [{ msg: 'Não foi possível enviar o ticket agora. Sua mensagem foi mantida; tente novamente em instantes.' }],
            campos
        };
    }
    res.redirect('/suporte#ticket');
});

async function cancelarTicket(req, res) {
    try {
        const alterados = await Suporte.fecharDoUsuario(idValido(req.body.id_chamada), req.session.usuario.id_usuario);
        req.session.flashSuporte = alterados
            ? { sucesso: 'Ticket cancelado.' }
            : { aviso: 'Não foi possível cancelar: o ticket não foi encontrado ou já está encerrado.' };
    } catch (err) {
        console.error(err);
        req.session.flashSuporte = { aviso: 'Não foi possível cancelar o ticket agora. Tente novamente.' };
    }
    res.redirect('/suporte#meus-tickets');
}

router.post('/suporte/cancelar', autenticar, cancelarTicket);

// ============================================================
//  Produtos — público
// ============================================================
const PRODUTOS_POR_PAGINA = 12;

router.get('/PProdutos', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const tipo = Produto.TIPOS_CATALOGO.includes(req.query.tipo) ? req.query.tipo : '';
    const pagina = idValido(req.query.pagina) || 1;
    const base = { q, tipo, pagina, porPagina: PRODUTOS_POR_PAGINA, ...apresentacaoProduto };
    try {
        const [{ produtos, total }, sugestoes] = await Promise.all([
            Produto.listarCatalogo({ q, tipo, pagina, porPagina: PRODUTOS_POR_PAGINA }),
            Produto.titulosParaSugestao().catch(() => [])
        ]);
        res.render('pages/PProdutos', {
            ...base, produtos, total, sugestoes, erro: null,
            totalPaginas: Math.max(1, Math.ceil(total / PRODUTOS_POR_PAGINA))
        });
    } catch (err) {
        console.error(err);
        res.render('pages/PProdutos', {
            ...base, produtos: [], total: 0, sugestoes: [], totalPaginas: 1,
            erro: 'Não foi possível carregar os produtos agora. Tente novamente em instantes.'
        });
    }
});

router.get('/pprodutos1', (req, res) => {
    const id = idValido(req.query.id);
    res.redirect(301, id ? `/paginnerprod?id=${id}` : '/PProdutos');
});

router.get('/paginnerprod', async (req, res) => {
    const usuario = req.session.usuario || null;
    const renderEstado = (status, estado) =>
        res.status(status).render('pages/paginnerprod', { estado, ...apresentacaoProduto });

    const id = idValido(req.query.id);
    if (!id) return renderEstado(404, 'nao_encontrado');

    let produto;
    try {
        produto = await Produto.buscarDetalhe(id);
    } catch (err) {
        console.error(err);
        return renderEstado(500, 'erro');
    }
    if (!produto) return renderEstado(404, 'nao_encontrado');

    const ehDono = !!usuario && Number(usuario.id_usuario) === Number(produto.id_criador);
    const disponivel = produto.status_produto === 'ativo';
    const excluido = produto.status_produto === 'excluido';
    if (!disponivel && (!ehDono || excluido)) {
        const comprou = usuario && !ehDono
            ? await Pedido.clientePossuiProduto(usuario.id_usuario, id).catch(() => false)
            : false;
        if (!comprou) return renderEstado(404, 'indisponivel');
    }

    const idComprador = usuario && !ehDono ? usuario.id_usuario : null;
    const todasAvaliacoes = req.query.avaliacoes === 'todas';

    const secoes = await Promise.allSettled([
        AvaliacaoProduto.resumoPorProduto(id),
        AvaliacaoProduto.listarPorProduto(id, todasAvaliacoes ? 100 : 10),
        PerguntaProduto.listarPorProduto(id),
        Produto.listarRelacionados(id, produto.id_categoria, 4, produto.tipo_produto),
        idComprador ? Favorito.existe(idComprador, id) : false,
        idComprador ? Carrinho.contemProduto(idComprador, id) : false,
        idComprador ? Pedido.clientePossuiProduto(idComprador, id) : false,
        idComprador ? AvaliacaoProduto.buscarDoCliente(idComprador, id) : null
    ]);
    const [resumoAvaliacoes, avaliacoes, perguntas, relacionados, favoritado, noCarrinho, jaComprou, minhaAvaliacao] =
        secoes.map(s => {
            if (s.status === 'fulfilled') return s.value;
            console.error(s.reason);
            return null;
        });

    const flashPergunta = lerFlash(req, 'flashPergunta');
    const flashAvaliacao = lerFlash(req, 'flashAvaliacao');

    const urlBase = `${req.protocol}://${req.get('host')}`;
    res.render('pages/paginnerprod', {
        estado: 'ok',
        produto,
        tipo: apresentacaoProduto.tipoProduto(produto.tipo_produto),
        imagens: produto.imagens,
        ehDono,
        disponivel,
        resumoAvaliacoes,
        avaliacoes,
        todasAvaliacoes,
        perguntas,
        relacionados,
        favoritado: favoritado === true,
        noCarrinho: noCarrinho === true,
        jaComprou: jaComprou === true,
        minhaAvaliacao: minhaAvaliacao || null,
        flashPergunta,
        flashAvaliacao,
        urlBase,
        urlPublica: `${urlBase}/paginnerprod?id=${id}`,
        urlLogin: `/login?voltar=${encodeURIComponent(`/paginnerprod?id=${id}`)}`,
        ...apresentacaoProduto
    });
});

router.post('/produto/perguntar', autenticar, validarPergunta, async (req, res) => {
    const id_produto = idValido(req.body.id_produto);
    if (!id_produto) return res.redirect('/PProdutos');
    const voltar = `/paginnerprod?id=${id_produto}#perguntas`;

    const erros = validationResult(req);
    if (!erros.isEmpty()) {
        req.session.flashPergunta = { tipo: 'erro', msg: erros.array()[0].msg, texto: req.body.pergunta };
        return res.redirect(voltar);
    }

    try {
        const produto = await Produto.buscarPorId(id_produto);
        if (!produto) return res.redirect(voltar);

        if (Number(produto.id_criador) === Number(req.session.usuario.id_usuario)) {
            req.session.flashPergunta = { tipo: 'erro', msg: 'Você não pode enviar perguntas para o seu próprio produto.' };
        } else {
            await PerguntaProduto.criar(id_produto, req.session.usuario.id_usuario, req.body.pergunta);
            req.session.flashPergunta = { tipo: 'sucesso', msg: 'Pergunta enviada! Ela já aparece abaixo e aguarda a resposta do vendedor.' };
        }
    } catch (err) {
        console.error(err);
        req.session.flashPergunta = { tipo: 'erro', msg: 'Não foi possível enviar sua pergunta. Tente novamente.', texto: req.body.pergunta };
    }
    res.redirect(voltar);
});

router.post('/produto/pergunta/responder', autenticar, validarResposta, async (req, res) => {
    const id_produto = idValido(req.body.id_produto);
    const voltar = id_produto ? `/paginnerprod?id=${id_produto}#perguntas` : '/admvend';

    const erros = validationResult(req);
    if (!erros.isEmpty()) {
        req.session.flashPergunta = {
            tipo: 'erro', msg: erros.array()[0].msg,
            id_pergunta: Number(req.body.id_pergunta), texto: req.body.resposta
        };
        return res.redirect(voltar);
    }

    try {
        const alteradas = await PerguntaProduto.responder(
            req.body.id_pergunta, req.session.usuario.id_usuario, req.body.resposta
        );
        req.session.flashPergunta = alteradas
            ? { tipo: 'sucesso', msg: 'Resposta publicada.' }
            : { tipo: 'erro', msg: 'Você só pode responder perguntas dos seus próprios produtos.' };
    } catch (err) {
        console.error(err);
        req.session.flashPergunta = {
            tipo: 'erro', msg: 'Não foi possível publicar a resposta. Tente novamente.',
            id_pergunta: Number(req.body.id_pergunta), texto: req.body.resposta
        };
    }
    res.redirect(voltar);
});

router.post('/produto/avaliar', autenticar, garantirCliente, validarAvaliacao, async (req, res) => {
    const id_produto = idValido(req.body.id_produto);
    if (!id_produto) return res.redirect('/PProdutos');
    const voltar = `/paginnerprod?id=${id_produto}#avaliar`;
    const id_cliente = req.session.usuario.id_usuario;

    const erros = validationResult(req);
    if (!erros.isEmpty()) {
        req.session.flashAvaliacao = { tipo: 'erro', msg: erros.array()[0].msg, nota: req.body.nota, texto: req.body.comentario };
        return res.redirect(voltar);
    }

    try {
        const produto = await Produto.buscarArquivo(id_produto);
        if (!produto) return res.redirect('/PProdutos');

        if (Number(produto.id_criador) === Number(id_cliente)) {
            req.session.flashAvaliacao = { tipo: 'erro', msg: 'Você não pode avaliar o seu próprio produto.' };
        } else if (!(await Pedido.clientePossuiProduto(id_cliente, id_produto))) {
            req.session.flashAvaliacao = { tipo: 'erro', msg: 'Só quem comprou este produto pode avaliá-lo.' };
        } else {
            const resultado = await AvaliacaoProduto.salvar(id_cliente, id_produto, Number(req.body.nota), req.body.comentario);
            req.session.flashAvaliacao = {
                tipo: 'sucesso',
                msg: resultado === 'criada' ? 'Obrigado! Sua avaliação foi publicada.' : 'Sua avaliação foi atualizada.'
            };
        }
    } catch (err) {
        console.error(err);
        req.session.flashAvaliacao = {
            tipo: 'erro', msg: 'Não foi possível salvar sua avaliação. Tente novamente.',
            nota: req.body.nota, texto: req.body.comentario
        };
    }
    res.redirect(voltar);
});

router.get('/downloads/:id_produto', autenticar, async (req, res) => {
    const id_usuario = req.session.usuario.id_usuario;
    const falhar = (msg, destino = '/meusdowloads') => {
        req.session.flashDownloads = msg;
        res.redirect(destino);
    };

    try {
        const produto = await Produto.buscarArquivo(idValido(req.params.id_produto));
        if (!produto) return falhar('Produto não encontrado.');

        const ehDono = Number(produto.id_criador) === Number(id_usuario);
        if (!ehDono && !(await Pedido.clientePossuiProduto(id_usuario, produto.id_produto))) {
            return falhar('Você não tem acesso a este arquivo. Ele é liberado depois da compra.');
        }

        const semArquivo = () => {
            if (ehDono) {
                req.session.flashVendedor = { tipo: 'erro', msg: 'O arquivo deste produto não está disponível. Envie o arquivo de novo pelo painel.' };
                return res.redirect('/admvend');
            }
            return falhar(produto.arquivo
                ? 'O arquivo deste produto não está disponível no momento. Fale com o vendedor pela página do produto.'
                : 'O vendedor ainda não disponibilizou o arquivo deste produto.');
        };
        const nome = arquivosProduto.nomeParaDownload(produto.titulo, produto.arquivo);
        res.set('Cache-Control', 'private, no-store');

        if (armazenamento.ehChave(produto.arquivo)) {
            if (!(await armazenamento.info(produto.arquivo))) return semArquivo();
            return res.redirect(302, await armazenamento.urlDownload(produto.arquivo, nome));
        }

        const caminho = arquivosProduto.caminhoSeguro(produto.arquivo);
        if (!caminho || !fs.existsSync(caminho)) return semArquivo();

        res.set('X-Content-Type-Options', 'nosniff');
        res.download(caminho, arquivosProduto.nomeParaDownload(produto.titulo, produto.arquivo), err => {
            if (err) console.error(err);
        });
    } catch (err) {
        console.error(err);
        falhar('Não foi possível baixar o arquivo agora. Tente novamente.');
    }
});

// ============================================================
//  Loja pública do vendedor — /perfilvend?id=ID (sem login)
// ============================================================
const AVALIACOES_LOJA = 6;

router.get('/perfilvend', (req, res, next) => {
    if (idValido(req.query.id)) return next();
    autenticar(req, res, () => res.redirect(req.session.usuario.tipo === 'criador'
        ? `/perfilvend?id=${req.session.usuario.id_usuario}`
        : '/perfiluser'));
}, async (req, res) => {
    const id = idValido(req.query.id);
    const usuario = req.session.usuario || null;
    const renderEstado = (status, estado) =>
        res.status(status).render('pages/perfilvend', { estado, ...apresentacaoProduto });

    let vendedor;
    try {
        vendedor = await Criador.buscarPerfilPublico(id);
    } catch (err) {
        console.error(err);
        return renderEstado(500, 'erro');
    }
    if (!vendedor || vendedor.status !== 'ativo') return renderEstado(404, 'nao_encontrado');

    const todasAvaliacoes = req.query.avaliacoes === 'todas';
    const [produtos, resumoAvaliacoes, avaliacoes, totais, cuponsLoja] = (await Promise.allSettled([
        Produto.listarVitrine(id),
        AvaliacaoProduto.resumoPorCriador(id),
        AvaliacaoProduto.listarPorCriador(id, todasAvaliacoes ? 50 : AVALIACOES_LOJA),
        Pedido.totaisDoCriador(id),
        Cupom.listarDisponiveisDoCriador(id, cupons.hoje())
    ])).map(s => {
        if (s.status === 'fulfilled') return s.value;
        console.error(s.reason);
        return null;
    });

    const urlBase = `${req.protocol}://${req.get('host')}`;
    res.render('pages/perfilvend', {
        estado: 'ok',
        vendedor,
        ehDono: !!usuario && Number(usuario.id_usuario) === id,
        produtos,
        resumoAvaliacoes,
        avaliacoes,
        todasAvaliacoes,
        vendas: totais ? totais.vendas : null,
        cuponsLoja: cuponsLoja || [],
        rotuloDesconto: cupons.rotuloDesconto,
        dataBR: cupons.dataBR,
        usosRestantes: cupons.usosRestantes,
        urlBase,
        urlPublica: `${urlBase}/perfilvend?id=${id}`,
        ...apresentacaoProduto
    });
});

router.get('/pgpublica', (req, res, next) => {
    const id = idValido(req.query.id);
    if (id) return res.redirect(301, `/perfilvend?id=${id}`);
    next();
}, autenticar, criadorOrAdmin, async (req, res) => {
    const flash = lerFlash(req, 'flashPgPublica') || {};
    let criador = null;
    let erroCarregar = false;
    try {
        criador = await Criador.buscarPerfilPublico(req.session.usuario.id_usuario);
    } catch (err) {
        console.error(err);
        erroCarregar = true;
    }
    res.render('pages/pgpublica', {
        bio: flash.bio !== undefined ? flash.bio : (criador && criador.bio) || '',
        capa: criador ? criador.capa : null,
        aviso: flash.aviso || null,
        erroCarregar,
        tamanhoMaxCapaMb: imagensProduto.TAMANHO_MAX_MB
    });
});

router.post('/pgpublica/capa', autenticar, criadorOrAdmin, uploadCapa.single('capa'), limparTemporarios, async (req, res) => {
    const avisar = (tipo, msg) => {
        req.session.flashPgPublica = { aviso: { tipo, msg } };
        res.redirect('/pgpublica#capa');
    };
    const id = req.session.usuario.id_usuario;
    let chaveNova = null;
    try {
        if (!req.file) return avisar('erro', 'Selecione uma imagem para a capa.');
        if (!imagensProduto.conteudoValido(req.file.path)) return avisar('erro', 'O arquivo não é uma imagem JPG ou PNG válida.');

        const atual = await Criador.buscarPerfilPublico(id);
        if (!atual) return avisar('erro', 'Não foi possível encontrar sua loja.');
        chaveNova = await enviarImagem(req.file, 'sellers', id, 'cover');
        await Criador.atualizarCapa(id, chaveNova);
        chaveNova = null;
        removerMidia(atual.capa);
        avisar('sucesso', 'Capa atualizada. Ela já aparece na sua loja.');
    } catch (err) {
        console.error(err);
        if (chaveNova) armazenamento.remover(chaveNova);
        avisar('erro', mensagemDeErro(err, 'Não foi possível salvar a capa agora. Tente novamente.'));
    }
});

router.post('/pgpublica/capa/remover', autenticar, criadorOrAdmin, async (req, res) => {
    const id = req.session.usuario.id_usuario;
    try {
        const atual = await Criador.buscarPerfilPublico(id);
        if (atual && atual.capa) {
            await Criador.atualizarCapa(id, null);
            removerMidia(atual.capa);
        }
        req.session.flashPgPublica = { aviso: { tipo: 'sucesso', msg: 'Capa removida. Sua loja voltou a usar o fundo padrão.' } };
    } catch (err) {
        console.error(err);
        req.session.flashPgPublica = { aviso: { tipo: 'erro', msg: 'Não foi possível remover a capa agora. Tente novamente.' } };
    }
    res.redirect('/pgpublica#capa');
});

router.post('/pgpublica', autenticar, criadorOrAdmin, validarPaginaPublica, async (req, res) => {
    const bio = req.body.bio;
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
        req.session.flashPgPublica = { bio, aviso: { tipo: 'erro', msg: erros.array()[0].msg } };
        return res.redirect('/pgpublica');
    }
    try {
        await Criador.atualizarBio(req.session.usuario.id_usuario, bio || null);
        req.session.flashPgPublica = { aviso: { tipo: 'sucesso', msg: 'Apresentação salva. Ela já aparece na sua loja.' } };
    } catch (err) {
        console.error(err);
        req.session.flashPgPublica = { bio, aviso: { tipo: 'erro', msg: 'Não foi possível salvar agora. Seu texto foi mantido; tente novamente.' } };
    }
    res.redirect('/pgpublica');
});

// ============================================================
//  Cadastro
// ============================================================
router.use('/cadastro', (req, res, next) => {
    res.locals.tiposVitrine = tiposProduto.CHAVES.map(apresentacaoProduto.tipoProduto);
    next();
});

router.get('/cadastro', (req, res) => {
    if (req.session.usuario) return res.redirect('/');
    res.render('pages/cadastro', { listaErros: [], campos: {}, resultado: null });
});

router.post('/cadastro', validarCadastro, async (req, res) => {
    let id = null;
    try {
        const { nome, email, senha, cpf, tipo_conta } = req.body;

        if (tipo_conta === 'vendedor' && await Criador.cpfEmUso(cpf)) {
            return res.render('pages/cadastro', {
                resultado: null, listaErros: [{ msg: 'Este CPF já está cadastrado.', path: 'cpf' }], campos: req.body
            });
        }

        const senhaHash = await bcrypt.hash(senha, 10);
        id = await Usuario.criar({ nome, email, senha: senhaHash });
        if (tipo_conta === 'vendedor') {
            await Criador.criar(id, cpf);
        } else {
            await Cliente.criar(id, null);
        }
        req.session.flashLogin = {
            tipo: 'sucesso',
            msg: tipo_conta === 'vendedor'
                ? 'Conta de vendedor criada! Entre para publicar seu primeiro produto.'
                : 'Conta criada! Entre com seu e-mail e senha.',
            email
        };
        res.redirect('/login');
    } catch (err) {
        if (id) {
            try { await Usuario.excluir(id); } catch (e) { console.error(e); }
        }
        const isDuplicate = err.code === 'ER_DUP_ENTRY' || String(err.message).includes('Duplicate');
        if (!isDuplicate) console.error(err);
        const msg = isDuplicate
            ? 'Este e-mail (ou CPF) já está cadastrado. Entre na sua conta ou use outro e-mail.'
            : 'Não foi possível criar a conta agora. Tente novamente em instantes.';
        res.render('pages/cadastro', { resultado: null, listaErros: [{ msg }], campos: req.body });
    }
});

// ============================================================
//  Login e Logout
// ============================================================
router.get('/login', (req, res) => {
    if (req.session.usuario) return res.redirect(req.session.usuario.tipo === 'admin' ? '/paineladm' : '/');
    const voltar = caminhoInterno(req.query.voltar);
    if (voltar) req.session.voltarPara = voltar;
    const flash = lerFlash(req, 'flashLogin');
    res.render('pages/login', {
        erro: null,
        campos: { email: flash && flash.email ? flash.email : '' },
        aviso: flash || MENSAGENS_LOGIN[req.query.msg] || null
    });
});

router.post('/login', async (req, res) => {
    const email = String(req.body.email || '').trim();
    const senha = String(req.body.senha || '');
    const falhar = (erro, status = 200) => res.status(status).render('pages/login', { erro, campos: { email }, aviso: null });

    if (!email || !senha) return falhar('Informe seu e-mail e sua senha.');

    const chave = chaveLogin(req, email);
    const bloqueio = minutosBloqueado(chave);
    if (bloqueio) {
        return falhar(`Muitas tentativas de login. Aguarde ${bloqueio} ${bloqueio === 1 ? 'minuto' : 'minutos'} e tente novamente.`, 429);
    }

    try {
        const usuario = await Usuario.buscarPorEmail(email);
        const senhaCorreta = usuario ? await bcrypt.compare(senha, usuario.senha) : false;
        if (!usuario || !senhaCorreta) {
            registrarFalhaLogin(chave);
            return falhar('E-mail ou senha incorretos.');
        }
        if (usuario.status === 'suspenso') {
            return falhar('Esta conta está suspensa. Fale com o suporte para mais informações.');
        }
        if (!['ativo', 'inativo'].includes(usuario.status)) {
            return falhar('Esta conta está inativa. Fale com o suporte para mais informações.');
        }
        tentativasLogin.delete(chave);

        const contaReativada = usuario.status === 'inativo';
        if (contaReativada) {
            await Usuario.atualizarStatus(usuario.id_usuario, 'ativo');
        }

        const [admins]   = await pool.query('SELECT 1 FROM administrador WHERE id_usuario = ?', [usuario.id_usuario]);
        const [criadores] = await pool.query('SELECT 1 FROM criador WHERE id_usuario = ?',      [usuario.id_usuario]);
        const tipo = admins.length > 0 ? 'admin' : criadores.length > 0 ? 'criador' : 'cliente';

        const voltarPara = req.session.voltarPara;
        req.session.regenerate(errSessao => {
            if (errSessao) {
                console.error(errSessao);
                return falhar('Não foi possível entrar agora. Tente novamente.');
            }
            req.session.usuario = {
                id_usuario: usuario.id_usuario,
                nome:       usuario.nome,
                email:      usuario.email,
                tipo,
                foto:       usuario.foto || null
            };
            req.session.statusVerificadoEm = Date.now();

            let destino = '/';
            if (tipo === 'admin') destino = '/paineladm';
            else if (contaReativada) destino = '/?msg=conta_reativada';
            else if (voltarPara) destino = voltarPara;
            req.session.save(() => res.redirect(destino));
        });
    } catch (err) {
        console.error(err);
        falhar('Não foi possível entrar agora. Tente novamente em instantes.');
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login?msg=saiu'));
});

// ============================================================
//  Área do cliente
// ============================================================
router.get('/perfiluser', autenticar, async (req, res) => {
    try {
        const usuario = await Usuario.buscarPorId(req.session.usuario.id_usuario);
        const cliente = {
            ...req.session.usuario,
            data_cadastro: usuario ? usuario.data_cadastro : null
        };
        res.render('pages/perfiluser', { cliente });
    } catch (err) {
        console.error(err);
        res.render('pages/perfiluser', { cliente: { ...req.session.usuario, data_cadastro: null } });
    }
});

router.get('/editardados', autenticar, (req, res) => {
    res.render('pages/editardados', { resultado: null, listaErros: [], campos: {}, usuario: req.session.usuario });
});

router.post('/editardados', autenticar, validarEditarDados, async (req, res) => {
    const render = (dados) => res.render('pages/editardados', {
        resultado: null, listaErros: [], campos: req.body, usuario: req.session.usuario, ...dados
    });
    try {
        const { nome, email } = req.body;
        await Usuario.atualizar(req.session.usuario.id_usuario, { nome, email });
        req.session.usuario.nome  = nome;
        req.session.usuario.email = email;
        render({ resultado: 'Dados atualizados com sucesso!', campos: {} });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return render({ listaErros: [{ msg: 'Este e-mail já está em uso por outra conta. Use outro endereço.', path: 'email' }] });
        }
        console.error(err);
        render({ listaErros: [{ msg: 'Não foi possível salvar seus dados agora. Tente novamente em instantes.' }] });
    }
});

router.post('/perfil/foto', autenticar, uploadAvatar.single('foto'), limparTemporarios, async (req, res) => {
    const id = req.session.usuario.id_usuario;
    let chaveNova = null;
    try {
        if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem foi enviada.' });
        if (!imagensProduto.conteudoValido(req.file.path)) {
            return res.status(400).json({ erro: 'O arquivo não é uma imagem JPG ou PNG válida.' });
        }
        const anterior = ((await Usuario.buscarPorId(id)) || {}).foto;
        chaveNova = await enviarImagem(req.file, 'users', id, 'avatar');
        await Usuario.atualizarFoto(id, chaveNova);
        const chave = chaveNova;
        chaveNova = null;
        req.session.usuario.foto = chave;
        removerMidia(anterior);
        res.json({ foto: armazenamento.urlMidia(chave) });
    } catch (err) {
        console.error(err);
        if (chaveNova) armazenamento.remover(chaveNova);
        const doStorage = err instanceof armazenamento.ErroArmazenamento;
        res.status(doStorage ? 503 : 500).json({ erro: mensagemDeErro(err, 'Não foi possível salvar a foto agora. Tente novamente.') });
    }
});

router.get('/alterarsenha', autenticar, (req, res) => {
    res.render('pages/alterarsenha', { resultado: null, listaErros: [], campos: {} });
});

router.post('/alterarsenha', autenticar, validarAlterarSenha, async (req, res) => {
    try {
        const usuario = await Usuario.buscarPorEmail(req.session.usuario.email);
        const senhaCorreta = usuario ? await bcrypt.compare(req.body.senha_atual, usuario.senha) : false;
        if (!senhaCorreta) {
            return res.render('pages/alterarsenha', { resultado: null, listaErros: [{ msg: 'A senha atual está incorreta.', path: 'senha_atual' }], campos: {} });
        }
        const novaHash = await bcrypt.hash(req.body.nova_senha, 10);
        await Usuario.atualizarSenha(req.session.usuario.id_usuario, novaHash);
        res.render('pages/alterarsenha', { resultado: 'Senha alterada com sucesso!', listaErros: [], campos: {} });
    } catch (err) {
        console.error(err);
        res.render('pages/alterarsenha', { resultado: null, listaErros: [{ msg: 'Não foi possível alterar a senha agora. Tente novamente em instantes.' }], campos: {} });
    }
});

router.get('/favoritos', autenticar, async (req, res) => {
    try {
        const favoritos = await Favorito.listarPorCliente(req.session.usuario.id_usuario);
        res.render('pages/favoritos', { favoritos, erro: null, ...apresentacaoProduto });
    } catch (err) {
        console.error(err);
        res.render('pages/favoritos', { favoritos: [], erro: 'Não foi possível carregar seus favoritos agora.', ...apresentacaoProduto });
    }
});

async function itensDaCompra(id_cliente, itens) {
    const jaComprados = await Pedido.produtosJaComprados(id_cliente, itens.map(i => i.id_produto));
    return Pedido.filtrarCompraveis(id_cliente, itens, jaComprados);
}

const somaEmReais = itens => cupons.reais(itens.reduce((soma, i) => soma + cupons.centavos(i.preco), 0));

async function avaliarCupomDoCarrinho(carrinho, id_cliente, comprar) {
    if (!carrinho.id_cupom) return null;
    const cupom = await Cupom.buscarPorId(carrinho.id_cupom);
    const jaUsou = cupom ? await Cupom.clienteJaUsou(cupom.id_cupom, id_cliente) : false;
    return { cupom, verificacao: cupons.verificarUso({ cupom, itens: comprar, jaUsou }) };
}

router.get('/carrinho', autenticar, garantirCliente, async (req, res) => {
    let aviso = lerFlash(req, 'flashCarrinho');
    const flashCupom = lerFlash(req, 'flashCupom');
    const base = { pagamentoOnline: pagamento.cobrancaOnline(), cupomDigitado: flashCupom, ...apresentacaoProduto };
    const id_cliente = req.session.usuario.id_usuario;
    try {
        const carrinho = await Carrinho.buscarOuCriar(id_cliente);
        const itens    = await Carrinho.listarItens(carrinho.id_carrinho);
        const comprar  = await itensDaCompra(id_cliente, itens);
        const subtotal = somaEmReais(comprar);
        const resumo = { quantidade: comprar.length, subtotal, desconto: 0, total: subtotal, compraveis: comprar.map(i => i.id_produto) };

        let cupomAplicado = null;
        const avaliacao = await avaliarCupomDoCarrinho(carrinho, id_cliente, comprar).catch(err => { console.error(err); return null; });
        if (avaliacao && avaliacao.verificacao.ok) {
            const { calculo } = avaliacao.verificacao;
            cupomAplicado = {
                codigo: avaliacao.cupom.codigo,
                rotulo: cupons.rotuloDesconto(avaliacao.cupom),
                nome_criador: avaliacao.cupom.nome_criador,
                porItem: Object.fromEntries(calculo.itens.filter(i => i.desconto > 0).map(i => [i.id_produto, i]))
            };
            Object.assign(resumo, { desconto: calculo.desconto, total: calculo.total });
        } else if (avaliacao) {
            await Carrinho.definirCupom(carrinho.id_carrinho, null);
            const codigo = avaliacao.cupom ? avaliacao.cupom.codigo : 'aplicado';
            aviso = aviso || { tipo: 'aviso', msg: `O cupom ${codigo} foi removido: ${avaliacao.verificacao.erro}` };
        }
        res.render('pages/carrinho', { ...base, aviso, itens, id_carrinho: carrinho.id_carrinho, resumo, cupomAplicado });
    } catch (err) {
        console.error(err);
        res.render('pages/carrinho', {
            ...base, itens: [], id_carrinho: null, cupomAplicado: null,
            resumo: { quantidade: 0, subtotal: 0, desconto: 0, total: 0, compraveis: [] },
            aviso: aviso || { tipo: 'erro', msg: 'Não foi possível carregar seu carrinho agora.' }
        });
    }
});

router.post('/carrinho/cupom', autenticar, garantirCliente, async (req, res) => {
    const id_cliente = req.session.usuario.id_usuario;
    const codigo = cupons.normalizarCodigo(req.body.codigo).slice(0, 40);
    const voltar = (tipo, msg) => {
        req.session.flashCarrinho = { tipo, msg };
        if (tipo === 'erro') req.session.flashCupom = codigo;
        res.redirect('/carrinho#cupom');
    };
    if (!codigo) return voltar('erro', 'Informe o código do cupom.');
    try {
        const carrinho = await Carrinho.buscarOuCriar(id_cliente);
        const comprar  = await itensDaCompra(id_cliente, await Carrinho.listarItens(carrinho.id_carrinho));
        const cupom    = await Cupom.buscarPorCodigo(codigo);
        const jaUsou   = cupom ? await Cupom.clienteJaUsou(cupom.id_cupom, id_cliente) : false;
        const verificacao = cupons.verificarUso({ cupom, itens: comprar, jaUsou });
        if (!verificacao.ok) return voltar('erro', verificacao.erro);

        await Carrinho.definirCupom(carrinho.id_carrinho, cupom.id_cupom);
        voltar('sucesso', `Cupom ${cupom.codigo} aplicado: ${cupons.formatarReais(verificacao.calculo.desconto)} de desconto nos produtos de ${cupom.nome_criador}.`);
    } catch (err) {
        console.error(err);
        voltar('erro', 'Não foi possível aplicar o cupom agora. Tente novamente.');
    }
});

router.post('/carrinho/cupom/remover', autenticar, garantirCliente, async (req, res) => {
    try {
        const carrinho = await Carrinho.buscarOuCriar(req.session.usuario.id_usuario);
        await Carrinho.definirCupom(carrinho.id_carrinho, null);
        req.session.flashCarrinho = { tipo: 'sucesso', msg: 'Cupom removido.' };
    } catch (err) {
        console.error(err);
        req.session.flashCarrinho = { tipo: 'erro', msg: 'Não foi possível remover o cupom agora. Tente novamente.' };
    }
    res.redirect('/carrinho#cupom');
});

router.post('/carrinho/adicionar', autenticar, garantirCliente, async (req, res) => {
    const id_usuario = req.session.usuario.id_usuario;
    try {
        const produto = await Produto.buscarPorId(idValido(req.body.id_produto));
        if (!produto) {
            if (querJson(req)) return res.status(404).json({ erro: 'Este produto não está disponível para compra.' });
            req.session.flashCarrinho = { tipo: 'erro', msg: 'Este produto não está mais disponível para compra.' };
            return res.redirect('/carrinho');
        }
        if (Number(produto.id_criador) === Number(id_usuario)) {
            const msg = 'Este produto é seu: não é possível comprá-lo.';
            if (querJson(req)) return res.status(409).json({ erro: msg });
            req.session.flashCarrinho = { tipo: 'erro', msg };
            return res.redirect('/carrinho');
        }
        if (await Pedido.clientePossuiProduto(id_usuario, produto.id_produto)) {
            if (querJson(req)) return res.status(409).json({ erro: 'Você já comprou este produto. Ele está em Meus downloads.' });
            req.session.flashDownloads = 'Você já comprou este produto: baixe-o quando quiser por aqui.';
            return res.redirect('/meusdowloads');
        }
        const carrinho = await Carrinho.buscarOuCriar(id_usuario);
        await Carrinho.adicionarItem(carrinho.id_carrinho, produto.id_produto, parseFloat(produto.preco));
        if (querJson(req)) return res.json({ noCarrinho: true });
        req.session.flashCarrinho = { tipo: 'sucesso', msg: `"${produto.titulo}" foi adicionado ao carrinho.` };
        res.redirect('/carrinho');
    } catch (err) {
        console.error(err);
        if (querJson(req)) return res.status(500).json({ erro: 'Não foi possível adicionar ao carrinho. Tente novamente.' });
        req.session.flashCarrinho = { tipo: 'erro', msg: 'Não foi possível adicionar o produto ao carrinho. Tente novamente.' };
        res.redirect('/carrinho');
    }
});

router.post('/carrinho/remover', autenticar, garantirCliente, async (req, res) => {
    try {
        const carrinho = await Carrinho.buscarOuCriar(req.session.usuario.id_usuario);
        await Carrinho.removerItem(carrinho.id_carrinho, idValido(req.body.id_produto));
        req.session.flashCarrinho = { tipo: 'sucesso', msg: 'Item removido do carrinho.' };
    } catch (err) {
        console.error(err);
        req.session.flashCarrinho = { tipo: 'erro', msg: 'Não foi possível remover o item agora. Tente novamente.' };
    }
    res.redirect('/carrinho');
});

router.post('/carrinho/limpar', autenticar, garantirCliente, async (req, res) => {
    try {
        const carrinho = await Carrinho.buscarOuCriar(req.session.usuario.id_usuario);
        await Carrinho.limpar(carrinho.id_carrinho);
        req.session.flashCarrinho = { tipo: 'sucesso', msg: 'Seu carrinho foi esvaziado.' };
    } catch (err) {
        console.error(err);
        req.session.flashCarrinho = { tipo: 'erro', msg: 'Não foi possível limpar o carrinho agora. Tente novamente.' };
    }
    res.redirect('/carrinho');
});

router.post('/carrinho/finalizar', autenticar, garantirCliente, async (req, res) => {
    const id_cliente = req.session.usuario.id_usuario;
    const avisar = (tipo, msg) => {
        req.session.flashCarrinho = { tipo, msg };
        res.redirect('/carrinho');
    };

    let itens, comprar, criado;
    try {
        const carrinho = await Carrinho.buscarOuCriar(id_cliente);
        itens = await Carrinho.listarItens(carrinho.id_carrinho);
        if (!itens.length) return avisar('erro', 'Seu carrinho está vazio.');

        comprar = await itensDaCompra(id_cliente, itens);
        if (!comprar.length) {
            return avisar('erro', 'Nenhum item do carrinho pode ser comprado: eles estão indisponíveis ou você já os comprou.');
        }

        let cupomDaCompra = null;
        const avaliacao = await avaliarCupomDoCarrinho(carrinho, id_cliente, comprar);
        if (avaliacao) {
            if (!avaliacao.verificacao.ok) {
                await Carrinho.definirCupom(carrinho.id_carrinho, null);
                return avisar('erro', `O cupom ${avaliacao.cupom ? avaliacao.cupom.codigo : ''} não pôde ser usado: ${avaliacao.verificacao.erro} Confira o total e finalize de novo — nada foi cobrado.`);
            }
            cupomDaCompra = { id_cupom: avaliacao.cupom.id_cupom, descontoEsperado: avaliacao.verificacao.calculo.desconto, dia: cupons.hoje() };
        }

        // Valores e itens são recalculados dentro da transação; total R$ 0,00 já sai pago, sem Mercado Pago.
        criado = await Pedido.criarComItens(id_cliente, carrinho.id_carrinho, comprar,
            pagamento.cobrancaOnline() ? 'online' : 'demonstracao', cupomDaCompra);
    } catch (err) {
        if (err instanceof Pedido.ErroPedidoPendente) {
            req.session.flashPedido = { id_pedido: err.id_pedido, aviso: { tipo: 'aviso',
                msg: 'Você já tem este pedido aguardando pagamento. Conclua o pagamento dele por aqui — nenhum pedido novo foi criado.' } };
            return res.redirect(`/detalhepedido?id=${err.id_pedido}`);
        }
        if (err instanceof Pedido.ErroCarrinhoMudou) return avisar('erro', err.message);
        if (err instanceof cupons.ErroCupom || (err && err.code === 'ER_DUP_ENTRY')) {
            const carrinho = await Carrinho.buscarOuCriar(id_cliente).catch(() => null);
            if (carrinho) await Carrinho.definirCupom(carrinho.id_carrinho, null).catch(() => {});
            return avisar('erro', `${err instanceof cupons.ErroCupom ? err.message : 'Você já usou este cupom em outra compra.'} O cupom foi removido e nenhum pedido foi criado; confira o total e finalize de novo.`);
        }
        pagamento.logErro('finalizar compra', err, { id_cliente });
        return avisar('erro', 'Não foi possível finalizar a compra. Nenhum pedido foi criado e nada foi cobrado; tente novamente.');
    }

    const { id_pedido, status, id_pagamento } = criado;
    const ignorados = itens.length - comprar.length;
    if (status === 'pago') {
        req.session.flashPedido = { id_pedido, ignorados };
        return res.redirect(`/detalhepedido?id=${id_pedido}`);
    }
    try {
        const { checkout_url } = await pagamento.abrirCheckout({ id_pagamento, id_cliente, email: req.session.usuario.email });
        req.session.flashPedido = { id_pedido, ignorados };
        return res.redirect(303, checkout_url);
    } catch (err) {
        pagamento.logErro('abrir checkout', err, { id_pedido, id_pagamento });
        req.session.flashPedido = { id_pedido, ignorados, aviso: { tipo: 'erro',
            msg: 'Seu pedido foi reservado, mas não conseguimos abrir o pagamento no Mercado Pago agora. Nada foi cobrado. Use "Pagar agora" para tentar de novo.' } };
        return res.redirect(`/detalhepedido?id=${id_pedido}`);
    }
});

const AVISOS_PAGAMENTO = {
    pago:        { tipo: 'sucesso', msg: 'Pagamento confirmado! Seus arquivos já estão disponíveis em Meus downloads.' },
    pendente:    { tipo: 'info',    msg: 'Estamos aguardando a confirmação do Mercado Pago. Assim que o pagamento for aprovado, os arquivos são liberados automaticamente — use "Verificar pagamento" para atualizar.' },
    cancelado:   { tipo: 'erro',    msg: 'Este pedido foi cancelado ou expirou sem pagamento. Para comprar, adicione os produtos ao carrinho de novo.' },
    reembolsado: { tipo: 'info',    msg: 'O pagamento deste pedido foi reembolsado.' }
};

// "Pagar agora" de um pedido pendente: reaproveita o checkout aberto ou abre uma nova tentativa.
router.post('/pedido/pagar', autenticar, garantirCliente, async (req, res) => {
    const id_pedido = idValido(req.body.id_pedido);
    if (!id_pedido) return res.redirect('/minhascompras');
    const voltar = aviso => {
        req.session.flashPedido = { id_pedido, aviso };
        res.redirect(`/detalhepedido?id=${id_pedido}`);
    };
    if (!pagamento.cobrancaOnline()) return voltar({ tipo: 'erro', msg: 'O pagamento online não está disponível agora.' });
    try {
        const r = await pagamento.retomarPagamento({ id_pedido, id_cliente: req.session.usuario.id_usuario, email: req.session.usuario.email });
        if (r.tipo === 'nao_encontrado') return res.redirect('/minhascompras');
        if (r.tipo === 'checkout') return res.redirect(303, r.checkout_url);
        return voltar(AVISOS_PAGAMENTO[r.status] || null);
    } catch (err) {
        pagamento.logErro('pagar pedido', err, { id_pedido });
        voltar({ tipo: 'erro', msg: 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.' });
    }
});

// Volta do Checkout Pro e botão "Verificar pagamento". O status na URL NÃO vale:
// o pedido só muda depois da conferência da order no Mercado Pago.
router.get('/pagamento/retorno', autenticar, async (req, res) => {
    const id_cliente = req.session.usuario.id_usuario;
    const id_pedido = idValido(req.query.pedido);
    const order_id = typeof req.query.order_id === 'string' ? req.query.order_id.trim() : '';
    try {
        const r = await pagamento.confirmarRetorno({ id_pedido, order_id, id_cliente });
        if (!r) return res.redirect('/minhascompras');
        const anterior = lerFlash(req, 'flashPedido');
        req.session.flashPedido = {
            id_pedido: r.id_pedido,
            ignorados: anterior && Number(anterior.id_pedido) === Number(r.id_pedido) ? anterior.ignorados : 0,
            aviso: AVISOS_PAGAMENTO[r.status] || null
        };
        res.redirect(`/detalhepedido?id=${r.id_pedido}`);
    } catch (err) {
        pagamento.logErro('retorno do pagamento', err, { id_pedido });
        res.redirect(id_pedido ? `/detalhepedido?id=${id_pedido}` : '/minhascompras');
    }
});

router.get('/minhascompras', autenticar, async (req, res) => {
    const base = { pagamentoOnline: pagamento.cobrancaOnline(), ...apresentacaoProduto };
    try {
        const pedidos = await Pedido.listarPorCliente(req.session.usuario.id_usuario);
        res.render('pages/minhascompras', { ...base, pedidos, erro: null });
    } catch (err) {
        console.error(err);
        res.render('pages/minhascompras', { ...base, pedidos: [], erro: 'Não foi possível carregar suas compras agora.' });
    }
});

router.get('/detalhepedido', autenticar, async (req, res) => {
    try {
        const { pedido, itens } = await Pedido.buscarComItens(idValido(req.query.id), req.session.usuario.id_usuario);
        if (!pedido) return res.redirect('/minhascompras');

        const flash = lerFlash(req, 'flashPedido');
        const recemCriado = flash && Number(flash.id_pedido) === Number(pedido.id_pedido) ? flash : null;
        const infoPagamento = await Pagamento.resumoDoPedido(pedido.id_pedido).catch(err => {
            pagamento.logErro('resumo do pagamento', err, { id_pedido: pedido.id_pedido });
            return null;
        });

        res.render('pages/detalhepedido', {
            pedido, itens, recemCriado, infoPagamento,
            pagamentoOnline: pagamento.cobrancaOnline(),
            ...apresentacaoProduto
        });
    } catch (err) {
        console.error(err);
        res.redirect('/minhascompras');
    }
});

router.get('/meusdowloads', autenticar, async (req, res) => {
    const aviso = lerFlash(req, 'flashDownloads');
    try {
        const downloads = await Pedido.listarDownloads(req.session.usuario.id_usuario);
        res.render('pages/meusdowloads', { downloads, aviso, erro: null, ...apresentacaoProduto });
    } catch (err) {
        console.error(err);
        res.render('pages/meusdowloads', {
            downloads: [], aviso, erro: 'Não foi possível carregar seus downloads agora.', ...apresentacaoProduto
        });
    }
});

router.get('/config', autenticar, (req, res) => res.render('pages/config', { aviso: lerFlash(req, 'flashConfig') }));

// ============================================================
//  Área do criador
// ============================================================
router.use(['/cdstraprod', '/admvend'], async (req, res, next) => {
    res.locals.formatosArquivo      = arquivosProduto.FORMATOS_POR_TIPO;
    res.locals.tamanhoMaxArquivoMb  = arquivosProduto.TAMANHO_MAX_MB;
    res.locals.maxImagensAdicionais = imagensProduto.MAX_ADICIONAIS;
    res.locals.tamanhoMaxImagemMb   = imagensProduto.TAMANHO_MAX_MB;
    if (req.method === 'GET' || req.originalUrl.startsWith('/cdstraprod')) {
        res.locals.categorias = await Produto.listarCategorias().catch(err => { console.error(err); return null; });
        res.locals.configTipos = tiposProduto.configParaCliente(res.locals.categorias);
    }
    next();
});

function voltarParaEdicao(req, res, id_produto, erros) {
    if (!id_produto) {
        req.session.flashVendedor = { tipo: 'erro', msg: erros[0] || 'Produto não encontrado ou sem permissão.' };
        return res.redirect('/admvend');
    }
    const { titulo, tipo_produto, id_categoria, sku, preco, resumo, descricao, detalhes } = req.body || {};
    req.session.flashEdicao = {
        id_produto, erros,
        campos: { titulo, tipo_produto, id_categoria, sku, preco, resumo, descricao, detalhes }
    };
    res.redirect(`/admvend?editar=${id_produto}`);
}

router.get('/admvend', autenticar, criadorOrAdmin, async (req, res) => {
    let aviso = lerFlash(req, 'flashVendedor');
    const flashEdicao = lerFlash(req, 'flashEdicao');
    const id = req.session.usuario.id_usuario;
    const [produtos, vendasMes, vendasRecentes, avaliacoesRecentes, totais] = (await Promise.allSettled([
        Produto.listarPorCriador(id),
        Pedido.vendasPorMes({ id_criador: id, meses: 6 }),
        Pedido.vendasRecentesDoCriador(id, 5),
        AvaliacaoProduto.recentesDoCriador(id, 4),
        Pedido.totaisDoCriador(id)
    ])).map(s => {
        if (s.status === 'fulfilled') return s.value;
        console.error(s.reason);
        return null;
    });

    const idEditar = idValido(req.query.editar);
    const alvo = idEditar && (produtos || []).find(p =>
        Number(p.id_produto) === idEditar && ['ativo', 'inativo'].includes(p.status_produto));
    const edicao = alvo ? {
        id_produto: idEditar,
        erros:  flashEdicao && Number(flashEdicao.id_produto) === idEditar ? flashEdicao.erros  : [],
        campos: flashEdicao && Number(flashEdicao.id_produto) === idEditar ? flashEdicao.campos : null
    } : null;
    if (idEditar && !alvo && !aviso) {
        aviso = { tipo: 'erro', msg: 'Este produto não pode ser editado: ele não existe mais, não é seu ou está suspenso.' };
    }

    res.render('pages/admvend', {
        produtos: produtos || [],
        erroProdutos: produtos === null,
        vendasMes, vendasRecentes, avaliacoesRecentes, totais,
        aviso,
        edicao,
        ...apresentacaoProduto
    });
});

router.post('/produto/editar', autenticar, criadorOrAdmin, upload.single('imagem'), limparTemporarios,
    validarEdicaoProduto, async (req, res) => {
    const id_produto = idValido(req.body.id_produto);
    const id_criador = req.session.usuario.id_usuario;
    const falhar = erros => voltarParaEdicao(req, res, id_produto, erros);

    const erros = validationResult(req);
    if (!erros.isEmpty()) return falhar([...new Set(erros.array().map(e => e.msg))]);

    let novaImagem = null;
    try {
        const atual = await Produto.buscarParaEdicao(id_produto, id_criador);
        if (!atual) {
            req.session.flashVendedor = { tipo: 'erro', msg: 'Não foi possível editar: produto não encontrado, sem permissão ou suspenso.' };
            return res.redirect('/admvend');
        }

        const tipo = req.body.tipo_produto;
        if (tipo !== atual.tipo_produto && atual.arquivo && !arquivosProduto.extensaoPermitida(atual.arquivo, tipo)) {
            return falhar([`O arquivo atual (${arquivosProduto.formatoDoArquivo(atual.arquivo)}) não é aceito para este tipo. ` +
                `Formatos aceitos: ${listaFormatos(tipo)}. Troque o arquivo primeiro ou mantenha o tipo.`]);
        }

        if (req.file) {
            if (req.file.size > imagensProduto.TAMANHO_MAX) return falhar([`A imagem é muito grande. O limite é ${imagensProduto.TAMANHO_MAX_MB}MB.`]);
            if (!imagensProduto.conteudoValido(req.file.path)) return falhar(['A nova capa não é um arquivo JPG ou PNG válido.']);
            novaImagem = await enviarImagem(req.file, 'products', id_produto, 'cover');
        }

        const alterados = await Produto.atualizar(id_produto, id_criador, {
            titulo:       req.body.titulo,
            resumo:       req.body.resumo,
            sku:          req.body.sku,
            descricao:    req.body.descricao,
            preco:        parseFloat(req.body.preco),
            tipo_produto: tipo,
            id_categoria: Number(req.body.id_categoria),
            detalhes:     tiposProduto.validarDetalhes(tipo, req.body.detalhes).detalhes,
            imagem:       novaImagem
        });
        if (!alterados) {
            if (novaImagem) armazenamento.remover(novaImagem);
            return falhar(['O produto mudou de situação enquanto você editava. Recarregue a página e tente de novo.']);
        }

        if (novaImagem) imagensProduto.remover(atual.imagem);
        req.session.flashVendedor = {
            tipo: 'sucesso',
            msg: `Alterações de "${req.body.titulo}" salvas.`,
            link: { href: `/paginnerprod?id=${id_produto}`, rotulo: 'Ver página do produto' }
        };
        res.redirect('/admvend');
    } catch (err) {
        console.error(err);
        if (novaImagem) armazenamento.remover(novaImagem);
        falhar([err && err.code === 'ER_NO_REFERENCED_ROW_2'
            ? 'Selecione uma categoria válida!'
            : mensagemDeErro(err, 'Não foi possível salvar as alterações agora. Tente novamente.')]);
    }
});

router.get('/cdstraprod', autenticar, criadorOrAdmin, (req, res) => {
    res.render('pages/cdstraprod', { listaErros: [], campos: {}, resultado: null });
});

router.post('/cdstraprod', autenticar, criadorOrAdmin,
    upload.fields([
        { name: 'imagem', maxCount: 1 },
        { name: 'imagens_adicionais', maxCount: imagensProduto.MAX_ADICIONAIS },
        { name: 'arquivo', maxCount: 1 }
    ]),
    limparTemporarios, validarProduto, async (req, res) => {
    const erro = msg => res.render('pages/cdstraprod', { resultado: null, listaErros: [{ msg }], campos: req.body });
    const imagem     = req.files && req.files.imagem  ? req.files.imagem[0]  : null;
    const adicionais = req.files && req.files.imagens_adicionais ? req.files.imagens_adicionais : [];
    const arquivo    = req.files && req.files.arquivo ? req.files.arquivo[0] : null;
    let id_produto = null;
    let idCriador = null;
    let enviadas = [];

    try {
        if (!imagem) return erro('Selecione a imagem principal do produto (etapa 3).');
        for (const img of [imagem, ...adicionais]) {
            const nome = img === imagem ? 'A imagem principal' : `A imagem "${img.originalname}"`;
            if (img.size > imagensProduto.TAMANHO_MAX) return erro(`${nome} é muito grande. O limite é ${imagensProduto.TAMANHO_MAX_MB}MB.`);
            if (!imagensProduto.conteudoValido(img.path)) return erro(`${nome} não é um arquivo JPG ou PNG válido.`);
        }
        if (!arquivo) return erro('Envie o arquivo do produto (etapa 4): é ele que o comprador recebe depois da compra.');
        if (!arquivosProduto.extensaoPermitida(arquivo.originalname, req.body.tipo_produto)) {
            return erro(`Formato de arquivo não aceito para este tipo de produto. Use: ${listaFormatos(req.body.tipo_produto)}.`);
        }

        if (!armazenamento.configurado()) {
            return erro('O armazenamento de arquivos não está configurado, então não é possível publicar agora. Fale com o suporte.');
        }

        const preco = parseFloat(String(req.body.preco).replace(',', '.'));
        idCriador = req.session.usuario.id_usuario;

        id_produto = await Produto.reservar({
            ...req.body,
            id_criador: idCriador,
            preco,
            detalhes: tiposProduto.validarDetalhes(req.body.tipo_produto, req.body.detalhes).detalhes
        });

        const chaveCapa = await enviarImagem(imagem, 'products', id_produto, 'cover');
        enviadas.push(chaveCapa);
        const chavesGaleria = [];
        for (let i = 0; i < adicionais.length; i++) {
            const chave = await enviarImagem(adicionais[i], 'products', id_produto, 'gallery', `${i + 1}-`);
            enviadas.push(chave);
            chavesGaleria.push(chave);
        }
        const chaveArquivo = await enviarArquivoProduto(arquivo, id_produto);
        enviadas.push(chaveArquivo);

        await Produto.concluirPublicacao(id_produto, idCriador, { imagem: chaveCapa, imagensAdicionais: chavesGaleria, arquivo: chaveArquivo });
        enviadas = [];

        req.session.flashVendedor = {
            tipo: 'sucesso',
            msg: `Produto "${req.body.titulo}" publicado! Ele já aparece no catálogo.`,
            link: { href: `/paginnerprod?id=${id_produto}`, rotulo: 'Ver página do produto' }
        };
        return res.redirect('/admvend');
    } catch (err) {
        console.error(err);
        await armazenamento.removerVarios(enviadas);
        if (id_produto) await Produto.descartarReserva(id_produto, idCriador).catch(e => console.error('Reserva não descartada:', e.message));
        erro(mensagemDeErro(err, 'Não foi possível publicar o produto agora.') +
            ' Seus dados foram mantidos; selecione os arquivos de novo e tente outra vez.');
    }
});

router.post('/produto/arquivo', autenticar, criadorOrAdmin, upload.single('arquivo'), limparTemporarios, async (req, res) => {
    const id_criador = req.session.usuario.id_usuario;
    const avisar = (tipo, msg) => {
        req.session.flashVendedor = { tipo, msg };
        res.redirect('/admvend');
    };
    let chaveNova = null;

    try {
        if (!req.file) return avisar('erro', 'Selecione o arquivo do produto.');
        const produto = await Produto.buscarArquivo(idValido(req.body.id_produto));
        if (!produto || Number(produto.id_criador) !== Number(id_criador)) {
            return avisar('erro', 'Produto não encontrado ou sem permissão.');
        }
        if (!arquivosProduto.extensaoPermitida(req.file.originalname, produto.tipo_produto)) {
            return avisar('erro', `Formato não aceito para este produto. Use: ${listaFormatos(produto.tipo_produto)}.`);
        }

        chaveNova = await enviarArquivoProduto(req.file, produto.id_produto);
        const alterados = await Produto.atualizarArquivo(produto.id_produto, id_criador, chaveNova);
        if (!alterados) throw new Error('Produto não atualizado.');
        chaveNova = null;
        arquivosProduto.remover(produto.arquivo);
        avisar('sucesso', `Arquivo de "${produto.titulo}" salvo. Os compradores já podem baixá-lo.`);
    } catch (err) {
        console.error(err);
        if (chaveNova) armazenamento.remover(chaveNova);
        avisar('erro', mensagemDeErro(err, 'Não foi possível salvar o arquivo. Tente novamente.'));
    }
});

router.post('/produto/inativar', autenticar, criadorOrAdmin, async (req, res) => {
    try {
        const alterados = await Produto.alterarStatus(idValido(req.body.id_produto), req.session.usuario.id_usuario, 'ativo', 'inativo');
        req.session.flashVendedor = alterados
            ? { tipo: 'sucesso', msg: 'Produto inativado: ele não aparece mais no catálogo. Reative quando quiser.' }
            : { tipo: 'erro', msg: 'Não foi possível inativar: produto não encontrado ou sem permissão.' };
    } catch (err) {
        console.error(err);
        req.session.flashVendedor = { tipo: 'erro', msg: 'Não foi possível inativar o produto. Tente novamente.' };
    }
    res.redirect('/admvend');
});

router.post('/produto/reativar', autenticar, criadorOrAdmin, async (req, res) => {
    try {
        const alterados = await Produto.alterarStatus(idValido(req.body.id_produto), req.session.usuario.id_usuario, 'inativo', 'ativo');
        req.session.flashVendedor = alterados
            ? { tipo: 'sucesso', msg: 'Produto reativado: ele voltou a aparecer no catálogo.' }
            : { tipo: 'erro', msg: 'Não foi possível reativar: produto não encontrado, sem permissão ou suspenso pela moderação.' };
    } catch (err) {
        console.error(err);
        req.session.flashVendedor = { tipo: 'erro', msg: 'Não foi possível reativar o produto. Tente novamente.' };
    }
    res.redirect('/admvend');
});

router.post('/produto/excluir', autenticar, criadorOrAdmin, async (req, res) => {
    try {
        const modo = await Produto.excluir(idValido(req.body.id_produto), req.session.usuario.id_usuario);
        req.session.flashVendedor = modo === 'logica'
            ? { tipo: 'sucesso', msg: 'Produto retirado da loja. Quem já comprou continua com acesso ao arquivo e à avaliação.' }
            : modo === 'fisica'
                ? { tipo: 'sucesso', msg: 'Produto excluído.' }
                : { tipo: 'erro', msg: 'Não foi possível excluir: produto não encontrado ou sem permissão.' };
    } catch (err) {
        console.error(err);
        req.session.flashVendedor = { tipo: 'erro', msg: 'Não foi possível excluir o produto agora. Tente novamente.' };
    }
    res.redirect('/admvend');
});

router.post('/favoritos/adicionar', autenticar, garantirCliente, async (req, res) => {
    const id_produto = idValido(req.body.id_produto);
    try {
        const produto = await Produto.buscarPorId(id_produto);
        if (!produto) {
            if (querJson(req)) return res.status(404).json({ erro: 'Este produto não está disponível.' });
            return res.redirect('/PProdutos');
        }
        await Favorito.adicionar(req.session.usuario.id_usuario, id_produto);
        if (querJson(req)) return res.json({ favoritado: true });
        res.redirect(`/paginnerprod?id=${id_produto}`);
    } catch (err) {
        console.error(err);
        if (querJson(req)) return res.status(500).json({ erro: 'Não foi possível atualizar seus favoritos. Tente novamente.' });
        res.redirect(id_produto ? `/paginnerprod?id=${id_produto}` : '/PProdutos');
    }
});

router.post('/favoritos/remover', autenticar, async (req, res) => {
    const id_produto = idValido(req.body.id_produto);
    const voltar = req.body.origem === 'produto' && id_produto ? `/paginnerprod?id=${id_produto}` : '/favoritos';
    try {
        await Favorito.remover(req.session.usuario.id_usuario, id_produto);
        if (querJson(req)) return res.json({ favoritado: false });
        res.redirect(voltar);
    } catch (err) {
        console.error(err);
        if (querJson(req)) return res.status(500).json({ erro: 'Não foi possível atualizar seus favoritos. Tente novamente.' });
        res.redirect(voltar);
    }
});

// ============================================================
//  Suporte logado — redireciona para a página unificada
// ============================================================
router.get('/suporteloged',          autenticar, (req, res) => res.redirect('/suporte'));
router.post('/suporteloged',         autenticar, (req, res) => res.redirect('/suporte'));
router.post('/suporteloged/cancelar', autenticar, cancelarTicket);


// ============================================================
//  Inativação de conta pelo próprio usuário (exclusão em 30 dias)
// ============================================================
router.post('/conta/inativar', autenticar, async (req, res) => {
    try {
        const { id_usuario, nome, email } = req.session.usuario;
        await Cliente.buscarOuCriar(id_usuario);
        await Usuario.atualizarStatus(id_usuario, 'inativo');
        await Denuncia.criar({
            id_usuario,
            id_produto: null,
            id_criador: null,
            motivo: 'exclusao_de_conta',
            descricao: 'Solicitação de exclusão feita pelo próprio usuário.'
        });

        try {
            await mailer.enviarEmail({
                to: email,
                subject: 'Sua conta foi desativada — CloudMind',
                html: `
                  <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:2rem;
                               border:1px solid #e2e8f0;border-radius:12px;">
                    <h2 style="color:#2b4c7e;margin-bottom:.5rem;">CloudMind</h2>
                    <p>Olá, <strong>${mailer.escaparHtml(nome)}</strong>!</p>
                    <p>Sua conta está <strong>desativada</strong> e será excluída permanentemente em <strong>30 dias</strong>.</p>
                    <p>Para cancelar a exclusão, basta <strong>fazer login</strong> novamente antes do prazo — sua conta será reativada automaticamente.</p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0;">
                    <p style="font-size:.8rem;color:#64748b;">Equipe CloudMind</p>
                  </div>`
            });
        } catch (mailErr) {
            console.error('E-mail de inativação não enviado:', mailErr.message);
        }

        req.session.destroy(() => res.redirect('/login?msg=conta_inativada'));
    } catch (err) {
        console.error(err);
        await Usuario.atualizarStatus(req.session.usuario.id_usuario, 'ativo').catch(() => {});
        req.session.flashConfig = { tipo: 'erro', msg: 'Não foi possível desativar sua conta agora. Nada foi alterado; tente novamente em instantes.' };
        res.redirect('/config');
    }
});

router.use((err, req, res, next) => {
    const mensagem = String((err && err.message) || '');
    if (err instanceof multer.MulterError || mensagem.includes('Formato')) {
        let msg = mensagem;
        if (err.code === 'LIMIT_FILE_SIZE') {
            msg = err.field === 'arquivo'
                ? `O arquivo do produto é muito grande. O limite é ${arquivosProduto.TAMANHO_MAX_MB}MB.`
                : `A imagem é muito grande. O limite é ${imagensProduto.TAMANHO_MAX_MB}MB.`;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            msg = err.field === 'imagens_adicionais'
                ? `Envie no máximo ${imagensProduto.MAX_ADICIONAIS} imagens adicionais.`
                : 'Envio de arquivo inesperado.';
        }

        if (req.originalUrl === '/produto/arquivo') {
            req.session.flashVendedor = { tipo: 'erro', msg };
            return res.redirect('/admvend');
        }

        if (req.originalUrl === '/pgpublica/capa') {
            req.session.flashPgPublica = { aviso: { tipo: 'erro', msg } };
            return res.redirect('/pgpublica#capa');
        }

        if (req.originalUrl === '/produto/editar') {
            return voltarParaEdicao(req, res, idValido(req.body && req.body.id_produto), [msg]);
        }

        if (req.originalUrl === '/cdstraprod') {
            return res.status(400).render('pages/cdstraprod', {
                resultado: null,
                listaErros: [{ msg }],
                campos: req.body || {}
            });
        }

        return res.status(400).json({ erro: msg });
    }
    next(err);
});

module.exports = router;
