(function () {
  'use strict';

  function limpo(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function temOpcao(opcoes, v) { return Object.prototype.hasOwnProperty.call(opcoes, v); }

  function validarCampo(c, entrada) {
    var vazio = Array.isArray(entrada) ? !entrada.length : limpo(entrada) === '';
    if (vazio) return c.obrigatorio ? { erro: 'Preencha o campo "' + c.rotulo + '".' } : { valor: null };
    var t = Array.isArray(entrada) ? '' : limpo(entrada);
    if (c.tipo === 'inteiro') {
      if (!/^\d+$/.test(t)) return { erro: c.rotulo + ': use um número inteiro.' };
      var n = Number(t);
      if (n < c.min || n > c.max) return { erro: c.rotulo + ': use um número de ' + c.min + ' a ' + c.max.toLocaleString('pt-BR') + '.' };
      return { valor: n };
    }
    if (c.tipo === 'duracao') {
      var m = /^(\d{1,4}):([0-5]\d)$/.exec(t);
      if (!m) return { erro: c.rotulo + ': use horas:minutos, ex.: 5:32.' };
      var minutos = Number(m[1]) * 60 + Number(m[2]);
      if (minutos < 1) return { erro: c.rotulo + ': informe uma duração maior que zero.' };
      if (minutos > c.max) return { erro: c.rotulo + ': o máximo é ' + (c.max / 60) + ' horas.' };
      return { valor: minutos };
    }
    if (c.tipo === 'select') return temOpcao(c.opcoes, t) ? { valor: t } : { erro: c.rotulo + ': escolha uma opção da lista.' };
    if (c.tipo === 'multi') return { valor: entrada.slice() };
    if (t.length < c.min || t.length > c.max) return { erro: c.rotulo + ': use de ' + c.min + ' a ' + c.max + ' caracteres.' };
    return { valor: t };
  }

  function formatar(c, valor) {
    if (valor == null || valor === '' || (Array.isArray(valor) && !valor.length)) return null;
    if (c.tipo === 'inteiro') return Number(valor).toLocaleString('pt-BR');
    if (c.tipo === 'duracao') {
      var h = Math.floor(valor / 60), mi = valor % 60;
      return !h ? mi + 'min' : mi ? h + 'h ' + String(mi).padStart(2, '0') + 'min' : h + 'h';
    }
    if (c.tipo === 'select') return c.opcoes[valor] || null;
    if (c.tipo === 'multi') return valor.map(function (v) { return c.opcoes[v]; }).filter(Boolean).join(', ');
    return String(valor);
  }

  function iniciar(raiz) {
    var config = JSON.parse(raiz.getAttribute('data-config') || '{"tipos":{}}');
    var categoria = raiz.querySelector('[data-ct-categoria]');
    var tipoAtual = '';
    var grupoAtivo = raiz.querySelector('[data-ct-grupo]:not([hidden])');
    if (grupoAtivo) tipoAtual = grupoAtivo.getAttribute('data-ct-grupo');

    function grupo(tipo) { return raiz.querySelector('[data-ct-grupo="' + tipo + '"]'); }
    function cfgTipo(tipo) { return config.tipos[tipo] || null; }
    function caixa(chave) { return grupo(tipoAtual) && grupo(tipoAtual).querySelector('[data-ct-campo="' + chave + '"]'); }

    function lerCampo(tipo, c) {
      var bloco = grupo(tipo) && grupo(tipo).querySelector('[data-ct-campo="' + c.chave + '"]');
      if (!bloco) return c.tipo === 'multi' ? [] : '';
      if (c.tipo === 'multi') {
        return Array.prototype.filter.call(bloco.querySelectorAll('input[type="checkbox"]'), function (i) { return i.checked; })
          .map(function (i) { return i.value; });
      }
      return bloco.querySelector('input, select').value;
    }

    function escreverCampo(tipo, c, valor) {
      var bloco = grupo(tipo) && grupo(tipo).querySelector('[data-ct-campo="' + c.chave + '"]');
      if (!bloco) return;
      if (c.tipo === 'multi') {
        var lista = Array.isArray(valor) ? valor.map(String) : valor ? [String(valor)] : [];
        bloco.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = lista.indexOf(i.value) !== -1; });
        return;
      }
      var el = bloco.querySelector('input, select');
      if (c.tipo === 'duracao' && /^\d+$/.test(String(valor))) {
        var n = Number(valor);
        valor = Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
      }
      el.value = valor == null ? '' : String(valor);
    }

    function mostrarErro(chave, msg) {
      var alvo = chave === 'categoria' ? raiz.querySelector('[data-ct-erro="categoria"]') : caixa(chave) && caixa(chave).querySelector('[data-ct-erro]');
      if (!alvo) return;
      alvo.textContent = msg || '';
      alvo.hidden = !msg;
      var campo = chave === 'categoria' ? categoria : caixa(chave) && caixa(chave).querySelector('input:not([type="checkbox"]), select, .ct-chips');
      if (campo) {
        if (msg) campo.setAttribute('aria-invalid', 'true');
        else campo.removeAttribute('aria-invalid');
      }
    }

    function montarCategorias(tipo) {
      var anterior = categoria.value;
      var lista = cfgTipo(tipo) ? cfgTipo(tipo).categorias : [];
      categoria.textContent = '';
      var vazio = document.createElement('option');
      vazio.value = '';
      vazio.textContent = tipo ? 'Selecione o assunto' : 'Escolha o tipo primeiro';
      categoria.appendChild(vazio);
      lista.forEach(function (cat) {
        var o = document.createElement('option');
        o.value = String(cat.id);
        o.textContent = cat.nome;
        categoria.appendChild(o);
      });
      categoria.disabled = !tipo;
      categoria.value = lista.some(function (cat) { return String(cat.id) === anterior; }) ? anterior : '';
    }

    function temValores(tipo) {
      var cfg = cfgTipo(tipo);
      if (!cfg) return false;
      return cfg.campos.some(function (c) {
        var v = lerCampo(tipo, c);
        return Array.isArray(v) ? v.length > 0 : limpo(v) !== '';
      });
    }

    function preenchidos(tipo) {
      var cfg = cfgTipo(tipo);
      return !cfg ? [] : cfg.campos.filter(function (c) {
        var v = lerCampo(tipo, c);
        return Array.isArray(v) ? v.length > 0 : limpo(v) !== '';
      }).map(function (c) { return c.rotulo; });
    }

    function limpar(tipo) {
      var cfg = cfgTipo(tipo);
      if (!cfg) return;
      cfg.campos.forEach(function (c) { escreverCampo(tipo, c, c.tipo === 'multi' ? [] : ''); });
    }

    function limparErros() {
      raiz.querySelectorAll('[data-ct-erro]').forEach(function (e) { e.textContent = ''; e.hidden = true; });
      raiz.querySelectorAll('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
    }

    function definirTipo(tipo) {
      raiz.querySelectorAll('[data-ct-grupo]').forEach(function (g) {
        var ativo = g.getAttribute('data-ct-grupo') === tipo;
        g.hidden = !ativo;
        g.disabled = !ativo;
      });
      tipoAtual = cfgTipo(tipo) ? tipo : '';
      montarCategorias(tipoAtual);
      limparErros();
    }

    function trocarTipo(novo) {
      if (novo === tipoAtual) return true;
      var antigo = tipoAtual;
      var perdidos = antigo ? preenchidos(antigo) : [];
      var catAtual = categoria.value;
      var catSome = catAtual && !(cfgTipo(novo) || { categorias: [] }).categorias.some(function (c) { return String(c.id) === catAtual; });
      if (perdidos.length || catSome) {
        var partes = [];
        if (perdidos.length) partes.push('as informações de ' + cfgTipo(antigo).rotulo + ' já preenchidas (' + perdidos.join(', ') + ') serão descartadas');
        if (catSome) partes.push('a categoria escolhida não existe para ' + cfgTipo(novo).rotulo + ' e será limpa');
        var msg = 'Trocar o tipo para ' + cfgTipo(novo).rotulo + '?\n\n' +
          partes.join(', e ').replace(/^./, function (l) { return l.toUpperCase(); }) + '.';
        if (!window.confirm(msg)) return false;
      }
      if (antigo) limpar(antigo);
      definirTipo(novo);
      return true;
    }

    function validar(mostrar) {
      var erros = [];
      if (mostrar !== false) limparErros();
      if (!tipoAtual) return erros;
      if (!categoria.value) erros.push({ chave: 'categoria', msg: 'Selecione a categoria (o assunto do produto).', el: categoria });
      cfgTipo(tipoAtual).campos.forEach(function (c) {
        var r = validarCampo(c, lerCampo(tipoAtual, c));
        if (r.erro) erros.push({ chave: c.chave, msg: r.erro, el: caixa(c.chave) && caixa(c.chave).querySelector('input, select') });
      });
      if (mostrar !== false) erros.forEach(function (e) { mostrarErro(e.chave, e.msg); });
      return erros;
    }

    function valores() {
      var detalhes = {};
      if (tipoAtual) cfgTipo(tipoAtual).campos.forEach(function (c) { detalhes[c.chave] = lerCampo(tipoAtual, c); });
      return { id_categoria: categoria.value, detalhes: detalhes };
    }

    function preencher(dados) {
      dados = dados || {};
      if (tipoAtual) {
        cfgTipo(tipoAtual).campos.forEach(function (c) {
          var d = dados.detalhes || {};
          escreverCampo(tipoAtual, c, Object.prototype.hasOwnProperty.call(d, c.chave) ? d[c.chave] : (c.tipo === 'multi' ? [] : ''));
        });
      }
      var id = dados.id_categoria == null ? '' : String(dados.id_categoria);
      categoria.value = Array.prototype.some.call(categoria.options, function (o) { return o.value === id; }) ? id : '';
      limparErros();
    }

    function resumo() {
      var linhas = [];
      var opt = categoria.options[categoria.selectedIndex];
      linhas.push({ chave: 'categoria', rotulo: 'Categoria', valor: categoria.value && opt ? opt.textContent : null });
      if (tipoAtual) {
        cfgTipo(tipoAtual).campos.forEach(function (c) {
          var r = validarCampo(c, lerCampo(tipoAtual, c));
          linhas.push({ chave: c.chave, rotulo: c.rotuloCurto || c.rotulo, valor: r.erro ? null : formatar(c, r.valor) });
        });
      }
      return linhas;
    }

    raiz.addEventListener('change', revalidar);
    raiz.addEventListener('input', revalidar);
    function revalidar(e) {
      if (e.target === categoria) { if (categoria.value) mostrarErro('categoria', ''); return; }
      var bloco = e.target.closest('[data-ct-campo]');
      if (!bloco || !tipoAtual) return;
      var chave = bloco.getAttribute('data-ct-campo');
      var erroVisivel = bloco.querySelector('[data-ct-erro]:not([hidden])');
      if (!erroVisivel && e.type === 'input') return;
      var c = cfgTipo(tipoAtual).campos.filter(function (x) { return x.chave === chave; })[0];
      var r = validarCampo(c, lerCampo(tipoAtual, c));
      if (erroVisivel || e.type === 'change') mostrarErro(chave, r.erro || '');
    }

    return {
      get tipo() { return tipoAtual; },
      config: config,
      definirTipo: definirTipo,
      trocarTipo: trocarTipo,
      temValores: temValores,
      limpar: limpar,
      limparErros: limparErros,
      validar: validar,
      valores: valores,
      preencher: preencher,
      resumo: resumo
    };
  }

  window.CamposTipo = { iniciar: iniciar };
})();
