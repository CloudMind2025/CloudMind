(function () {
  'use strict';

  var input = document.querySelector('.barra-pesquisa input[type="search"]');
  if (!input) return;

  var termos = [];
  try { termos = JSON.parse(input.getAttribute('data-sugestoes') || '[]'); } catch (_) {}
  if (!termos.length) return;

  var form = input.form;
  var lista = document.createElement('ul');
  lista.id = 'sugestoes-busca';
  lista.className = 'search-suggestions';
  lista.setAttribute('role', 'listbox');
  lista.setAttribute('aria-label', 'Sugestões de busca');
  form.appendChild(lista);

  var atual = -1;
  var normalizar = function (s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  function fechar() {
    lista.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    atual = -1;
  }

  function escolher(termo) {
    input.value = termo;
    fechar();
    form.submit();
  }

  function atualizar() {
    var valor = normalizar(input.value.trim());
    lista.textContent = '';
    atual = -1;
    if (valor.length < 2) return fechar();

    var encontrados = termos.filter(function (t) { return normalizar(t).indexOf(valor) !== -1; }).slice(0, 8);
    encontrados.forEach(function (termo, i) {
      var li = document.createElement('li');
      li.id = 'sugestao-' + i;
      li.setAttribute('role', 'option');
      li.textContent = termo;
      li.addEventListener('mousedown', function (e) { e.preventDefault(); escolher(termo); });
      lista.appendChild(li);
    });

    var tem = encontrados.length > 0;
    lista.style.display = tem ? 'block' : 'none';
    input.setAttribute('aria-expanded', String(tem));
  }

  function destacar(itens) {
    itens.forEach(function (li, i) { li.setAttribute('aria-selected', String(i === atual)); });
    if (atual > -1) {
      input.setAttribute('aria-activedescendant', itens[atual].id);
      itens[atual].scrollIntoView({ block: 'nearest' });
    }
  }

  input.addEventListener('input', atualizar);
  input.addEventListener('keydown', function (e) {
    var itens = Array.prototype.slice.call(lista.querySelectorAll('li'));
    if (e.key === 'Escape') return fechar();
    if (!itens.length || lista.style.display === 'none') return;
    if (e.key === 'ArrowDown') { atual = (atual + 1) % itens.length; destacar(itens); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { atual = (atual - 1 + itens.length) % itens.length; destacar(itens); e.preventDefault(); }
    else if (e.key === 'Enter' && atual > -1) { e.preventDefault(); escolher(itens[atual].textContent); }
  });
  input.addEventListener('blur', function () { setTimeout(fechar, 120); });
})();
