// ============================================================
//  CloudMind — Router com login, sessão e bcrypt
// ============================================================

var express = require('express');
var router  = express.Router();
const bcrypt = require('bcryptjs');
const pool   = require('../../config/db');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const Usuario = require('../models/Usuario');
const Cliente = require('../models/Cliente');
const Criador = require('../models/Criador');
const Produto  = require('../models/Produto');
const Pedido   = require('../models/Pedido');
const Carrinho = require('../models/Carrinho');
const Favorito = require('../models/Favorito');
const Suporte  = require('../models/Suporte');
const Denuncia = require('../models/Denuncia');
const mailer   = require('../helpers/mailer');

const {
    validarCadastro,
    validarAlterarSenha,
    validarEditarDados,
    validarProduto,
    validarSuporte,
    validarDenuncia
} = require('../validators/cloudmindValidator');

const uploadDir = path.join(__dirname, '..', '..', 'app', 'public', 'image', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const avatarDir = path.join(__dirname, '..', '..', 'app', 'public', 'image', 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const uploadAvatar = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, avatarDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `avatar-${req.session.usuario.id_usuario}${ext}`);
        }
    }),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/\.(jpe?g|png)$/i.test(file.originalname)) return cb(null, true);
        cb(new Error('Formato inválido. Use JPG ou PNG.'));
    }
});

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${Date.now()}-${file.fieldname}${ext}`);
        }
    }),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/\.(jpe?g|png)$/i.test(file.originalname)) {
            return cb(null, true);
        }
        cb(new Error('Formato de imagem inválido. Use JPG ou PNG.'));
    }
});

// Middleware de autenticação
function autenticar(req, res, next) {
    if (req.session.usuario) return next();
    res.redirect('/login');
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

    await Cliente.buscarOuCriar(req.session.usuario.id_usuario);
    next();
}

// Bloqueia ADM fora do painel administrativo
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
router.get('/',         (req, res) => res.render('pages/Main'));
router.get('/SobreNos', (req, res) => res.render('pages/SobreNos'));

// ============================================================
//  Suporte — funciona para logados e não-logados
// ============================================================
router.get('/suporte', async (req, res) => {
    let tickets = [];
    if (req.session.usuario) {
        tickets = await Suporte.listarPorUsuario(req.session.usuario.id_usuario).catch(() => []);
    }
    res.render('pages/suporte', { listaErros: [], campos: {}, resultado: null, tickets });
});

router.post('/suporte', validarSuporte, async (req, res) => {
    try {
        const { tipo_chamada, descricao } = req.body;
        const id_usuario = req.session.usuario ? req.session.usuario.id_usuario : null;
        await Suporte.criar({ id_usuario, tipo_chamada, descricao });
        const tickets = req.session.usuario
            ? await Suporte.listarPorUsuario(req.session.usuario.id_usuario).catch(() => [])
            : [];
        res.render('pages/suporte', {
            resultado: 'Ticket enviado com sucesso! Nossa equipe analisará em breve.',
            listaErros: [], campos: {}, tickets
        });
    } catch (err) {
        console.error(err);
        const tickets = req.session.usuario
            ? await Suporte.listarPorUsuario(req.session.usuario.id_usuario).catch(() => [])
            : [];
        res.render('pages/suporte', {
            resultado: null,
            listaErros: [{ msg: 'Erro ao enviar ticket. Tente novamente.' }],
            campos: req.body, tickets
        });
    }
});

router.post('/suporte/cancelar', autenticar, async (req, res) => {
    try {
        await Suporte.fechar(req.body.id_chamada);
    } catch (err) {
        console.error(err);
    }
    res.redirect('/suporte');
});

// ============================================================
//  Produtos — público
// ============================================================
router.get('/PProdutos', async (req, res) => {
    try {
        const produtos = await Produto.listarTodos();
        res.render('pages/PProdutos', { produtos });
    } catch (err) {
        console.error(err);
        res.render('pages/PProdutos', { produtos: [], erro: 'Erro ao carregar produtos.' });
    }
});

router.get('/pprodutos1', async (req, res) => {
    try {
        const produto = await Produto.buscarPorId(req.query.id);
        res.render('pages/pprodutos1', { produto });
    } catch (err) {
        console.error(err);
        res.redirect('/PProdutos');
    }
});

router.get('/paginnerprod', async (req, res) => {
    try {
        const produto = await Produto.buscarPorId(req.query.id);
        res.render('pages/paginnerprod', { produto });
    } catch (err) {
        console.error(err);
        res.redirect('/PProdutos');
    }
});

router.get('/pgpublica', async (req, res) => {
    try {
        const criador  = await Criador.buscarPorId(req.query.id);
        const produtos = await Produto.listarPorCriador(req.query.id);
        res.render('pages/pgpublica', { criador, produtos });
    } catch (err) {
        console.error(err);
        res.redirect('/PProdutos');
    }
});

// ============================================================
//  Cadastro
// ============================================================
router.get('/cadastro', (req, res) => {
    res.render('pages/cadastro', { listaErros: [], campos: {}, resultado: null });
});

router.post('/cadastro', validarCadastro, async (req, res) => {
    try {
        const { nome, email, senha, cpf, tipo_conta } = req.body;
        const senhaHash = await bcrypt.hash(senha, 10);
        const id = await Usuario.criar({ nome, email, senha: senhaHash });
        if (tipo_conta === 'vendedor') {
            await Criador.criar(id, cpf);
        } else {
            await Cliente.criar(id, cpf);
        }
        res.render('pages/cadastro', { resultado: true, listaErros: [], campos: {} });
    } catch (err) {
        const isDuplicate = err.code === 'ER_DUP_ENTRY' || err.message.includes('Duplicate');
        if (!isDuplicate) console.error(err);
        const msg = isDuplicate ? 'E-mail ou CPF já cadastrado!' : 'Erro ao cadastrar. Tente novamente.';
        res.render('pages/cadastro', { resultado: null, listaErros: [{ msg }], campos: req.body });
    }
});

// ============================================================
//  Login e Logout
// ============================================================
router.get('/login', (req, res) => {
    if (req.session.usuario) return res.redirect('/');
    res.render('pages/login', { erro: null, campos: {}, msg: req.query.msg || null });
});

router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await Usuario.buscarPorEmail(email);

        if (!usuario) {
            return res.render('pages/login', { erro: 'E-mail ou senha incorretos.', campos: req.body });
        }
        if (usuario.status === 'suspenso') {
            return res.render('pages/login', { erro: 'Conta suspensa. Entre em contato com o suporte.', campos: req.body });
        }
        if (!['ativo', 'inativo'].includes(usuario.status)) {
            return res.render('pages/login', { erro: 'Conta suspensa ou inativa.', campos: req.body });
        }

        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        if (!senhaCorreta) {
            return res.render('pages/login', { erro: 'E-mail ou senha incorretos.', campos: req.body });
        }

        // Se a conta estava aguardando exclusão, reativa automaticamente ao fazer login
        const contaReativada = usuario.status === 'inativo';
        if (contaReativada) {
            await Usuario.atualizarStatus(usuario.id_usuario, 'ativo');
        }

        // Detecta tipo do usuário
        const [admins]   = await pool.query('SELECT * FROM administrador WHERE id_usuario = ?', [usuario.id_usuario]);
        const [criadores] = await pool.query('SELECT * FROM criador WHERE id_usuario = ?',      [usuario.id_usuario]);

        req.session.usuario = {
            id_usuario: usuario.id_usuario,
            nome:       usuario.nome,
            email:      usuario.email,
            tipo:       admins.length > 0 ? 'admin' : criadores.length > 0 ? 'criador' : 'cliente',
            foto:       usuario.foto || null
        };

        const destino = req.session.usuario.tipo === 'admin' ? '/paineladm' : (contaReativada ? '/?msg=conta_reativada' : '/');
        return res.redirect(destino);

    } catch (err) {
        console.error(err);
        res.render('pages/login', { erro: 'Erro ao fazer login. Tente novamente.', campos: req.body });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ============================================================
//  Área do cliente
// ============================================================
router.get('/perfiluser', autenticar, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT data_cad_usuario AS data_cadastro FROM usuario WHERE email_usuario = ?',
            [req.session.usuario.email]
        );
        const cliente = {
            ...req.session.usuario,
            data_cadastro: rows[0] ? rows[0].data_cadastro : null
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
    try {
        const { nome, email } = req.body;
        await Usuario.atualizar(req.session.usuario.id_usuario, { nome, email });
        req.session.usuario.nome  = nome;
        req.session.usuario.email = email;
        res.render('pages/editardados', { resultado: 'Dados atualizados com sucesso!', listaErros: [], campos: req.body, usuario: req.session.usuario });
    } catch (err) {
        console.error(err);
        res.render('pages/editardados', { resultado: null, listaErros: [{ msg: 'Erro ao atualizar dados.' }], campos: req.body, usuario: req.session.usuario });
    }
});

router.post('/perfil/foto', autenticar, uploadAvatar.single('foto'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
        const fotoUrl = `/image/avatars/${req.file.filename}`;
        await Usuario.atualizarFoto(req.session.usuario.id_usuario, fotoUrl);
        req.session.usuario.foto = fotoUrl;
        res.json({ foto: fotoUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao salvar foto.' });
    }
});

router.get('/alterarsenha', autenticar, (req, res) => {
    res.render('pages/alterarsenha', { resultado: null, listaErros: [], campos: {} });
});

router.post('/alterarsenha', autenticar, validarAlterarSenha, async (req, res) => {
    try {
        const usuario = await Usuario.buscarPorEmail(req.session.usuario.email);
        const senhaCorreta = await bcrypt.compare(req.body.senha_atual, usuario.senha);
        if (!senhaCorreta) {
            return res.render('pages/alterarsenha', { resultado: null, listaErros: [{ msg: 'Senha atual incorreta!' }], campos: {} });
        }
        const novaHash = await bcrypt.hash(req.body.nova_senha, 10);
        await Usuario.atualizarSenha(req.session.usuario.id_usuario, novaHash);
        res.render('pages/alterarsenha', { resultado: 'Senha alterada com sucesso!', listaErros: [], campos: {} });
    } catch (err) {
        console.error(err);
        res.render('pages/alterarsenha', { resultado: null, listaErros: [{ msg: 'Erro ao alterar senha.' }], campos: {} });
    }
});

router.get('/favoritos', autenticar, async (req, res) => {
    try {
        const favoritos = await Favorito.listarPorCliente(req.session.usuario.id_usuario);
        res.render('pages/favoritos', { favoritos });
    } catch (err) {
        console.error(err);
        res.render('pages/favoritos', { favoritos: [] });
    }
});

router.get('/carrinho', autenticar, garantirCliente, async (req, res) => {
    try {
        const carrinho    = await Carrinho.buscarOuCriar(req.session.usuario.id_usuario);
        const itens       = await Carrinho.listarItens(carrinho.id_carrinho);
        const id_carrinho = carrinho.id_carrinho;
        res.render('pages/carrinho', { itens, id_carrinho });
    } catch (err) {
        console.error(err);
        res.render('pages/carrinho', { itens: [], id_carrinho: null });
    }
});

router.post('/carrinho/adicionar', autenticar, garantirCliente, async (req, res) => {
    try {
        const { id_produto, preco_unitario } = req.body;
        const carrinho = await Carrinho.buscarOuCriar(req.session.usuario.id_usuario);
        await Carrinho.adicionarItem(carrinho.id_carrinho, id_produto, parseFloat(preco_unitario));
        res.redirect('/carrinho');
    } catch (err) {
        console.error(err);
        res.redirect('/PProdutos');
    }
});

router.post('/carrinho/remover', autenticar, async (req, res) => {
    try {
        await Carrinho.removerItem(req.body.id_carrinho, req.body.id_produto);
        res.redirect('/carrinho');
    } catch (err) {
        console.error(err);
        res.redirect('/carrinho');
    }
});

router.post('/carrinho/limpar', autenticar, async (req, res) => {
    try {
        await Carrinho.limpar(req.body.id_carrinho);
        res.redirect('/carrinho');
    } catch (err) {
        console.error(err);
        res.redirect('/carrinho');
    }
});

router.get('/minhascompras', autenticar, async (req, res) => {
    try {
        const pedidos = await Pedido.listarPorCliente(req.session.usuario.id_usuario);
        res.render('pages/minhascompras', { pedidos });
    } catch (err) {
        console.error(err);
        res.render('pages/minhascompras', { pedidos: [] });
    }
});

router.get('/detalhepedido', autenticar, async (req, res) => {
    try {
        const { pedido, itens } = await Pedido.buscarComItens(req.query.id);
        res.render('pages/detalhepedido', { pedido, itens });
    } catch (err) {
        console.error(err);
        res.redirect('/minhascompras');
    }
});

router.get('/meusdowloads', autenticar, async (req, res) => {
    try {
        const downloads = await Pedido.listarDownloads(req.session.usuario.id_usuario);
        res.render('pages/meusdowloads', { downloads });
    } catch (err) {
        console.error(err);
        res.render('pages/meusdowloads', { downloads: [] });
    }
});

router.get('/config', autenticar, (req, res) => res.render('pages/config'));

// ============================================================
//  Área do criador
// ============================================================
router.get('/admvend', autenticar, criadorOrAdmin, async (req, res) => {
    try {
        const produtos = await Produto.listarPorCriador(req.session.usuario.id_usuario);
        res.render('pages/admvend', { produtos });
    } catch (err) {
        console.error(err);
        res.render('pages/admvend', { produtos: [] });
    }
});

router.get('/perfilvend', autenticar, async (req, res) => {
    try {
        const criador = await Criador.buscarPorId(req.session.usuario.id_usuario);
        res.render('pages/perfilvend', { criador });
    } catch (err) {
        console.error(err);
        res.redirect('/login');
    }
});

router.get('/cdstraprod', autenticar, criadorOrAdmin, (req, res) => {
    res.render('pages/cdstraprod', { listaErros: [], campos: {}, resultado: null });
});

router.post('/cdstraprod', autenticar, criadorOrAdmin, upload.single('imagem'), validarProduto, async (req, res) => {
    try {
        if (!req.file) {
            return res.render('pages/cdstraprod', {
                resultado: null,
                listaErros: [{ msg: 'Selecione uma imagem do produto.' }],
                campos: req.body
            });
        }

        const imagemPath = `image/uploads/${req.file.filename}`;
        const preco = parseFloat(String(req.body.preco).replace(',', '.'));
        const idCriador = req.session.usuario.id_usuario;

        const criador = await Criador.buscarPorId(idCriador);
        if (!criador) {
            await Criador.criar(idCriador, 'Criador administrativo');
        }

        await Produto.criar({
            ...req.body,
            id_criador: idCriador,
            preco,
            imagem: imagemPath
        });

        return res.redirect('/PProdutos');
    } catch (err) {
        console.error(err);
        const mensagem = err.message.includes('invalid') ? err.message : 'Erro ao cadastrar produto.';
        res.render('pages/cdstraprod', { resultado: null, listaErros: [{ msg: mensagem }], campos: req.body });
    }
});

router.post('/produto/inativar', autenticar, async (req, res) => {
    try {
        await Produto.atualizarStatus(req.body.id_produto, 'inativo');
        res.redirect('/admvend');
    } catch (err) {
        console.error(err);
        res.redirect('/admvend');
    }
});

router.post('/produto/reativar', autenticar, async (req, res) => {
    try {
        await Produto.atualizarStatus(req.body.id_produto, 'ativo');
        res.redirect('/admvend');
    } catch (err) {
        console.error(err);
        res.redirect('/admvend');
    }
});

router.post('/produto/excluir', autenticar, async (req, res) => {
    try {
        await Produto.excluir(req.body.id_produto, req.session.usuario.id_usuario);
        res.redirect('/admvend');
    } catch (err) {
        console.error(err);
        res.redirect('/admvend');
    }
});

router.post('/favoritos/remover', autenticar, async (req, res) => {
    try {
        await Favorito.remover(req.session.usuario.id_usuario, req.body.id_produto);
        res.redirect('/favoritos');
    } catch (err) {
        console.error(err);
        res.redirect('/favoritos');
    }
});

// ============================================================
//  Suporte logado — redireciona para a página unificada
// ============================================================
router.get('/suporteloged',          autenticar, (req, res) => res.redirect('/suporte'));
router.post('/suporteloged',         autenticar, (req, res) => res.redirect('/suporte'));
router.post('/suporteloged/cancelar',autenticar, async (req, res) => {
    try { await Suporte.fechar(req.body.id_chamada); } catch (err) { console.error(err); }
    res.redirect('/suporte');
});


// ============================================================
//  Inativação de conta pelo próprio usuário (exclusão em 30 dias)
// ============================================================
router.post('/conta/inativar', autenticar, async (req, res) => {
    try {
        const { id_usuario, nome, email } = req.session.usuario;
        await Usuario.atualizarStatus(id_usuario, 'inativo');
        await Denuncia.criar({
            id_usuario,
            id_produto: null,
            id_criador: null,
            motivo: 'exclusao_de_conta',
            descricao: 'Solicitação de exclusão feita pelo próprio usuário.'
        });

        // Envia e-mail de aviso ao usuário
        try {
            await mailer.enviarEmail({
                to: email,
                subject: 'Sua conta foi desativada — CloudMind',
                html: `
                  <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:2rem;
                               border:1px solid #e2e8f0;border-radius:12px;">
                    <h2 style="color:#2b4c7e;margin-bottom:.5rem;">CloudMind</h2>
                    <p>Olá, <strong>${nome}</strong>!</p>
                    <p>Sua conta está <strong>desativada</strong> e será excluída permanentemente em <strong>30 dias</strong>.</p>
                    <p>Para cancelar a exclusão, basta <strong>fazer login</strong> novamente antes do prazo — sua conta será reativada automaticamente.</p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0;">
                    <p style="font-size:.8rem;color:#94a3b8;">Equipe CloudMind</p>
                  </div>`
            });
        } catch (mailErr) {
            console.error('E-mail de inativação não enviado:', mailErr.message);
        }

        req.session.destroy();
        res.redirect('/login?msg=conta_inativada');
    } catch (err) {
        console.error(err);
        res.redirect('/config');
    }
});


module.exports = router;

