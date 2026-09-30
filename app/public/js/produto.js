(function () {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  
  class ErroAcao extends Error {}

  
  const regiaoStatus = $('[data-aviso-status]');
  const regiaoAlerta = $('[data-aviso-alerta]');
  const toast = $('[data-toast]');
  let timerToast = null;

  function avisar(mensagem, tipo) {
    const erro = tipo === 'erro';
    const regiao = erro ? regiaoAlerta : regiaoStatus;
    if (regiao) {
      regiao.textContent = '';
      
      setTimeout(() => { regiao.textContent = mensagem; }, 50);
    }
    if (!toast) return;
    const icone = document.createElement('i');
    icone.className = 'fa-solid ' + (erro ? 'fa-circle-exclamation' : 'fa-circle-check');
    const texto = document.createElement('span');
    texto.textContent = mensagem;
    toast.replaceChildren(icone, texto);
    toast.className = 'pd-toast is-visivel ' + (erro ? 'is-erro' : 'is-sucesso');
    clearTimeout(timerToast);
    timerToast = setTimeout(() => toast.classList.remove('is-visivel'), erro ? 7000 : 4500);
  }

  
  async function enviar(form, url) {
    const resposta = await fetch(url || form.action, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams(new FormData(form)),
      credentials: 'same-origin'
    });
    const tipo = resposta.headers.get('content-type') || '';
    if (!tipo.includes('application/json')) {
      
      if (resposta.redirected) {
        window.location.href = resposta.url;
        return null;
      }
      throw new Error('Resposta inesperada do servidor');
    }
    const dados = await resposta.json();
    if (!resposta.ok) throw new ErroAcao(dados.erro || 'Não foi possível concluir a ação.');
    return dados;
  }

  function mensagemDeErro(err, padrao) {
    return err instanceof ErroAcao ? err.message : padrao;
  }

  
  function rotularBotao(botao, classeIcone, rotulo) {
    const icone = $('i', botao);
    const texto = $('span', botao);
    if (icone) icone.className = classeIcone;
    if (texto) texto.textContent = rotulo;
  }

 
  $$('[data-voltar]').forEach(link => {
    link.addEventListener('click', e => {
      let mesmoSite = false;
      try { mesmoSite = document.referrer && new URL(document.referrer).origin === location.origin; } catch (_) {}
      if (mesmoSite && history.length > 1) {
        e.preventDefault();
        history.back();
      }
    });
  });

  const menu = document.querySelector('.menu');
  if (menu) {
    const medirHeader = () =>
      document.body.style.setProperty('--pd-header-h', `${Math.ceil(menu.getBoundingClientRect().height)}px`);
    medirHeader();
    if ('ResizeObserver' in window) new ResizeObserver(medirHeader).observe(menu);
  }

 
  function acompanharImagem(midia) {
    const img = $('img', midia);
    if (!img) { midia.classList.remove('is-loading'); return; }
    const pronto = () => midia.classList.remove('is-loading');
    const falhou = () => {
      midia.classList.remove('is-loading');
      img.hidden = true;
      const fallback = $('[data-media-fallback]', midia);
      if (fallback) fallback.hidden = false;
    };
    if (img.complete) {
      img.naturalWidth > 0 ? pronto() : falhou();
    } else {
      img.addEventListener('load', pronto, { once: true });
      img.addEventListener('error', falhou, { once: true });
    }
  }
  $$('[data-media]').forEach(acompanharImagem);

  const abas = $$('[role="tab"][data-aba]');

  function abrirAba(nome, { focar = false, rolar = false } = {}) {
    const alvo = abas.find(a => a.dataset.aba === nome);
    if (!alvo) return false;
    abas.forEach(aba => {
      const ativa = aba === alvo;
      aba.setAttribute('aria-selected', String(ativa));
      aba.tabIndex = ativa ? 0 : -1;
      const painel = document.getElementById(aba.getAttribute('aria-controls'));
      if (painel) painel.hidden = !ativa;
    });
    if (focar) alvo.focus();
    if (rolar) $('[data-abas]').scrollIntoView({ block: 'start' });
    return true;
  }

  abas.forEach((aba, i) => {
    aba.addEventListener('click', () => {
      abrirAba(aba.dataset.aba);
      history.replaceState(null, '', '#' + aba.dataset.aba);
    });
    aba.addEventListener('keydown', e => {
      const destinos = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 };
      if (!(e.key in destinos)) return;
      e.preventDefault();
      const proxima = abas[(destinos[e.key] + abas.length) % abas.length];
      abrirAba(proxima.dataset.aba, { focar: true });
      history.replaceState(null, '', '#' + proxima.dataset.aba);
    });
  });

  function abrirAbaDoHash() {
    const nome = location.hash.slice(1);
    if (nome) abrirAba(nome, { rolar: true });
  }
  abrirAbaDoHash();
  window.addEventListener('hashchange', abrirAbaDoHash);

  
  const flash = $('[data-flash]');
  if (flash) {
    const focarFlash = () => setTimeout(() => flash.focus(), 0);
    document.readyState === 'complete' ? focarFlash() : window.addEventListener('load', focarFlash, { once: true });
  }

  $$('[data-ir-aba]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      abrirAba(link.dataset.irAba, { focar: true, rolar: true });
      history.replaceState(null, '', '#' + link.dataset.irAba);
    });
  });

  
  const formCarrinho = $('[data-carrinho]');
  const ROTULOS_CARRINHO = {
    pronto:     { icone: 'fa-solid fa-cart-plus',      longo: 'Adicionar ao carrinho', curto: 'Adicionar' },
    carregando: { icone: 'fa-solid fa-spinner',        longo: 'Adicionando…',          curto: 'Adicionando…' },
    adicionado: { icone: 'fa-solid fa-cart-shopping',  longo: 'Ver no carrinho',       curto: 'Ver carrinho' }
  };

  function estadoCarrinho(estado) {
    formCarrinho.dataset.estado = estado;
    const r = ROTULOS_CARRINHO[estado];
    $$('button[data-carrinho-botao]').forEach(botao => {
      const carregando = estado === 'carregando';
      botao.disabled = carregando;
      botao.setAttribute('aria-busy', String(carregando));
      rotularBotao(botao, r.icone, botao.hasAttribute('data-curto') ? r.curto : r.longo);
    });
  }

  if (formCarrinho) {
    formCarrinho.addEventListener('submit', async e => {
      e.preventDefault();
      const estado = formCarrinho.dataset.estado;
      if (estado === 'adicionado') { window.location.href = '/carrinho'; return; }
      if (estado === 'carregando') return;

      estadoCarrinho('carregando');
      try {
        const dados = await enviar(formCarrinho);
        if (!dados) return;
        estadoCarrinho('adicionado');
        avisar('Produto adicionado ao carrinho.', 'sucesso');
      } catch (err) {
        estadoCarrinho('pronto');
        avisar(mensagemDeErro(err, 'Não foi possível adicionar ao carrinho. Verifique sua conexão e tente novamente.'), 'erro');
      }
    });
  }

 
  const formFavorito = $('[data-favorito]');

  function estadoFavorito(favoritado) {
    formFavorito.dataset.favoritado = String(favoritado);
    formFavorito.action = favoritado ? '/favoritos/remover' : '/favoritos/adicionar';
    rotularBotao(
      $('[data-favorito-botao]', formFavorito),
      (favoritado ? 'fa-solid' : 'fa-regular') + ' fa-heart',
      favoritado ? 'Nos favoritos' : 'Favoritar'
    );
  }

  if (formFavorito) {
    formFavorito.addEventListener('submit', async e => {
      e.preventDefault();
      const botao = $('[data-favorito-botao]', formFavorito);
      if (botao.disabled) return;
      const favoritadoAntes = formFavorito.dataset.favoritado === 'true';

      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      rotularBotao(botao, 'fa-solid fa-spinner', 'Salvando…');
      try {
        const dados = await enviar(formFavorito);
        if (!dados) return;
        estadoFavorito(dados.favoritado);
        avisar(dados.favoritado ? 'Produto adicionado aos seus favoritos.' : 'Produto removido dos seus favoritos.', 'sucesso');
      } catch (err) {
        estadoFavorito(favoritadoAntes);
        avisar(mensagemDeErro(err, 'Não foi possível atualizar seus favoritos. Tente novamente.'), 'erro');
      } finally {
        botao.disabled = false;
        botao.setAttribute('aria-busy', 'false');
      }
    });
  }

 
  const share = $('[data-compartilhar]');
  if (share) {
    const botao = $('[data-compartilhar-botao]', share);
    const menu = $('[data-compartilhar-menu]', share);
    const botaoCopiar = $('[data-copiar-link]', share);
    const url = new URL('/paginnerprod?id=' + encodeURIComponent(share.dataset.id), location.origin).href;
    const titulo = share.dataset.titulo || document.title;
    const toque = window.matchMedia('(pointer: coarse)').matches;

    const u = encodeURIComponent(url);
    const t = encodeURIComponent(titulo);
    const links = {
      whatsapp: `https://wa.me/?text=${t}%20${u}`,
      x:        `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`
    };
    $$('[data-rede]', share).forEach(a => { a.href = links[a.dataset.rede] || a.href; });

    const abrirMenu = () => {
      menu.hidden = false;
      botao.setAttribute('aria-expanded', 'true');
      const primeiro = $('button, a', menu);
      if (primeiro) primeiro.focus();
    };
    const fecharMenu = (devolverFoco) => {
      if (menu.hidden) return;
      menu.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      if (devolverFoco) botao.focus();
    };

    botao.addEventListener('click', async () => {
      if (toque && navigator.share) {
        try {
          await navigator.share({ title: titulo, url });
        } catch (err) {
          if (err && err.name !== 'AbortError') abrirMenu();
        }
        return;
      }
      menu.hidden ? abrirMenu() : fecharMenu(true);
    });

    async function copiarLink() {
      try {
        await navigator.clipboard.writeText(url);
      } catch (_) {
        
        const campo = document.createElement('textarea');
        campo.value = url;
        campo.setAttribute('readonly', '');
        campo.style.position = 'fixed';
        campo.style.opacity = '0';
        document.body.appendChild(campo);
        campo.select();
        const ok = document.execCommand('copy');
        campo.remove();
        if (!ok) throw new Error('copy');
      }
    }

    botaoCopiar.addEventListener('click', async () => {
      try {
        await copiarLink();
        rotularBotao(botaoCopiar, 'fa-solid fa-check', 'Link copiado!');
        avisar('Link copiado!', 'sucesso');
        setTimeout(() => {
          rotularBotao(botaoCopiar, 'fa-regular fa-copy', 'Copiar link');
          fecharMenu(true);
        }, 1200);
      } catch (_) {
        avisar('Não foi possível copiar. Copie o endereço da barra do navegador.', 'erro');
      }
    });

    menu.addEventListener('click', e => {
      if (e.target.closest('a[data-rede]')) fecharMenu(false);
    });
    document.addEventListener('click', e => {
      if (!share.contains(e.target)) fecharMenu(false);
    });
    share.addEventListener('keydown', e => {
      if (e.key === 'Escape') fecharMenu(true);
    });
    share.addEventListener('focusout', e => {
      if (e.relatedTarget && !share.contains(e.relatedTarget)) fecharMenu(false);
    });
  }

  const barra = $('[data-barra-compra]');
  if (barra && formCarrinho && 'IntersectionObserver' in window) {
    const observador = new IntersectionObserver(([entrada]) => {
      const mostrar = !entrada.isIntersecting;
      barra.classList.toggle('is-visivel', mostrar);
      document.body.classList.toggle('pd-com-barra', mostrar);
    });
    observador.observe(formCarrinho);
  }

  
  const formAvaliacao = $('[data-form-avaliacao]');
  if (formAvaliacao) {
    const textoNota = $('[data-nota-texto]', formAvaliacao);
    const erroNota = document.getElementById('pd-nota-erro');
    const radios = $$('input[name="nota"]', formAvaliacao);

    radios.forEach(radio => radio.addEventListener('change', () => {
      textoNota.textContent = `${radio.value} de 5 — ${radio.dataset.rotulo}`;
      erroNota.textContent = '';
      erroNota.hidden = true;
    }));

    formAvaliacao.addEventListener('submit', e => {
      if (!radios.some(r => r.checked)) {
        e.preventDefault();
        erroNota.textContent = 'Escolha uma nota de 1 a 5 estrelas.';
        erroNota.hidden = false;
        radios[0].focus();
        return;
      }
      const botao = $('button[type="submit"]', formAvaliacao);
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      botao.lastChild.textContent = ' Enviando…';
    });
  }

  
  $$('textarea[data-contador]').forEach(campo => {
    const contador = document.getElementById(campo.dataset.contador);
    const atualizar = () => { contador.textContent = `${campo.value.length}/${campo.maxLength}`; };
    campo.addEventListener('input', atualizar);
    atualizar();
  });

  $$('form[data-form-texto]').forEach(form => {
    const campo = $('textarea', form);
    const erro = document.getElementById(
      (campo.getAttribute('aria-describedby') || '').split(' ').find(id => /erro/.test(id))
    );

    const mostrarErro = (msg) => {
      campo.setAttribute('aria-invalid', 'true');
      if (erro) { erro.textContent = msg; erro.hidden = false; }
    };
    const limparErro = () => {
      campo.removeAttribute('aria-invalid');
      if (erro) { erro.textContent = ''; erro.hidden = true; }
    };

    campo.addEventListener('input', () => {
      if (campo.getAttribute('aria-invalid') === 'true' && campo.value.trim().length >= campo.minLength) limparErro();
    });

    form.addEventListener('submit', e => {
      const tamanho = campo.value.trim().length;
      if (tamanho < campo.minLength || tamanho > campo.maxLength) {
        e.preventDefault();
        mostrarErro(`Escreva entre ${campo.minLength} e ${campo.maxLength} caracteres.`);
        campo.focus();
        return;
      }
      
      const botaoEnviar = $('button[type="submit"]', form);
      botaoEnviar.disabled = true;
      botaoEnviar.setAttribute('aria-busy', 'true');
      botaoEnviar.lastChild.textContent = ' Enviando…';
    });
  });
})();
