const { body, validationResult } = require('express-validator');
const { validarcpf } = require('../helpers/validacoes');
const tiposProduto = require('../helpers/tiposProduto');
const Produto = require('../models/Produto');

function camposDoTipo() {
    const vistos = new Set();
    const regras = [];
    tiposProduto.CHAVES.forEach(chaveTipo => {
        tiposProduto.TIPOS[chaveTipo].campos.forEach(c => {
            if (vistos.has(c.chave)) return;
            vistos.add(c.chave);
            regras.push(body('detalhes').custom((detalhes, { req }) => {
                const tipo = tiposProduto.tipo(req.body.tipo_produto);
                const campo = tipo && tipo.campos.find(x => x.chave === c.chave);
                if (!campo) return true;
                const r = tiposProduto.validarCampo(campo, detalhes && typeof detalhes === 'object' ? detalhes[c.chave] : undefined);
                if (r.erro) throw new Error(r.erro);
                return true;
            }));
        });
    });
    return regras;
}

function normalizarPreco(valor) {
    if (typeof valor !== 'string') return valor;
    const v = valor.trim().replace(/R\$|\s/g, '');
    if (v.includes(',')) return v.replace(/\./g, '').replace(',', '.');
    if (/^\d+\.\d{1,2}$/.test(v)) return v;
    return v.replace(/\./g, '');
}

const verificarErros = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render(`pages/${req.path.replace('/', '')}`, {
            listaErros: errors.array(),
            campos: req.body,
            resultado: null,
            usuario: req.session ? req.session.usuario : null
        });
    }
    next();
};

const regraNome = () => body('nome')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('O nome deve ter de 3 a 50 caracteres.')
    .bail()
    .matches(/^\S+(\s+\S+)+$/)
    .withMessage('Informe nome e sobrenome.');

// ============================================================
//  Validação de cadastro de usuário  (página /cadastro)
// ============================================================
const validarCadastro = [
    regraNome(),

    body('email')
        .isEmail()
        .withMessage('O e-mail deve ser válido!'),

    body('tipo_conta')
        .isIn(['cliente', 'vendedor'])
        .withMessage('Selecione um tipo de conta válido!'),

    body('cpf')
        .customSanitizer((value, { req }) =>
            req.body.tipo_conta === 'vendedor' ? String(value || '').replace(/\D/g, '') : '')
        .if(body('tipo_conta').equals('vendedor'))
        .notEmpty()
        .withMessage('O CPF é obrigatório para contas de vendedor!')
        .bail()
        .isLength({ min: 11, max: 11 })
        .withMessage('O CPF deve ter 11 dígitos!')
        .bail()
        .custom((value) => {
            if (validarcpf(value)) return true;
            throw new Error('CPF inválido!');
        }),

    body('senha')
        .isStrongPassword({ minLength: 8 })
        .withMessage('A senha deve ter no mínimo 8 caracteres, letra maiúscula, minúscula, número e caractere especial!'),

    body('csenha')
        .custom((value, { req }) => {
            if (value !== req.body.senha) throw new Error('As senhas não são iguais!');
            return true;
        }),

    verificarErros
];

// ============================================================
//  Validação de login  (página /login)
// ============================================================
const validarLogin = [
    body('email')
        .isEmail()
        .withMessage('Digite um e-mail válido!'),

    body('senha')
        .notEmpty()
        .withMessage('A senha é obrigatória!'),

    verificarErros
];

// ============================================================
//  Validação de alteração de senha  (página /alterarsenha)
// ============================================================
const validarAlterarSenha = [
    body('senha_atual')
        .notEmpty()
        .withMessage('A senha atual é obrigatória!'),

    body('nova_senha')
        .isStrongPassword({ minLength: 8 })
        .withMessage('A nova senha deve ter no mínimo 8 caracteres, letra maiúscula, minúscula, número e caractere especial!'),

    body('confirmar_senha')
        .custom((value, { req }) => {
            if (value !== req.body.nova_senha) throw new Error('As senhas não são iguais!');
            return true;
        }),

    verificarErros
];

// ============================================================
//  Validação de edição de dados  (página /editardados)
// ============================================================
const validarEditarDados = [
    regraNome(),

    body('email')
        .trim()
        .isEmail()
        .withMessage('O e-mail deve ser válido!'),

    verificarErros
];

