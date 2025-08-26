var express = require("express");
var router = express.Router();
const { body, validationResult } = require("express-validator");
var {validarcpf } = require("../helpers/validacoes");


router.get("/PProdutos", (req, res) => {
  res.render("pages/PProdutos");
});


router.get("/adm", (req, res) => {
  res.render("pages/adm");
});

router.get("/", (req, res) => {
  res.render("pages/Main");
});

router.get("/paginnerprod", (req, res) => {
  res.render("pages/paginnerprod");
});

router.get("/SobreNos", (req, res) => {
  res.render("pages/SobreNos");
});

router.get("/cadastro", (req, res) => {
    res.render("pages/cadastro", {listaErros:null, resultado: null, campos: { nome: "", email: "", cpf: "", senha: "", csenha: "" } });
});
router.post("/cadastro",
    [
    body("nome")
    .isLength({min: 10, max: 50})
    .withMessage('O nome deve conter de 10 a 50 caracteres!'),
    body("email")
    .isEmail()
    .withMessage('O e-mail deve ser válido'),
    body("cpf")
    .isLength({ min: 11, max: 11 })
    .withMessage('O CPF tem 11 caracteres!')
    .custom((value) => {
        if (validarcpf(value)) {
            return true;
        } else {
            throw new Error('CPF inválido');
        }
    }
   
),
body("senha")
.isStrongPassword({ minLength: 8 })
.withMessage(
    'A senha esta muito fraca, deve conter caracter especial, minusculo, maiusculo e numero!'
),
body("csenha")
.custom((value, { req }) => {
    if (value !== req.body.senha) {
        throw new Error('As senhas não são iguais');
    }
    return true;
}),
],
 function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log(errors);
      return res.render("pages/cadastro", { 
        resultado: null,
        "listaErros": errors.array(),
        "campos": req.body 
    });
    }
    return res.render("pages/cadastro", {
        resultado: req.body,
        "listaErros": errors,
        "campos": req.body
    });
  }
);

module.exports = router;