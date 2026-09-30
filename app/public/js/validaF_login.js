(function () {
  'use strict';
  var form = document.querySelector('[data-form-login]');
  if (!form || !window.CMValidacao) return;
  var V = window.CMValidacao;

  V.ligarFormulario(form, {
    email: [form.querySelector('#email'), V.email],
    senha: [form.querySelector('#password'), function (v) { return v ? '' : 'Informe sua senha.'; }]
  }, 'Entrando…');
})();