// ============================================================
//  Validação de cadastro de produto  (página /cdstraprod)
// ============================================================
const regrasProduto = [
    body('titulo')
        .trim()
        .isLength({ min: 5, max: 100 })
        .withMessage('O título deve ter entre 5 e 100 caracteres!'),

    body('descricao')
        .trim()
        .isLength({ min: 20, max: 1000 })
        .withMessage('A descrição deve ter entre 20 e 1000 caracteres!'),

    body('preco')
        .customSanitizer(normalizarPreco)
        .isFloat({ min: 0.01, max: 999999.99 })
        .withMessage('Informe um preço válido, de 0,01 a 999.999,99 (ex.: 39,90 ou 1.500,00)!'),

    body('tipo_produto')
        .isIn(tiposProduto.CHAVES)
        .withMessage('Tipo de produto inválido!'),

    body('id_categoria')
        .isInt({ min: 1 })
        .withMessage('Selecione uma categoria!')
        .bail()
        .custom(async (valor, { req }) => {
            const tipo = tiposProduto.tipo(req.body.tipo_produto);
            if (!tipo) return true;
            const categoria = await Produto.buscarCategoria(Number(valor));
            if (!categoria || !tiposProduto.categoriaPermitida(req.body.tipo_produto, categoria.slug_categoria)) {
                throw new Error(`Escolha uma categoria de ${tipo.rotulo} na lista.`);
            }
            return true;
        }),

    ...camposDoTipo(),

    body('resumo')
        .trim()
        .if(value => value !== '')
        .isLength({ min: 10, max: 150 })
        .withMessage('O resumo deve ter entre 10 e 150 caracteres!'),

    body('sku')
        .trim()
        .if(value => value !== '')
        .matches(/^[a-zA-Z0-9]{3,20}$/)
        .withMessage('O SKU deve ter de 3 a 20 caracteres alfanuméricos (sem símbolos)!')
];

const validarProduto = [...regrasProduto, verificarErros];

const validarEdicaoProduto = [
    body('id_produto')
        .isInt({ min: 1 })
        .withMessage('Produto inválido!'),
    ...regrasProduto
];

// ============================================================
//  Perguntas e respostas da página do produto (/paginnerprod)
// ============================================================
const validarPergunta = [
    body('pergunta')
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('A pergunta deve ter entre 10 e 500 caracteres!')
];

const validarAvaliacao = [
    body('nota')
        .isInt({ min: 1, max: 5 })
        .withMessage('Escolha uma nota de 1 a 5 estrelas!'),

    body('comentario')
        .trim()
        .isLength({ max: 1000 })
        .withMessage('O comentário deve ter no máximo 1000 caracteres!')
];

const validarResposta = [
    body('id_pergunta')
        .isInt({ min: 1 })
        .withMessage('Pergunta inválida!'),

    body('resposta')
        .trim()
        .isLength({ min: 2, max: 1000 })
        .withMessage('A resposta deve ter entre 2 e 1000 caracteres!')
];

// ============================================================
//  Validação de ticket de suporte  (página /suporte)
// ============================================================
const validarSuporte = [
    body('tipo_chamada')
        .isIn(['duvida', 'problema', 'sugestao', 'outro'])
        .withMessage('Selecione a categoria do ticket.'),

    body('descricao')
        .trim()
        .isLength({ min: 20, max: 1000 })
        .withMessage('A mensagem deve ter entre 20 e 1000 caracteres.')
];

// ============================================================
//  Validação de denúncia
// ============================================================
const validarDenuncia = [
    body('motivo')
        .isLength({ min: 10, max: 500 })
        .withMessage('O motivo deve ter entre 10 e 500 caracteres!'),

    body('descricao')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('A descrição deve ter no máximo 1000 caracteres!'),

    verificarErros
];

// ============================================================
//  Apresentação da loja pública  (página /pgpublica)
// ============================================================
const validarPaginaPublica = [
    body('bio')
        .customSanitizer(v => String(v || '').replace(/\r\n?/g, '\n'))
        .trim()
        .isLength({ max: 1000 })
        .withMessage('A apresentação deve ter no máximo 1000 caracteres!')
];

module.exports = {
    validarCadastro,
    validarLogin,
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
};
