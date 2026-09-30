(function () {
  'use strict';

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-confirmar')) return;
    if (!window.confirm(form.getAttribute('data-confirmar'))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    
    var botao = e.submitter || form.querySelector('button[type="submit"], button:not([type])');
    if (botao) {
      setTimeout(function () {
        botao.disabled = true;
        botao.setAttribute('aria-busy', 'true');
      }, 0);
    }
  }, true);
})();
