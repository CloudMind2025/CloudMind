(function () {
  'use strict';
  var form = document.querySelector('[data-form-cadastro]');
  if (!form || !window.CMValidacao) return;
  var V = window.CMValidacao;

  var cpf = form.querySelector('#cpf');
  var senha = form.querySelector('#password');
  var cpfWrapper = document.getElementById('cpf-wrapper');

  function tipoConta() {
    var marcado = form.querySelector('input[name="tipo_conta"]:checked');
    return marcado ? marcado.value : 'cliente';
  }

  function cpfValido(raw) {
    if (raw.length !== 11 || /^(\d)\1{10}$/.test(raw)) return false;
    var soma = 0, resto, i;
    for (i = 1; i <= 9; i++) soma += parseInt(raw.charAt(i - 1), 10) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(raw.charAt(9), 10)) return false;
    soma = 0;
    for (i = 1; i <= 10; i++) soma += parseInt(raw.charAt(i - 1), 10) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(raw.charAt(10), 10);
  }

  function regraCpf(valor) {
    if (tipoConta() !== 'vendedor') return '';
    var raw = String(valor).replace(/\D/g, '');
    if (!raw) return 'O CPF é obrigatório para contas de vendedor.';
    if (raw.length !== 11) return 'O CPF deve ter 11 dígitos.';
    if (!cpfValido(raw)) return 'CPF inválido. Confira os números.';
    return '';
  }

  V.ligarFormulario(form, {
    nome:  [form.querySelector('#name'), V.nomeCompleto],
    email: [form.querySelector('#email'), V.email],
    cpf:   [cpf, regraCpf],
    senha: [senha, V.senhaForte],
    conf:  [form.querySelector('#confirm-password'), function (v) {
      if (!v) return 'Confirme a senha.';
      return v === senha.value ? '' : 'As senhas não são iguais.';
    }]
  }, 'Criando conta…');

  V.ligarChecklist(senha, document.getElementById('regras-senha'));

  function mascaraCPF(valor) {
    var v = valor.replace(/\D/g, '').slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    return v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  cpf.addEventListener('input', function () { cpf.value = mascaraCPF(cpf.value); });
  if (cpf.value) cpf.value = mascaraCPF(cpf.value);

  function sincronizarTipo() {
    var tipo = tipoConta();
    form.querySelectorAll('.tipo-card').forEach(function (card) {
      card.classList.toggle('ativo', card.querySelector('input').value === tipo);
    });
    var vendedor = tipo === 'vendedor';
    cpfWrapper.hidden = !vendedor;
    cpf.required = vendedor;
    if (!vendedor) { cpf.value = ''; V.erroCampo(cpf, ''); }
  }
  form.querySelectorAll('input[name="tipo_conta"]').forEach(function (r) { r.addEventListener('change', sincronizarTipo); });
  sincronizarTipo();
})();
