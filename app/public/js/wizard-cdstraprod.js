$(document).ready(function () {

  const DRAFT_KEY = 'cloudmind_cdstraprod_draft';
  const TIPOS_IMG = ['image/jpeg', 'image/png'];
  const TAM_IMG_MAX = 3 * 1024 * 1024;

  const ARQUIVO = (function () {
    const el = document.getElementById('content-drop');
    try {
      return { formatos: JSON.parse(el.dataset.formatos || '{}'), maxMb: Number(el.dataset.maxMb) || 100 };
    } catch (e) {
      return { formatos: {}, maxMb: 100 };
    }
  })();

  const STEP_NAMES = ['', 'Tipo', 'Informações', 'Mídia', 'Arquivo', 'Revisão'];
  const TOTAL_STEPS = 5;
  let currentStep = 1;

  const camposTipo = window.CamposTipo.iniciar(document.querySelector('[data-campos-tipo]'));
  const TIPOS = camposTipo.config.tipos;

  function getTipoSelecionado() {
    return $('input[name="tipo_produto"]:checked').val() || '';
  }

  function validateType() {
    const valido = !!getTipoSelecionado();
    $("#type-error").css('display', valido ? 'none' : 'block');
    if (!valido) {
      $("#type-cards").addClass('shake');
      setTimeout(() => $("#type-cards").removeClass('shake'), 500);
    }
    return valido;
  }

  function validateTitle() {
    const title = $("#title").val().trim();
    if (!title) return setError("#title", "Informe um título para continuar.");

    if (title.length < 5 || title.length > 100) return setError("#title", "O título deve ter entre 5 e 100 caracteres.");
    clearError("#title");
    return true;
  }

  function validateSKU() {
    const sku = $("#sku").val().trim();
    if (sku) {
      const skuRegex = /^[a-zA-Z0-9]{3,20}$/;
      if (!skuRegex.test(sku)) return setError("#sku", "SKU deve ter 3–20 caracteres alfanuméricos (sem símbolos).");
    }
    clearError("#sku");
    return true;
  }

    function normalizarPreco(valor) {
    const v = String(valor || '').trim().replace(/R\$|\s/g, '');
    if (v.includes(',')) return v.replace(/\./g, '').replace(',', '.');
    if (/^\d+\.\d{1,2}$/.test(v)) return v;
    return v.replace(/\./g, '');
  }

  function validatePrice() {
    const priceRaw = normalizarPreco($("#price").val());
    const price = parseFloat(priceRaw);
    if (!priceRaw || isNaN(price) || price < 0.01 || price > 999999.99) return setError("#price", "Informe um preço válido (0,01 a 999.999,99).");
    clearError("#price");
    return true;
  }

  function validateShortDesc() {
    const shortDesc = $("#short-desc").val().trim();

    if (shortDesc && (shortDesc.length < 10 || shortDesc.length > 150)) {
      return setError("#short-desc", "O resumo deve ter entre 10 e 150 caracteres.");
    }
    clearError("#short-desc");
    return true;
  }

  function validateDescription() {
    const description = $("#description").val().trim();
    if (!description) return setError("#description", "Escreva uma descrição para continuar.");
   
    if (description.length < 20 || description.length > 1000) return setError("#description", "Descrição deve ter entre 20 e 1000 caracteres.");
    clearError("#description");
    return true;
  }

  function setError(input, message) {
    let errorElem = $(input).closest('label').length
      ? $(input).closest('label').find('.field-error')
      : $(input).next(".field-error");

    if (!errorElem.length) {
      errorElem = $('<small class="field-error"></small>');
      $(input).after(errorElem);
    }
    errorElem.text(message).show();
    $(input).addClass('shake');
    setTimeout(() => $(input).removeClass('shake'), 500);
    return false;
  }

  function clearError(input) {
    $(input).next(".field-error").remove();
    $(input).closest('label').find('.field-error').remove();
  }

  let trocaProgramatica = false;

  $('.type-card-input').on('change', function () {
    const tipo = $(this).val();
    if (trocaProgramatica) {
      if (tipo !== camposTipo.tipo) camposTipo.definirTipo(tipo);
    } else if (!camposTipo.trocarTipo(tipo)) {
      $(`.type-card-input[value="${camposTipo.tipo}"]`).prop('checked', true);
      return;
    }
    $('.type-card').removeClass('is-selected');
    $(this).closest('.type-card').addClass('is-selected');
    $('#type-error').hide();
    aplicarTextosPorTipo(tipo);

    const arquivo = contentInput.files && contentInput.files[0];
    if (arquivo && problemaDoArquivo(arquivo)) {
      limparArquivo();
      mostrarErroArquivo(`O arquivo "${arquivo.name}" não é aceito para ${TIPOS[tipo].rotulo} e foi removido. Envie outro na etapa 4.`);
    }
    salvarRascunho();
  });

 
  function selecionarTipo(tipo) {
    const $input = $(`.type-card-input[value="${tipo}"]`);
    if (!$input.length) return;
    trocaProgramatica = true;
    try { $input.prop('checked', true).trigger('change'); } finally { trocaProgramatica = false; }
  }

  function aplicarTextosPorTipo(tipo) {
    const cfg = TIPOS[tipo] && TIPOS[tipo].upload;
    if (!cfg) return;
    $('#wp-label-4').text(cfg.rotuloEtapa);
    $('#step4-title').text(cfg.titulo);
    $('#step4-sub').text(cfg.sub);
    $('#content-label-text').text(cfg.rotuloDrop);
    $('#rv-file-title').text(cfg.titulo);

    const formatos = ARQUIVO.formatos[tipo] || [];
    $('#content-file').attr('accept', formatos.map(f => '.' + f).join(','));
    $('#content-formats').text(`Formatos aceitos: ${formatos.join(', ').toUpperCase()} • até ${ARQUIVO.maxMb}MB.`);
  }

  const imagesInput = document.getElementById('images');
  const extraInput  = document.getElementById('images-extra');
  const pickerInput = document.getElementById('images-picker');
  const MAX_EXTRAS  = Number($('#media-extra').data('max')) || 7;
  const IMAGES_DEFAULT_TEXT = 'Arraste uma imagem aqui ou selecione um arquivo';
 
  const montaLista = (function () {
    try { return typeof DataTransfer === 'function' && !!new DataTransfer().items; } catch (e) { return false; }
  })();
  let imagens = [];   // [{ file, url }]

  if (!montaLista) {
    $('#media-extra').attr('hidden', true);
    $('#media-sem-suporte').removeAttr('hidden');
  }

  function problemaDaImagem(file) {
   
    const tipoOk = TIPOS_IMG.includes(file.type) || file.type === '' || file.type === 'application/octet-stream';
    if (!tipoOk || !/\.(jpe?g|png)$/i.test(file.name)) {
      return 'formato inválido. Envie apenas JPG ou PNG.';
    }
    if (file.size > TAM_IMG_MAX) {
      return `arquivo muito grande (${formatarTamanho(file.size)}). O limite é 3MB.`;
    }
    return '';
  }

  const novaImagem = file => ({ file, url: URL.createObjectURL(file) });
  const liberar = item => { if (item) URL.revokeObjectURL(item.url); };

  
  async function formatoReal(file) {
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const txt = String.fromCharCode.apply(null, b);
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'JPG';
    if (b[0] === 0x89 && txt.slice(1, 4) === 'PNG') return 'PNG';
    if (txt.startsWith('RIFF') && txt.slice(8, 12) === 'WEBP') return 'WebP';
    if (txt.slice(4, 8) === 'ftyp') return 'HEIC/AVIF';
    if (txt.startsWith('GIF8')) return 'GIF';
    return 'desconhecido';
  }

  function mostrarErroPrincipal(msg) {
    $('#images-error').text(msg).toggle(!!msg);
  }

  async function problemaCompleto(file) {
    const msg = problemaDaImagem(file);
    if (msg) return msg;
    let real = 'desconhecido';
    try { real = await formatoReal(file); } catch (e) {}
    return real === 'JPG' || real === 'PNG'
      ? ''
      : `não é JPG/PNG de verdade (o conteúdo é ${real}). Abra a imagem e salve/exporte como JPG ou PNG.`;
  }

  let filaImagens = Promise.resolve();
  function enfileirarImagens(tarefa) {
    filaImagens = filaImagens.then(tarefa).catch(err => console.error(err));
    return filaImagens;
  }

  function anunciarImagens(msg) {
    const status = document.getElementById('media-status');
    status.textContent = '';
    setTimeout(() => { status.textContent = msg; }, 50);
  }

  function marcarPrincipalInvalida(mensagem) {
    const labelText = document.getElementById('images-label-text');
    labelText.classList.add('field-error-text');
    labelText.textContent = mensagem;
    $('#images-drop').addClass('shake');
    setTimeout(() => $('#images-drop').removeClass('shake'), 500);
  }

  function mostrarErroExtras(erros) {
    $('#images-extra-error').text(erros.join(' ')).toggle(erros.length > 0);
  }

  function validateImage() {
    if (!imagens.length) {
      marcarPrincipalInvalida('Selecione a imagem principal para continuar.');
      return false;
    }
    return true;
  }

  async function definirPrincipal(file) {
    const msg = await problemaCompleto(file);
    if (msg) {
      const texto = `Imagem principal "${file.name}": ${msg}`;
      imagens.length ? mostrarErroPrincipal(texto) : marcarPrincipalInvalida(texto);
      return false;
    }
    mostrarErroPrincipal('');
    if (imagens.length) {
      liberar(imagens[0]);
      imagens[0] = novaImagem(file);
    } else {
      imagens.push(novaImagem(file));
    }
    return true;
  }

  async function adicionarExtras(files) {
    const erros = [];
    for (const file of files) {
      const msg = await problemaCompleto(file);
      if (msg) { erros.push(`"${file.name}": ${msg}`); continue; }
      if (imagens.length >= MAX_EXTRAS + 1) {
        erros.push(`Limite de ${MAX_EXTRAS} imagens adicionais atingido.`);
        break;
      }
      imagens.push(novaImagem(file));
    }
    mostrarErroExtras(erros);
  }

  function sincronizarImagens() {
    if (montaLista) {
      const principal = new DataTransfer();
      if (imagens[0]) principal.items.add(imagens[0].file);
      imagesInput.files = principal.files;
      const extras = new DataTransfer();
      imagens.slice(1).forEach(img => extras.items.add(img.file));
      extraInput.files = extras.files;
    }
    renderizarImagens();
  }

  function renderizarImagens() {
    const principal = imagens[0];
    if (principal) {
      const labelText = document.getElementById('images-label-text');
      labelText.classList.remove('field-error-text');
      labelText.textContent = IMAGES_DEFAULT_TEXT;
      $('#images-preview').attr('src', principal.url);
      $('#images-filename').text(principal.file.name);
      $('#images-filesize').text(formatarTamanho(principal.file.size));
      $('#images-empty').attr('hidden', true);
      $('#images-filled').removeAttr('hidden');
    } else {
      $('#images-filled').attr('hidden', true);
      $('#images-empty').removeAttr('hidden');
    }

    const extras = imagens.slice(1);
    document.getElementById('media-extra-list')
      .replaceChildren(...extras.map((img, k) => itemImagemExtra(img, k + 1, extras.length)));
    $('#media-count').text(extras.length ? `— ${extras.length} de ${MAX_EXTRAS}` : '');
    $('#media-add-btn').prop('hidden', extras.length >= MAX_EXTRAS);
  }

  function botaoImagem(icone, rotulo, acao, i, desativado, extraClasse) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'media-btn' + (extraClasse ? ' ' + extraClasse : '');
    b.dataset.acao = acao;
    b.dataset.i = i;
    b.disabled = !!desativado;
    b.setAttribute('aria-label', rotulo);
    b.title = rotulo;
    const ic = document.createElement('i');
    ic.className = 'fa-solid ' + icone;
    ic.setAttribute('aria-hidden', 'true');
    b.appendChild(ic);
    return b;
  }

  function itemImagemExtra(img, i, total) {
    const li = document.createElement('li');
    li.className = 'media-item';
    const foto = document.createElement('img');
    foto.src = img.url;
    foto.alt = `Imagem adicional ${i}: ${img.file.name}`;
    const pos = document.createElement('span');
    pos.className = 'media-pos';
    pos.textContent = i;
    pos.setAttribute('aria-hidden', 'true');
    const acoes = document.createElement('div');
    acoes.className = 'media-actions';
    acoes.append(
      botaoImagem('fa-arrow-left', `Mover imagem adicional ${i} para a esquerda`, 'esquerda', i, i === 1),
      botaoImagem('fa-arrow-right', `Mover imagem adicional ${i} para a direita`, 'direita', i, i === total),
      botaoImagem('fa-star', `Tornar a imagem adicional ${i} a principal`, 'principal', i),
      botaoImagem('fa-xmark', `Remover imagem adicional ${i}`, 'remover', i, false, 'danger')
    );
    li.append(foto, pos, acoes);
    return li;
  }

  function focarAcaoImagem(acao, i) {
    const alvo = document.querySelector(`#media-extra-list button[data-acao="${acao}"][data-i="${i}"]`);
    if (alvo && !alvo.disabled) return alvo.focus();
    const item = document.querySelectorAll('#media-extra-list .media-item')[i - 1];
    const qualquer = item && item.querySelector('button:not([disabled])');
    (qualquer || document.getElementById('media-add-btn')).focus();
  }

  $('#media-extra-list').on('click', 'button[data-acao]', function () {
    const i = Number(this.dataset.i);
    const acao = this.dataset.acao;
    if (acao === 'esquerda' || acao === 'direita') {
      const j = acao === 'esquerda' ? i - 1 : i + 1;
      if (j < 1 || j >= imagens.length) return;
      [imagens[i], imagens[j]] = [imagens[j], imagens[i]];
      sincronizarImagens();
      focarAcaoImagem(acao, j);
      anunciarImagens(`Imagem movida para a posição ${j}.`);
    } else if (acao === 'principal') {
      const [item] = imagens.splice(i, 1);
      imagens.unshift(item);
      sincronizarImagens();
      document.getElementById('images-replace-btn').focus();
      anunciarImagens('Imagem definida como principal. A principal anterior virou a primeira adicional.');
    } else if (acao === 'remover') {
      liberar(imagens[i]);
      imagens.splice(i, 1);
      sincronizarImagens();
      focarAcaoImagem('remover', Math.min(i, imagens.length - 1));
      anunciarImagens('Imagem removida.');
    }
    marcarAlteracaoPendente();
  });

  $('#images-browse-btn, #images-replace-btn').on('click', () => imagesInput.click());

  $('#images').on('change', function () {
    const input = this;
    const file = input.files && input.files[0];
    if (!montaLista) {

      enfileirarImagens(async () => {
        liberar(imagens[0]);
        imagens = [];
        if (!file || !(await definirPrincipal(file))) input.value = '';
        renderizarImagens();
      });
      return;
    }
    enfileirarImagens(async () => {
      if (file) await definirPrincipal(file);
      sincronizarImagens();   
    });
  });

  $('#images-remove-btn').on('click', function () {
    enfileirarImagens(async () => {
      if (!imagens.length) return;
      liberar(imagens[0]);
      imagens.shift();
      if (!montaLista) imagesInput.value = '';
      mostrarErroPrincipal('');
      sincronizarImagens();
      anunciarImagens(imagens.length ? 'Imagem principal removida. A próxima imagem virou a principal.' : 'Imagem principal removida.');
      marcarAlteracaoPendente();
    });
  });

  const dropImg = document.getElementById('images-drop');
  ['dragover', 'dragleave', 'drop'].forEach(evt => {
    dropImg.addEventListener(evt, function (e) {
      e.preventDefault();
      dropImg.classList.toggle('is-dragover', evt === 'dragover');
      if (evt !== 'drop' || !e.dataTransfer.files.length) return;
      if (!montaLista) {
        imagesInput.files = e.dataTransfer.files;
        $(imagesInput).trigger('change');
        return;
      }

      const [primeira, ...resto] = Array.from(e.dataTransfer.files);
      enfileirarImagens(async () => {
        await definirPrincipal(primeira);
        if (resto.length) await adicionarExtras(resto);
        sincronizarImagens();
      });
    });
  });


  $('#media-add-btn').on('click', () => pickerInput.click());

  $('#images-picker').on('change', function () {
    const files = this.files ? Array.from(this.files) : [];
    this.value = '';
    if (!files.length) return;
    enfileirarImagens(async () => {
      await adicionarExtras(files);
      sincronizarImagens();
      marcarAlteracaoPendente();
    });
  });

  const dropExtras = document.getElementById('media-extra');
  ['dragover', 'dragleave', 'drop'].forEach(evt => {
    dropExtras.addEventListener(evt, function (e) {
      e.preventDefault();
      dropExtras.classList.toggle('is-dragover', evt === 'dragover');
      if (evt === 'drop' && e.dataTransfer.files.length) {
        const files = Array.from(e.dataTransfer.files);
        enfileirarImagens(async () => {
          await adicionarExtras(files);
          sincronizarImagens();
        });
      }
    });
  });

  const contentInput = document.getElementById('content-file');

  function extensaoDe(nome) {
    const partes = String(nome || '').toLowerCase().split('.');
    return partes.length > 1 ? partes.pop() : '';
  }

  function problemaDoArquivo(file) {
    const formatos = ARQUIVO.formatos[getTipoSelecionado()] || [];
    if (formatos.length && !formatos.includes(extensaoDe(file.name))) {
      return `Formato não aceito para este tipo de produto. Use: ${formatos.join(', ').toUpperCase()}.`;
    }
    if (file.size > ARQUIVO.maxMb * 1024 * 1024) {
      return `Arquivo muito grande (${formatarTamanho(file.size)}). O limite é ${ARQUIVO.maxMb}MB.`;
    }
    return '';
  }

  function mostrarErroArquivo(msg) {
    $('#content-error').text(msg).toggle(!!msg);
    if (msg) {
      $('#content-drop').addClass('shake');
      setTimeout(() => $('#content-drop').removeClass('shake'), 500);
    }
  }

  function limparArquivo() {
    contentInput.value = '';
    $('#content-empty').removeAttr('hidden');
    $('#content-filled').attr('hidden', true);
  }

  function validateContentFile() {
    const file = contentInput.files && contentInput.files[0];
    const msg = !file
      ? 'Envie o arquivo do produto para continuar: é ele que o comprador recebe.'
      : problemaDoArquivo(file);
    mostrarErroArquivo(msg);
    return !msg;
  }

  $('#content-browse-btn, #content-replace-btn').on('click', () => contentInput.click());

  $('#content-remove-btn').on('click', function () {
    limparArquivo();
    mostrarErroArquivo('');
  });

  $('#content-file').on('change', function () {
    if (!this.files || !this.files[0]) return;
    const file = this.files[0];
    const msg = problemaDoArquivo(file);
    if (msg) {
      limparArquivo();
      mostrarErroArquivo(msg);
      return;
    }
    mostrarErroArquivo('');
    $('#content-filename').text(file.name);
    $('#content-filesize').text(formatarTamanho(file.size));
    $('#content-empty').attr('hidden', true);
    $('#content-filled').removeAttr('hidden');
  });

  const dropContent = document.getElementById('content-drop');
  ['dragover', 'dragleave', 'drop'].forEach(evt => {
    dropContent.addEventListener(evt, function (e) {
      e.preventDefault();
      dropContent.classList.toggle('is-dragover', evt === 'dragover');
      if (evt === 'drop' && e.dataTransfer.files[0]) {
        contentInput.files = e.dataTransfer.files;
        $(contentInput).trigger('change');
      }
    });
  });

  function formatarTamanho(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function updateSummary() {
    const price = parseFloat(normalizarPreco($("#price").val()));
    $("#summary-price").text(isNaN(price) ? '0,00' : price.toFixed(2).replace('.', ','));
  }

  $("#title, #price").on('input change', function () {
    updateSummary();
    marcarAlteracaoPendente();
  });
  $("#sku, #short-desc, #description").on('input change', marcarAlteracaoPendente);
  $('[data-campos-tipo]').on('input change', marcarAlteracaoPendente);

  function validarEtapa(step) {
    if (step === 1) {
      if (!validateType()) return false;
      const erros = camposTipo.validar();
      if (erros.length && erros[0].el) erros[0].el.focus();
      return !erros.length;
    }
    if (step === 2) {
      const a = validateTitle();
      const p = validatePrice();
      const s = validateSKU();
      const r = validateShortDesc();
      const d = validateDescription();
      return a && p && s && r && d;
    }
    if (step === 3) return validateImage();
    if (step === 4) return validateContentFile();
    return true;
  }

  function irParaEtapa(step, rolar = true) {
    currentStep = step;

    $('.wizard-step').attr('hidden', true);
    $(`.wizard-step[data-step="${step}"]`).removeAttr('hidden');


    $('.wp-step').removeClass('is-current is-done').removeAttr('aria-current');
    $('.wp-step').each(function () {
      const s = parseInt($(this).data('step'), 10);
      if (s < step) $(this).addClass('is-done');
      if (s === step) $(this).addClass('is-current').attr('aria-current', 'step');
    });

    $('#wp-current-num').text(step);
    $('#wp-current-label').text(STEP_NAMES[step]);
    $('#wp-bar-fill').css('width', (((step - 1) / (TOTAL_STEPS - 1)) * 100) + '%');

    $('#wizard-back-btn').toggle(step > 1);
    $('#wizard-next-btn').toggle(step < TOTAL_STEPS);

    $('#publish-btn').prop('hidden', step !== TOTAL_STEPS);

    if (step === TOTAL_STEPS) montarRevisao();

    if (!rolar) return;

    const alturaHeader = $('.menu').outerHeight() || 0;
    $('html, body').animate({ scrollTop: $('.wizard-progress').offset().top - alturaHeader - 16 }, 250, function () {
  
      const $novaEtapa = $(`.wizard-step[data-step="${step}"]`);
      if ($novaEtapa.length) $novaEtapa[0].focus({ preventScroll: true });
    });
  }

  $('#wizard-next-btn').on('click', async function () {

    if (currentStep === 3) await filaImagens;
    if (!validarEtapa(currentStep)) return;
    salvarRascunho();
    if (currentStep < TOTAL_STEPS) irParaEtapa(currentStep + 1);
  });

  $('#wizard-back-btn').on('click', function () {
    if (currentStep > 1) irParaEtapa(currentStep - 1);
  });


  $('.review-edit').on('click', function () {
    irParaEtapa(parseInt($(this).data('goto'), 10));
  });

  function montarRevisao() {
    const tipo = getTipoSelecionado();
    const cfg = TIPOS[tipo] && TIPOS[tipo].upload;

    $('#rv-type').text($('.type-card.is-selected span').text() || '—');
    const dl = document.getElementById('rv-tipo-dl');
    dl.querySelectorAll('[data-rv-extra]').forEach(el => el.remove());
    camposTipo.resumo().forEach(linha => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = linha.rotulo;
      dd.textContent = linha.valor || '—';
      dt.setAttribute('data-rv-extra', '');
      dd.setAttribute('data-rv-extra', '');
      dl.append(dt, dd);
    });
    $('#rv-title').text($('#title').val() || '—');
    $('#rv-sku').text($('#sku').val() || '—');
    $('#rv-price').text('R$ ' + ($('#price').val() || '0,00'));
    $('#rv-resumo').text($('#short-desc').val() || '—');
    $('#rv-description').text($('#description').val() || '—');

    const rvImagens = document.getElementById('rv-image-wrap');
    if (imagens.length) {
      const lista = document.createElement('ul');
      lista.className = 'rv-images';
      imagens.forEach((img, i) => {
        const li = document.createElement('li');
        const foto = document.createElement('img');
        foto.src = img.url;
        foto.alt = i === 0 ? 'Imagem principal' : `Imagem adicional ${i}`;
        li.appendChild(foto);
        if (i === 0) {
          const selo = document.createElement('span');
          selo.className = 'media-badge';
          selo.textContent = 'Principal';
          li.appendChild(selo);
        }
        lista.appendChild(li);
      });
      const legenda = document.createElement('p');
      legenda.textContent = imagens.length === 1
        ? '1 imagem (principal).'
        : `${imagens.length} imagens: a principal e ${imagens.length - 1} adicional(is), nesta ordem.`;
      rvImagens.replaceChildren(lista, legenda);
    } else {
      rvImagens.textContent = 'Nenhuma imagem adicionada.';
    }

    if (cfg) $('#rv-file-title').text(cfg.titulo);
    const contentFile = document.getElementById('content-file').files[0];
    $('#rv-file-wrap').text(contentFile ? contentFile.name : 'Nenhum arquivo adicionado.');

    const infoOk = !!tipo && camposTipo.validar(false).length === 0;
    const contentOk = validateTitle() && validatePrice() && $('#description').val().trim().length >= 20;
    const imageOk = imagens.length > 0;
    const fileOk = !!contentFile;

    $('[data-check="info"]').toggleClass('is-complete', infoOk);
    $('[data-check="content"]').toggleClass('is-complete', contentOk);
    $('[data-check="image"]').toggleClass('is-complete', imageOk);
    $('[data-check="file"]').toggleClass('is-complete', fileOk);
  }

  function salvarRascunho() {
    try {
      const dados = {
        tipo: getTipoSelecionado(),
        titulo: $('#title').val(),
        categoria: camposTipo.valores().id_categoria,
        detalhes: camposTipo.valores().detalhes,
        sku: $('#sku').val(),
        preco: $('#price').val(),
        resumo: $('#short-desc').val(),
        descricao: $('#description').val(),
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(dados));
      marcarSalvo();
    } catch (e) {
      console.error('Não foi possível salvar o rascunho:', e);
    }
  }

  function carregarRascunho() {
    let dados;
    try {
      dados = JSON.parse(localStorage.getItem(DRAFT_KEY));
    } catch (e) { return; }
    if (!dados) return;

    if (dados.tipo) {
      selecionarTipo(dados.tipo);
      camposTipo.preencher({ id_categoria: dados.categoria, detalhes: dados.detalhes || {} });
    }
    $('#title').val(dados.titulo || '');
    $('#sku').val(dados.sku || '');
    $('#price').val(dados.preco || '');
    $('#short-desc').val(dados.resumo || '');
    $('#description').val(dados.descricao || '');
    updateSummary();

    if (dados.savedAt) {
      $('#save-status').removeClass('is-pending').addClass('is-saved')
        .html(`<i class="fa-solid fa-circle-check"></i> Rascunho restaurado`);
    }
  }

  function marcarSalvo() {
    $('#save-status').removeClass('is-pending').addClass('is-saved')
      .html('<i class="fa-solid fa-circle-check"></i> Salvo agora');
  }

  function marcarAlteracaoPendente() {
    $('#save-status').removeClass('is-saved').addClass('is-pending')
      .html('<i class="fa-solid fa-circle-exclamation"></i> Alterações não salvas');
  }


  let autosaveTimer = null;
  $('#product-form').on('input change', function () {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(salvarRascunho, 2000);
  });

  $('#product-form').on('submit', function (e) {

    for (let s = 1; s <= 4; s++) {
      if (!validarEtapa(s)) {
        e.preventDefault();
        irParaEtapa(s);
        return;
      }
    }
    $('#publish-btn').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Publicando produto...');
    try { localStorage.removeItem(DRAFT_KEY); } catch (err) {}

  });

  const voltouComErro = $('#product-form').attr('data-com-erros') === 'true';
  if (!voltouComErro) carregarRascunho();
  const tipoMarcado = getTipoSelecionado();
  if (tipoMarcado) selecionarTipo(tipoMarcado);
  updateSummary();
  irParaEtapa(1, false);
});
