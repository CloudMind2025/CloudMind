(function () {
  'use strict';

  // ---- Gráfico ----
  var canvas = document.getElementById('salesChart');
  if (canvas && window.Chart) {
    var rotulos = JSON.parse(canvas.getAttribute('data-rotulos') || '[]');
    var valores = JSON.parse(canvas.getAttribute('data-valores') || '[]');
    var reais = function (v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); };
    new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: rotulos,
        datasets: [{
          label: 'Vendas (R$)',
          data: valores,
          borderColor: '#c69b3c',
          backgroundColor: 'rgba(198,155,60,0.2)',
          pointBackgroundColor: '#f3d27a',
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return reais(c.parsed.y); } } }
        },
        scales: {
          x: { ticks: { color: '#cfd8e1' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { beginAtZero: true, ticks: { color: '#cfd8e1', callback: reais }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  // ---- Busca na tabela ----
  var busca = document.querySelector('[data-filtro-produtos]');
  var vazio = document.querySelector('[data-filtro-vazio]');
  if (busca) {
    var normalizar = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
    busca.addEventListener('input', function () {
      var termo = normalizar(busca.value.trim());
      var visiveis = 0;
      document.querySelectorAll('tr[data-titulo]').forEach(function (tr) {
        var mostra = !termo || normalizar(tr.getAttribute('data-titulo')).indexOf(termo) !== -1;
        tr.classList.toggle('is-oculto', !mostra);
        if (mostra) visiveis++;
      });
      if (vazio) vazio.hidden = visiveis > 0;
    });
  }

  // ---- Envio/troca do arquivo do produto ----
  document.querySelectorAll('.vend-arquivo-input').forEach(function (input) {
    input.addEventListener('change', function () {
      var arquivo = input.files[0];
      if (!arquivo) return;
      var form = input.form;
      var titulo = form.getAttribute('data-titulo');
      var formatos = (form.getAttribute('data-formatos') || '').split(',').filter(Boolean);
      var maxMb = Number(form.getAttribute('data-max-mb')) || 100;
      var ext = (arquivo.name.split('.').pop() || '').toLowerCase();

      if (formatos.length && formatos.indexOf(ext) === -1) {
        window.alert('Formato não aceito para "' + titulo + '". Use: ' + formatos.join(', ').toUpperCase() + '.');
        input.value = '';
        return;
      }
      if (arquivo.size > maxMb * 1024 * 1024) {
        window.alert('O arquivo passa de ' + maxMb + 'MB. Escolha um arquivo menor.');
        input.value = '';
        return;
      }
      var mb = (arquivo.size / (1024 * 1024)).toFixed(1).replace('.', ',');
      var pergunta = form.getAttribute('data-tem-arquivo') === 'sim'
        ? 'Trocar o arquivo de "' + titulo + '" por "' + arquivo.name + '" (' + mb + 'MB)? Os compradores passarão a baixar o novo arquivo.'
        : 'Enviar "' + arquivo.name + '" (' + mb + 'MB) como arquivo de "' + titulo + '"?';
      if (!window.confirm(pergunta)) { input.value = ''; return; }

      var label = input.closest('label');
      label.classList.add('is-enviando');
      label.setAttribute('aria-busy', 'true');
      label.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
      label.querySelector('span').textContent = 'Enviando…';
      form.submit();
    });
  });

  // ---- Janela "Editar produto" ----
  var dialog = document.getElementById('editar-produto');
  var dadosEl = document.getElementById('vend-produtos-dados');
  if (!dialog || !dadosEl) return;

  var dados = JSON.parse(dadosEl.textContent || '{}');
  var porId = {};
  (dados.produtos || []).forEach(function (p) { porId[p.id] = p; });

  var form = dialog.querySelector('[data-ve-form]');
  var formatosPorTipo = JSON.parse(form.getAttribute('data-formatos') || '{}');
  var maxImagemMb = Number(form.getAttribute('data-max-mb')) || 3;
  var CAMPOS = ['tipo_produto', 'titulo', 'sku', 'preco', 'resumo', 'descricao'];
  var PRIMEIRO_CAMPO = { info: 've-tipo', tipo: 've-categoria', conteudo: 've-resumo', midia: 've-imagem' };
  var camposTipo = window.CamposTipo.iniciar(form.querySelector('[data-campos-tipo]'));
  var atual = null;
  var enviando = false;

  var campo = function (nome) { return form.querySelector('[data-ve-campo="' + nome + '"]'); };
  var el = function (nome) { return dialog.querySelector('[data-ve="' + nome + '"]'); };
  var rv = function (nome) { return dialog.querySelector('[data-rv="' + nome + '"]'); };
  var limpo = function (v) { return String(v == null ? '' : v).trim(); };

  function lerPreco(valor) {
    var v = limpo(valor).replace(/R\$|\s/g, '');
    if (v.indexOf(',') !== -1) v = v.replace(/\./g, '').replace(',', '.');
    else if (!/^\d+\.\d{1,2}$/.test(v)) v = v.replace(/\./g, '');
    return /^\d+(\.\d+)?$/.test(v) ? parseFloat(v) : NaN;
  }

  function valoresForm() {
    var v = {};
    CAMPOS.forEach(function (n) { v[n] = limpo(campo(n).value); });
    var t = camposTipo.valores();
    v.id_categoria = t.id_categoria;
    v.detalhes = JSON.stringify(t.detalhes);
    return v;
  }

  function mudou(nome, v) {
    if (nome === 'preco') return lerPreco(v[nome]) !== lerPreco(atual.preco);
    if (nome === 'detalhes') return v.detalhes !== JSON.stringify(atual.detalhes || {});
    return limpo(v[nome]) !== limpo(atual[nome]);
  }

  function alterado() {
    var v = valoresForm();
    return CAMPOS.concat('id_categoria', 'detalhes').some(function (n) { return mudou(n, v); }) || campo('imagem').files.length > 0;
  }

  function cabecalho() {
    el('titulo-cabecalho').textContent = atual.titulo;
    var capa = el('capa');
    if (atual.imagem) { capa.src = atual.imagem; capa.hidden = false; } else { capa.hidden = true; }
    el('meta').textContent = atual.status + ' · ' + atual.vendas + (atual.vendas === 1 ? ' venda' : ' vendas');
  }

  function atualizarFormatos() {
    var tipo = campo('tipo_produto').value;
    var lista = formatosPorTipo[tipo] || [];
    var texto = 'Formatos de arquivo aceitos para ' + (dados.tipos[tipo] || tipo) + ': ' + lista.join(', ').toUpperCase() + '.';
    var aviso = el('formatos');
    var incompativel = atual && atual.formato && tipo !== atual.tipo_produto && lista.indexOf(atual.formato.toLowerCase()) === -1;
    if (incompativel) texto += ' O arquivo atual (' + atual.formato + ') não é aceito: troque o arquivo antes de mudar o tipo.';
    aviso.textContent = texto;
    aviso.classList.toggle('is-alerta', !!incompativel);
  }

  function contador() {
    el('contador').textContent = '(' + campo('descricao').value.length + '/1000)';
  }

  function renderRevisao() {
    var v = valoresForm();
    var mostrar = function (nome, texto) {
      var dd = rv(nome);
      dd.textContent = texto;
      dd.classList.toggle('is-alterado', mudou(nome, v));
    };
    mostrar('tipo_produto', dados.tipos[v.tipo_produto] || v.tipo_produto);
    mostrar('titulo', v.titulo || '—');
    var linhasTipo = camposTipo.resumo();
    mostrar('id_categoria', linhasTipo[0].valor || 'Escolha uma categoria');

    var dl = rv('detalhes');
    dl.textContent = '';
    var preenchidas = linhasTipo.slice(1).filter(function (l) { return l.valor; });
    preenchidas.forEach(function (l) {
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = l.rotulo;
      dd.textContent = l.valor;
      dl.append(dt, dd);
    });
    if (!preenchidas.length) {
      var dd = document.createElement('dd');
      dd.className = 've-vazio';
      dd.textContent = 'Nenhuma informação do tipo preenchida ainda.';
      dl.appendChild(dd);
    }
    dl.classList.toggle('is-alterado', mudou('detalhes', v));
    mostrar('sku', v.sku || 'Não informado');
    mostrar('preco', isNaN(lerPreco(v.preco)) ? v.preco || '—' : 'R$ ' + lerPreco(v.preco).toFixed(2).replace('.', ','));
    mostrar('resumo', v.resumo || 'Não informado');
    mostrar('descricao', v.descricao || '—');

    var nova = campo('imagem').files[0];
    var midia = rv('midia');
    midia.textContent = (nova
      ? 'Nova imagem principal: ' + nova.name + ' (enviada ao salvar).'
      : atual.imagem ? 'Imagem principal atual.' : 'Sem imagem principal.')
      + ' ' + (atual.adicionais === 1 ? '1 imagem adicional' : atual.adicionais + ' imagens adicionais') + ' na galeria.';
    midia.classList.toggle('is-alterado', !!nova);

    rv('arquivo').textContent = atual.formato
      ? 'Arquivo enviado: ' + atual.formato + '. Para trocá-lo, use o botão "Trocar" na tabela.'
      : 'Nenhum arquivo enviado ainda. Use o botão "Enviar" na tabela.';

    var sujo = alterado();
    el('aviso-alterado').hidden = !sujo;
    el('salvar-revisao').hidden = !sujo;
  }

  function modo(m) {
    dialog.querySelectorAll('[data-ve-modo]').forEach(function (bloco) {
      bloco.hidden = bloco.getAttribute('data-ve-modo') !== m;
    });
    dialog.scrollTop = 0;
    if (m === 'revisao') renderRevisao();
  }

  function validar() {
    var v = valoresForm();
    var erros = [];
    var erro = function (nome, msg) { erros.push({ campo: nome, msg: msg }); };
    if (v.titulo.length < 5 || v.titulo.length > 100) erro('titulo', 'O título deve ter entre 5 e 100 caracteres.');
    camposTipo.validar().forEach(function (e) { erros.push({ campo: null, el: e.el, msg: e.msg }); });
    var preco = lerPreco(v.preco);
    if (isNaN(preco) || preco < 0.01 || preco > 999999.99) erro('preco', 'Informe um preço válido, de 0,01 a 999.999,99 (ex.: 39,90 ou 1.500,00).');
    if (v.sku && !/^[a-zA-Z0-9]{3,20}$/.test(v.sku)) erro('sku', 'O SKU deve ter de 3 a 20 letras ou números (sem símbolos).');
    if (v.resumo && (v.resumo.length < 10 || v.resumo.length > 150)) erro('resumo', 'O resumo deve ter entre 10 e 150 caracteres.');
    if (v.descricao.length < 20 || v.descricao.length > 1000) erro('descricao', 'A descrição deve ter entre 20 e 1000 caracteres.');
    var lista = formatosPorTipo[v.tipo_produto] || [];
    if (atual.formato && v.tipo_produto !== atual.tipo_produto && lista.indexOf(atual.formato.toLowerCase()) === -1) {
      erro('tipo_produto', 'O arquivo atual (' + atual.formato + ') não é aceito para ' + (dados.tipos[v.tipo_produto] || v.tipo_produto) + '. Troque o arquivo primeiro ou mantenha o tipo.');
    }
    var img = campo('imagem').files[0];
    if (img) {
      if (!/\.(jpe?g|png)$/i.test(img.name)) erro('imagem', 'A nova capa deve ser JPG ou PNG.');
      else if (img.size > maxImagemMb * 1024 * 1024) erro('imagem', 'A imagem passa de ' + maxImagemMb + 'MB. Escolha uma menor.');
    }
    return erros;
  }

  function mostrarErros(erros) {
    var caixa = dialog.querySelector('[data-ve-erros]');
    var ul = caixa.querySelector('ul');
    ul.textContent = '';
    CAMPOS.concat('imagem').forEach(function (n) { campo(n).removeAttribute('aria-invalid'); });
    if (!erros.length) camposTipo.limparErros();
    erros.forEach(function (e) {
      var li = document.createElement('li');
      li.textContent = e.msg;
      ul.appendChild(li);
      if (e.campo) campo(e.campo).setAttribute('aria-invalid', 'true');
    });
    caixa.hidden = !erros.length;
    if (erros.length && erros[0].campo) campo(erros[0].campo).focus();
    else if (erros.length && erros[0].el) erros[0].el.focus();
  }

  function preencher(p) {
    atual = p;
    campo('id').value = p.id;
    CAMPOS.forEach(function (n) { campo(n).value = p[n] == null ? '' : String(p[n]); });
    camposTipo.definirTipo(p.tipo_produto);
    camposTipo.preencher({ id_categoria: p.id_categoria, detalhes: p.detalhes });
    el('aviso-incompleto').hidden = !p.incompleto;
    campo('imagem').value = '';
    mostrarUpload();
    mostrarErros([]);
    cabecalho();
    atualizarFormatos();
    contador();
  }

  function abrirModal() {
    if (dialog.open) dialog.close();
    document.documentElement.classList.add('ve-modal-aberto');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function fechar() {
    if (enviando) return;
    if (alterado() && !window.confirm('Descartar as alterações não salvas?')) return;
    dialog.close();
  }

  function editarBloco(bloco) {
    modo('edicao');
    var alvo = document.getElementById(PRIMEIRO_CAMPO[bloco] || 've-tipo');
    if (alvo) { alvo.focus(); alvo.scrollIntoView({ block: 'center' }); }
  }

  document.querySelectorAll('[data-editar]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var p = porId[link.getAttribute('data-editar')];
      if (!p) return;
      e.preventDefault();
      preencher(p);
      abrirModal();
      modo('revisao');
      el('titulo-cabecalho').focus();
    });
  });

  dialog.addEventListener('click', function (e) {
    var alvo = e.target.closest('[data-ve-editar], [data-ve-voltar], [data-ve-fechar]');
    if (!alvo) return;
    e.preventDefault();
    if (alvo.hasAttribute('data-ve-editar')) editarBloco(alvo.getAttribute('data-ve-editar'));
    else if (alvo.hasAttribute('data-ve-voltar')) modo('revisao');
    else fechar();
  });

  dialog.addEventListener('cancel', function (e) { e.preventDefault(); fechar(); });

  campo('tipo_produto').addEventListener('change', function () {
    if (!camposTipo.trocarTipo(campo('tipo_produto').value)) {
      campo('tipo_produto').value = camposTipo.tipo;
      return;
    }
    atualizarFormatos();
  });
  campo('descricao').addEventListener('input', contador);

  // ---- Imagem principal: prévia, arrastar e "Manter a atual" ----
  var urlPrevia = null;
  function mostrarUpload() {
    var arquivo = campo('imagem').files[0];
    var previa = el('previa');
    if (urlPrevia) { URL.revokeObjectURL(urlPrevia); urlPrevia = null; }
    if (arquivo && /^image\/(jpeg|png)$/.test(arquivo.type)) {
      urlPrevia = URL.createObjectURL(arquivo);
      previa.src = urlPrevia;
      previa.hidden = false;
    } else if (!arquivo && atual && atual.imagem) {
      previa.src = atual.imagem;
      previa.hidden = false;
    } else if (!arquivo) {
      previa.hidden = true;
    }
    var tamanho = !arquivo ? '' : arquivo.size < 1024 * 1024
      ? Math.max(1, Math.round(arquivo.size / 1024)) + 'KB'
      : (arquivo.size / (1024 * 1024)).toFixed(1).replace('.', ',') + 'MB';
    el('upload-nome').textContent = arquivo ? arquivo.name + ' (' + tamanho + ')' : (atual && atual.imagem ? 'Capa atual do produto' : 'Sem imagem principal');
    el('upload-selo').textContent = arquivo ? 'Nova' : 'Atual';
    el('upload-selo').classList.toggle('is-nova', !!arquivo);
    el('upload').classList.toggle('is-nova', !!arquivo);
    el('upload-desfazer').hidden = !arquivo;
  }
  campo('imagem').addEventListener('change', mostrarUpload);
  el('upload-desfazer').addEventListener('click', function () {
    campo('imagem').value = '';
    mostrarUpload();
    campo('imagem').focus();
  });
  var zona = el('upload');
  ['dragenter', 'dragover'].forEach(function (tipo) {
    zona.addEventListener(tipo, function (e) { e.preventDefault(); zona.classList.add('is-arrastando'); });
  });
  ['dragleave', 'drop'].forEach(function (tipo) {
    zona.addEventListener(tipo, function () { zona.classList.remove('is-arrastando'); });
  });
  zona.addEventListener('drop', function (e) {
    e.preventDefault();
    var arquivos = e.dataTransfer && e.dataTransfer.files;
    if (!arquivos || !arquivos.length) return;
    try {
      var dt = new DataTransfer();
      dt.items.add(arquivos[0]);
      campo('imagem').files = dt.files;
      mostrarUpload();
    } catch (err) {}
  });

  dialog.addEventListener('close', function () {
    document.documentElement.classList.remove('ve-modal-aberto');
  });

  form.addEventListener('submit', function (e) {
    var erros = validar();
    if (erros.length) {
      e.preventDefault();
      modo('edicao');
      mostrarErros(erros);
      return;
    }
    enviando = true;
    form.querySelectorAll('button[type="submit"]').forEach(function (b) {
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
    });
    var salvar = el('salvar').querySelector('span');
    if (salvar) salvar.textContent = 'Salvando…';
  });

  var inicial = dialog.getAttribute('data-abrir');
  if (inicial && porId[campo('id').value]) {
    atual = porId[campo('id').value];
    cabecalho();
    mostrarUpload();
    atualizarFormatos();
    contador();
    abrirModal();
    modo(inicial);
    if (inicial === 'edicao') {
      var caixaErros = dialog.querySelector('[data-ve-erros]');
      caixaErros.setAttribute('tabindex', '-1');
      caixaErros.focus();
    }
    if (window.history.replaceState) window.history.replaceState(null, '', '/admvend');
  }
})();
