(function () {
  'use strict';
  var form = document.querySelector('.dados-form');
  if (!form || !window.CMValidacao) return;
  var V = window.CMValidacao;

  V.ligarFormulario(form, {
    nome:  [form.querySelector('#nome'), V.nomeCompleto],
    email: [form.querySelector('#email'), V.email]
  }, 'Salvando…');
})();
