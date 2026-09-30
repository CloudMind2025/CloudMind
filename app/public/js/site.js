
(function () {
  'use strict';

  
  document.querySelectorAll('[data-cm-voltar]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var mesmoSite = false;
      try { mesmoSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (_) {}
      if (mesmoSite && history.length > 1) {
        e.preventDefault();
        history.back();
      }
    });
  });

  
  document.addEventListener('click', function (e) {
    var abrir = e.target.closest('[data-abrir-dialogo]');
    if (abrir) {
      var dlg = document.getElementById(abrir.getAttribute('data-abrir-dialogo'));
      if (dlg && typeof dlg.showModal === 'function') { dlg.showModal(); return; }
    }
    var fechar = e.target.closest('[data-fechar-dialogo]');
    if (fechar) {
      var aberto = fechar.closest('dialog');
      if (aberto) aberto.close();
      return;
    }
    
    if (e.target instanceof HTMLDialogElement && e.target.open) {
      var r = e.target.getBoundingClientRect();
      var dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!dentro) e.target.close();
    }
  });

 
  document.querySelectorAll('[data-mostrar-senha]').forEach(function (botao) {
    botao.addEventListener('click', function () {
      var input = document.getElementById(botao.getAttribute('data-mostrar-senha'));
      if (!input) return;
      var mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      botao.setAttribute('aria-pressed', String(mostrar));
      botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      var icone = botao.querySelector('i');
      if (icone) icone.className = 'fa-regular ' + (mostrar ? 'fa-eye-slash' : 'fa-eye');
    });
  });

  
  document.querySelectorAll('form[data-enviando]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (e.defaultPrevented) return;
      var botao = form.querySelector('button[type="submit"], button:not([type])');
      if (!botao) return;
      setTimeout(function () {
        if (e.defaultPrevented) return;
        botao.disabled = true;
        botao.setAttribute('aria-busy', 'true');
        var texto = form.getAttribute('data-enviando');
        if (texto) {
          var alvo = botao.querySelector('span') || botao.lastChild;
          if (alvo) alvo.textContent = ' ' + texto;
        }
      }, 0);
    });
  });
})();
