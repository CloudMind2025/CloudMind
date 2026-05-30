// ============================================================
//  CloudMind — Validações com express-validator
//  Arquivo: validators/cloudmindValidator.js
// ============================================================

const { body, validationResult } = require('express-validator');
const { validarcpf } = require('../helpers/validacoes');

// Middleware que verifica os erros e retorna se houver
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

// ============================================================
//  Validação de cadastro de usuário  (página /cadastro)
// ============================================================
const validarCadastro = [
    body('nome')
        .isLength({ min: 10, max: 50 })
        .withMessage('O nome deve conter de 10 a 50 caracteres!'),

    body('email')
        .isEmail()
        .withMessage('O e-mail deve ser válido!'),

    body('cpf')
        .if(body('tipo_conta').isIn(['cliente', 'vendedor']))
        .isLength({ min: 11, max: 11 })
        .withMessage('O CPF deve ter 11 dígitos!')
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
    body('nome')
        .isLength({ min: 10, max: 50 })
        .withMessage('O nome deve conter de 10 a 50 caracteres!'),

    body('email')
        .isEmail()
        .withMessage('O e-mail deve ser válido!'),

    verificarErros
];

// ============================================================
//  Validação de cadastro de produto  (página /cdstraprod)
// ============================================================
const validarProduto = [
    body('titulo')
        .isLength({ min: 5, max: 100 })
        .withMessage('O título deve ter entre 5 e 100 caracteres!'),

    body('descricao')
        .isLength({ min: 20, max: 1000 })
        .withMessage('A descrição deve ter entre 20 e 1000 caracteres!'),

    body('preco')
        .customSanitizer(value => typeof value === 'string' ? value.replace(',', '.') : value)
        .isFloat({ min: 0.01 })
        .withMessage('O preço deve ser maior que zero!'),

    body('tipo_produto')
        .isIn(['ebook', 'audiobook', 'curso', 'template', 'assets'])
        .withMessage('Tipo de produto inválido!'),

    body('id_categoria')
        .isInt({ min: 1 })
        .withMessage('Selecione uma categoria válida!'),

    verificarErros
];

// ============================================================
//  Validação de ticket de suporte  (página /suporteloged)
// ============================================================
const validarSuporte = [
    body('tipo_chamada')
        .isIn(['duvida', 'problema', 'sugestao', 'outro'])
        .withMessage('Tipo de chamada inválido!'),

    body('descricao')
        .isLength({ min: 20, max: 1000 })
        .withMessage('A descrição deve ter entre 20 e 1000 caracteres!'),

    verificarErros
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

module.exports = {
    validarCadastro,
    validarLogin,
    validarAlterarSenha,
    validarEditarDados,
    validarProduto,
    validarSuporte,
    validarDenuncia
};
