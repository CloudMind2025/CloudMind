
(function () {
  'use strict';

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var REGRAS_SENHA = {
    tamanho:   function (s) { return s.length >= 8; },
    maiuscula: function (s) { return /[A-Z]/.test(s); },
    minuscula: function (s) { return /[a-z]/.test(s); },
    numero:    function (s) { return /[0-9]/.test(s); },
    simbolo:   function (s) { return /[^A-Za-z0-9]/.test(s); }
  };

 
  function erroCampo(input, mensagem) {
    var id = input.id + '-erro';
    var el = document.getElementById(id);
    var srv = document.getElementById(input.name + '-erro-srv');
    if (srv) srv.remove();
    if (!mensagem) {
      if (el) el.remove();
      input.removeAttribute('aria-invalid');
      input.classList.remove('error');
      return true;
    }
    if (!el) {
      el = document.createElement('span');
      el.id = id;
      el.className = 'cm-erro-campo error-message';
      (input.closest('.campo-senha') || input).after(el);
    }
    el.textContent = mensagem;
    input.setAttribute('aria-invalid', 'true');
    var descr = (input.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && x !== id; });
    descr.push(id);
    input.setAttribute('aria-describedby', descr.join(' '));
    input.classList.add('error');
    return false;
  }

  function nomeCompleto(valor) {
    var v = String(valor || '').trim();
    if (!v) return 'Informe seu nome completo.';
    if (v.length < 3 || v.length > 50) return 'O nome deve ter de 3 a 50 caracteres.';
    if (!/^\S+(\s+\S+)+$/.test(v)) return 'Informe nome e sobrenome.';
    return '';
  }

  function email(valor) {
    var v = String(valor || '').trim();
    if (!v) return 'Informe seu e-mail.';
    if (!EMAIL.test(v)) return 'Digite um e-mail válido (ex.: nome@email.com).';
    return '';
  }

  function senhaForte(valor) {
    if (!valor) return 'Crie uma senha.';
    var ok = Object.keys(REGRAS_SENHA).every(function (r) { return REGRAS_SENHA[r](valor); });
    return ok ? '' : 'A senha ainda não atende a todas as regras.';
  }

  
  function ligarChecklist(input, lista) {
    if (!input || !lista) return;
    var atualizar = function () {
      Object.keys(REGRAS_SENHA).forEach(function (r) {
        var li = lista.querySelector('[data-regra="' + r + '"]');
        if (li) li.classList.toggle('ok', REGRAS_SENHA[r](input.value));
      });
    };
    input.addEventListener('input', atualizar);
    atualizar();
  }

  
  function ligarFormulario(form, campos, textoEnviando) {
    Object.keys(campos).forEach(function (chave) {
      var input = campos[chave][0], regra = campos[chave][1];
      if (!input) return;
      var validar = function () { return erroCampo(input, regra(input.value)); };
      campos[chave].push(validar);
      input.addEventListener('blur', function () { if (input.value) validar(); });
      input.addEventListener('input', function () { if (input.getAttribute('aria-invalid') === 'true') validar(); });
    });
    form.addEventListener('submit', function (e) {
      var ok = true;
      Object.keys(campos).forEach(function (chave) {
        if (campos[chave][0] && !campos[chave][2]()) ok = false;
      });
      if (!ok) {
        e.preventDefault();
        var primeiro = form.querySelector('[aria-invalid="true"]');
        if (primeiro) primeiro.focus();
        return;
      }
      travarEnvio(form, textoEnviando);
    });
  }

 
  function travarEnvio(form, texto) {
    var botao = form.querySelector('button[type="submit"]');
    if (!botao) return;
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    var alvo = botao.querySelector('span');
    if (alvo && texto) alvo.textContent = texto;
  }

  window.CMValidacao = {
    EMAIL: EMAIL,
    REGRAS_SENHA: REGRAS_SENHA,
    erroCampo: erroCampo,
    nomeCompleto: nomeCompleto,
    email: email,
    senhaForte: senhaForte,
    ligarChecklist: ligarChecklist,
    ligarFormulario: ligarFormulario,
    travarEnvio: travarEnvio
  };
})();
