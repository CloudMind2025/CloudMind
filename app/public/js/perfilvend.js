(function () {
  'use strict';

  var reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function normalizar(txt) {
    return String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /* ---------- Compartilhar: menu nativo quando existe; senão, copia o link ---------- */
  (function () {
    var botao = document.querySelector('[data-compartilhar]');
    var status = document.querySelector('[data-compartilhar-status]');
    if (!botao) return;
    var url = botao.getAttribute('data-url');
    var titulo = botao.getAttribute('data-titulo');
    var podeCompartilhar = typeof navigator.share === 'function';
    var podeCopiar = !!(navigator.clipboard && window.isSecureContext);
    if (!podeCompartilhar && !podeCopiar && !document.queryCommandSupported('copy')) return;
    botao.hidden = false;

    function avisar(texto) {
      status.textContent = texto;
      clearTimeout(avisar.t);
      avisar.t = setTimeout(function () { status.textContent = ''; }, 3500);
    }

    function copiarAntigo() {
      var campo = document.createElement('textarea');
      campo.value = url;
      campo.setAttribute('readonly', '');
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      campo.remove();
      return ok;
    }

    botao.addEventListener('click', function () {
      if (podeCompartilhar) {
        navigator.share({ title: titulo, url: url }).catch(function () {});
        return;
      }
      var copia = podeCopiar ? navigator.clipboard.writeText(url) : Promise.reject();
      copia.then(function () { avisar('Link copiado!'); }, function () {
        avisar(copiarAntigo() ? 'Link copiado!' : 'Não foi possível copiar o link.');
      });
    });
  })();

  /* ---------- Cupons: copiar o código sem recarregar a página ---------- */
  (function () {
    var botoes = document.querySelectorAll('[data-copiar-cupom]');
    if (!botoes.length) return;
    var status = document.querySelector('[data-cupom-status]');

    function copiar(texto) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
      return new Promise(function (ok, falha) {
        var campo = document.createElement('textarea');
        campo.value = texto;
        campo.setAttribute('readonly', '');
        campo.style.position = 'fixed';
        campo.style.opacity = '0';
        document.body.appendChild(campo);
        campo.select();
        var copiou = false;
        try { copiou = document.execCommand('copy'); } catch (_) { copiou = false; }
        campo.remove();
        copiou ? ok() : falha();
      });
    }

    botoes.forEach(function (botao) {
      var rotulo = botao.querySelector('span');
      var original = rotulo.textContent;
      botao.addEventListener('click', function () {
        var codigo = botao.getAttribute('data-copiar-cupom');
        copiar(codigo).then(function () {
          rotulo.textContent = '✓ Cupom copiado!';
          botao.classList.add('is-copiado');
          if (status) status.textContent = 'Cupom ' + codigo + ' copiado. Cole no carrinho para aplicar o desconto.';
        }, function () {
          rotulo.textContent = 'Copie: ' + codigo;
        });
        clearTimeout(botao._timer);
        botao._timer = setTimeout(function () {
          rotulo.textContent = original;
          botao.classList.remove('is-copiado');
        }, 2500);
      });
    });
  })();

  /* ---------- Imagens: brilho enquanto carrega e ícone do tipo se falhar ---------- */
  document.querySelectorAll('.loja .produto-card-midia').forEach(function (midia) {
    var img = midia.querySelector('img');
    if (!img) { midia.classList.add('is-pronta'); return; }
    function pronta() { midia.classList.add('is-pronta'); }
    function falhou() {
      var card = midia.closest('.produto-card');
      var icone = card && card.querySelector('.produto-card-tipo i');
      var fallback = document.createElement('span');
      fallback.className = 'sem-imagem';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.innerHTML = '<i class="' + (icone ? icone.className : 'fa-solid fa-box-open') + '"></i>';
      img.replaceWith(fallback);
      pronta();
    }
    if (img.complete) { img.naturalWidth ? pronta() : falhou(); return; }
    img.addEventListener('load', pronta, { once: true });
    img.addEventListener('error', falhou, { once: true });
  });

  (function () {
    var capa = document.querySelector('[data-capa]');
    if (!capa) return;
    function remover() { capa.remove(); }
    if (capa.complete && !capa.naturalWidth) remover();
    else capa.addEventListener('error', remover, { once: true });
  })();

  (function () {
    var avatar = document.querySelector('[data-avatar] img');
    if (!avatar) return;
    function remover() { avatar.remove(); }
    if (avatar.complete && !avatar.naturalWidth) remover();
    else avatar.addEventListener('error', remover, { once: true });
  })();

  /* ---------- Catálogo: busca, filtro por tipo, ordenação e "Mostrar mais" ---------- */
  var grade = document.querySelector('[data-grade-loja]');
  var aplicarFiltroTipo = null;
  if (grade) (function () {
    var itens = Array.prototype.slice.call(grade.querySelectorAll('[data-produto]'));
    var ferramentas = document.querySelector('[data-ferramentas]');
    var busca = document.querySelector('[data-busca-loja]');
    var ordem = document.querySelector('[data-ordem-loja]');
    var chips = Array.prototype.slice.call(document.querySelectorAll('[data-filtro-tipo]'));
    var resultado = document.querySelector('[data-resultado]');
    var vazio = document.querySelector('[data-vazio-filtro]');
    var mais = document.querySelector('[data-mais]');
    var botaoMais = document.querySelector('[data-mostrar-mais]');
    var limpar = document.querySelector('[data-limpar-filtros]');
    var PASSO = Number(grade.getAttribute('data-primeiros')) || 12;

    var estado = { termo: '', tipo: '', ordem: 'recentes', limite: PASSO };
    if (ferramentas) ferramentas.hidden = false;

    function num(li, attr) { return Number(li.getAttribute(attr)) || 0; }

    var comparadores = {
      recentes:      function (a, b) { return num(a, 'data-ordem') - num(b, 'data-ordem'); },
      vendidos:      function (a, b) { return num(b, 'data-vendas') - num(a, 'data-vendas') || comparadores.recentes(a, b); },
      avaliados:     function (a, b) { return num(b, 'data-nota') - num(a, 'data-nota') || num(b, 'data-qtd-notas') - num(a, 'data-qtd-notas') || comparadores.recentes(a, b); },
      'menor-preco': function (a, b) { return num(a, 'data-preco') - num(b, 'data-preco') || comparadores.recentes(a, b); },
      'maior-preco': function (a, b) { return num(b, 'data-preco') - num(a, 'data-preco') || comparadores.recentes(a, b); }
    };

    function render(animar) {
      var termo = normalizar(estado.termo);
      var visiveisAntes = itens.filter(function (li) { return !li.hidden; });
      var filtrados = itens.filter(function (li) {
        if (estado.tipo && li.getAttribute('data-tipo') !== estado.tipo) return false;
        return !termo || li.getAttribute('data-busca').indexOf(termo) !== -1;
      });
      var ordenados = itens.slice().sort(comparadores[estado.ordem] || comparadores.recentes);
      var fragmento = document.createDocumentFragment();
      ordenados.forEach(function (li) { fragmento.appendChild(li); });
      grade.appendChild(fragmento);

      var mostrados = 0;
      ordenados.forEach(function (li) {
        var entra = filtrados.indexOf(li) !== -1 && mostrados < estado.limite;
        if (entra) mostrados++;
        li.hidden = !entra;
        li.classList.remove('is-entrando');
        if (entra && animar && !reduzirMovimento && visiveisAntes.indexOf(li) === -1) {
          void li.offsetWidth;
          li.classList.add('is-entrando');
        }
      });

      grade.hidden = filtrados.length === 0;
      if (vazio) vazio.hidden = filtrados.length !== 0;
      if (mais) mais.hidden = filtrados.length <= mostrados;

      if (resultado) {
        var filtrando = !!(termo || estado.tipo);
        if (!filtrados.length) resultado.textContent = '';
        else if (filtrando || mostrados < filtrados.length) {
          resultado.textContent = 'Mostrando ' + mostrados + ' de ' + filtrados.length +
            (filtrados.length === 1 ? ' produto' : ' produtos') + (filtrando ? ' encontrados' : '') + '.';
        } else resultado.textContent = '';
      }
    }

    function definirTipo(tipo) {
      estado.tipo = tipo;
      estado.limite = PASSO;
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-filtro-tipo') === tipo)); });
      render(true);
    }
    aplicarFiltroTipo = chips.length ? definirTipo : null;

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () { definirTipo(chip.getAttribute('data-filtro-tipo')); });
    });

    if (busca) {
      var espera = null;
      busca.addEventListener('input', function () {
        clearTimeout(espera);
        espera = setTimeout(function () {
          estado.termo = busca.value;
          estado.limite = PASSO;
          render(true);
        }, 150);
      });
    }

    if (ordem) {
      ordem.addEventListener('change', function () {
        estado.ordem = ordem.value;
        render(true);
      });
    }

    if (botaoMais) {
      botaoMais.addEventListener('click', function () {
        var primeiroNovo = null;
        var antes = itens.filter(function (li) { return !li.hidden; }).length;
        estado.limite += PASSO;
        render(true);
        var visiveis = Array.prototype.filter.call(grade.children, function (li) { return !li.hidden; });
        primeiroNovo = visiveis[antes];
        var link = primeiroNovo && primeiroNovo.querySelector('h3 a');
        if (link) link.focus({ preventScroll: true });
      });
    }

    if (limpar) {
      limpar.addEventListener('click', function () {
        if (busca) busca.value = '';
        estado.termo = '';
        definirTipo('');
        if (busca) busca.focus();
      });
    }

    render(false);
  })();

  /* ---------- "O que ... vende": filtra o catálogo pelo tipo escolhido ---------- */
  document.querySelectorAll('[data-filtrar-tipo]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (aplicarFiltroTipo) aplicarFiltroTipo(link.getAttribute('data-filtrar-tipo'));
    });
  });

  /* ---------- Navegação interna: marca a seção visível ---------- */
  (function () {
    var nav = document.querySelector('[data-loja-nav]');
    if (!nav || !('IntersectionObserver' in window)) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    var secoes = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    var visiveis = new Map();

    function marcar() {
      var atual = null;
      secoes.forEach(function (s, i) { if (s && visiveis.get(s)) atual = atual === null ? i : atual; });
      links.forEach(function (a, i) {
        if (i === atual) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      var lista = nav.querySelector('ul');
      if (atual !== null && lista.scrollWidth > lista.clientWidth) {
        lista.scrollTo({ left: links[atual].parentElement.offsetLeft - 16, behavior: reduzirMovimento ? 'auto' : 'smooth' });
      }
    }

    var alturaHeader = function () { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cm-header-h')) || 82; };
    function checarFixa() { nav.classList.toggle('is-fixa', nav.getBoundingClientRect().top <= alturaHeader() + 1); }
    window.addEventListener('scroll', checarFixa, { passive: true });
    checarFixa();

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) { visiveis.set(e.target, e.isIntersecting); });
      marcar();
    }, { rootMargin: '-45% 0px -50% 0px' });
    secoes.forEach(function (s) { if (s) observador.observe(s); });
  })();
})();
