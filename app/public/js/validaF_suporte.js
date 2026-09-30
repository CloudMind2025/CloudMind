(function () {
  'use strict';
  var form = document.querySelector('.ticket-form');
  if (!form || !window.CMValidacao) return;
  var V = window.CMValidacao;

  var categoria = form.querySelector('#tipo_chamada');
  var mensagem = form.querySelector('#descricao');
  var contador = document.getElementById('descricao-contador');

  V.ligarFormulario(form, {
    categoria: [categoria, function (v) { return v ? '' : 'Selecione a categoria do ticket.'; }],
    mensagem: [mensagem, function (v) {
      var n = String(v).trim().length;
      if (!n) return 'Escreva sua mensagem.';
      if (n < 20) return 'A mensagem deve ter no mínimo 20 caracteres (faltam ' + (20 - n) + ').';
      if (n > 1000) return 'A mensagem deve ter no máximo 1000 caracteres.';
      return '';
    }]
  }, 'Enviando…');

  categoria.addEventListener('change', function () { V.erroCampo(categoria, categoria.value ? '' : 'Selecione a categoria do ticket.'); });

  function atualizarContador() { contador.textContent = mensagem.value.length + '/1000'; }
  mensagem.addEventListener('input', atualizarContador);
  atualizarContador();

  form.addEventListener('reset', function () {
    setTimeout(function () {
      V.erroCampo(categoria, '');
      V.erroCampo(mensagem, '');
      atualizarContador();
    }, 0);
  });
})();
