(function () {
  'use strict';
  var form = document.querySelector('.password-form');
  if (!form || !window.CMValidacao) return;
  var V = window.CMValidacao;
  var nova = form.querySelector('#nova_senha');

  V.ligarFormulario(form, {
    atual: [form.querySelector('#senha_atual'), function (v) { return v ? '' : 'Informe sua senha atual.'; }],
    nova:  [nova, V.senhaForte],
    conf:  [form.querySelector('#confirmar_senha'), function (v) {
      if (!v) return 'Confirme a nova senha.';
      return v === nova.value ? '' : 'As senhas não são iguais.';
    }]
  }, 'Alterando…');

  V.ligarChecklist(nova, document.getElementById('regras-senha'));
})();
