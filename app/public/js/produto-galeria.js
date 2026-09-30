
(function () {
  'use strict';

  const CONFIG = {
    AUTO_PLAY_INTERVAL: 5500, 
    SWIPE_MINIMO: 40,         
    TOQUE_DUPLO_MS: 300,      
    ZOOM_MAXIMO: 4,
    ZOOM_DUPLO: 2.5           
  };

  const galeria = document.querySelector('[data-galeria]');
  if (!galeria) return;

  let imagens = [];
  try { imagens = JSON.parse(galeria.dataset.imagens || '[]'); } catch (_) { imagens = []; }
  const total = imagens.length;
  if (!total) return;
  const varias = total > 1;
  const titulo = galeria.dataset.titulo || '';

  const $  = (sel, ctx = galeria) => ctx.querySelector(sel);
  const $$ = (sel, ctx = galeria) => Array.from(ctx.querySelectorAll(sel));
  const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)');
  const comportamentoRolagem = () => (movimentoReduzido.matches ? 'auto' : 'smooth');

  const palco        = $('[data-galeria-palco]');
  const img          = $('[data-galeria-imagem]');
  const botaoAmpliar = $('[data-galeria-ampliar]');
  const fallback     = $('[data-media-fallback]', palco);
  const numero       = $('[data-galeria-numero]');
  const faixa        = $('[data-galeria-miniaturas]');
  const miniaturas   = $$('[data-galeria-miniatura]');
  const anuncio      = $('[data-galeria-anuncio]');
  const dialogo      = $('[data-lightbox]');
  const lbPalco      = dialogo && $('[data-lightbox-palco]', dialogo);
  const lbImg        = dialogo && $('[data-lightbox-imagem]', dialogo);
  const lbNumero     = dialogo && $('[data-lightbox-numero]', dialogo);
  const lbMais       = dialogo && $('[data-lightbox-mais]', dialogo);
  const lbMenos      = dialogo && $('[data-lightbox-menos]', dialogo);

  const estado = {
    indice: 0,
    timer: null,          
    pausas: new Set(),    
    carga: 0,             
    zoom: 1, x: 0, y: 0   
  };
  const preCarregadas = new Set([imagens[0]]);

  const altDe = i => (i === 0 ? `Capa de ${titulo}` : `${titulo} — imagem ${i + 1} de ${total}`);

  function agendar() {
    clearTimeout(estado.timer);
    estado.timer = null;
    if (!varias || estado.pausas.size) return;
    estado.timer = setTimeout(() => irPara(estado.indice + 1, 'auto'), CONFIG.AUTO_PLAY_INTERVAL);
  }

  function pausar(motivo) {
    estado.pausas.add(motivo);
    agendar();
  }

  function retomar(motivo) {
    estado.pausas.delete(motivo);
    agendar();
  }

  


  
  function irPara(i, origem = 'usuario') {
    const novo = ((i % total) + total) % total;
    if (novo !== estado.indice) {
      estado.indice = novo;
      renderizar(origem);
    }
    agendar(); 
  }

  function renderizar(origem) {
    const i = estado.indice;
    trocarImagem(imagens[i], altDe(i));
    if (numero) numero.textContent = String(i + 1);
    if (varias) palco.setAttribute('aria-label', `Imagem ${i + 1} de ${total}`);
    botaoAmpliar.setAttribute('aria-label', `Ampliar imagem ${i + 1} de ${total}`);
    miniaturas.forEach((m, k) => m.setAttribute('aria-current', String(k === i)));
    mostrarMiniatura(miniaturas[i]);
    
    if (anuncio && origem !== 'auto') anuncio.textContent = `Imagem ${i + 1} de ${total}`;
    if (dialogo && dialogo.open) atualizarLightbox();
    preCarregar(i + 1);
  }

  
  function trocarImagem(src, alt) {
    const token = ++estado.carga;
    palco.classList.add('is-trocando');
    const nova = new Image();
    nova.decoding = 'async';
    nova.onload = () => {
      if (token !== estado.carga) return;
      img.src = src;
      img.alt = alt;
      img.hidden = false;
      fallback.hidden = true;
      palco.classList.remove('is-trocando', 'is-loading');
    };
    nova.onerror = () => {
      if (token !== estado.carga) return;
      img.hidden = true;
      fallback.hidden = false;
      palco.classList.remove('is-trocando', 'is-loading');
    };
    nova.src = src;
  }

  function preCarregar(i) {
    const src = imagens[((i % total) + total) % total];
    if (preCarregadas.has(src)) return;
    preCarregadas.add(src);
    const p = new Image();
    p.decoding = 'async';
    p.src = src;
  }

  
  function mostrarMiniatura(botao) {
    if (!faixa || !botao) return;
    const inicio = botao.offsetLeft;
    const fim = inicio + botao.offsetWidth;
    if (inicio < faixa.scrollLeft) {
      faixa.scrollTo({ left: inicio - 4, behavior: comportamentoRolagem() });
    } else if (fim > faixa.scrollLeft + faixa.clientWidth) {
      faixa.scrollTo({ left: fim - faixa.clientWidth + 4, behavior: comportamentoRolagem() });
    }
  }

  
  function primeiraCarregada() {
    palco.classList.remove('is-loading');
    if (varias) preCarregar(1);
  }
  function primeiraFalhou() {
    palco.classList.remove('is-loading');
    img.hidden = true;
    fallback.hidden = false;
  }
  if (img.complete) {
    img.naturalWidth > 0 ? primeiraCarregada() : primeiraFalhou();
  } else {
    img.addEventListener('load', primeiraCarregada, { once: true });
    img.addEventListener('error', primeiraFalhou, { once: true });
  }

  const iconeFallback = fallback && fallback.querySelector('i');
  miniaturas.forEach(botao => {
    const mini = botao.querySelector('img');
    if (!mini) return;
    const trocar = () => {
      const span = document.createElement('span');
      span.className = 'pd-thumb-fallback';
      span.setAttribute('aria-hidden', 'true');
      if (iconeFallback) span.appendChild(iconeFallback.cloneNode());
      mini.replaceWith(span);
    };
    if (mini.complete && !mini.naturalWidth) trocar();
    else mini.addEventListener('error', trocar, { once: true });
  });

  
  let ignorarClique = false; 

  botaoAmpliar.addEventListener('click', () => {
    if (!ignorarClique) abrirLightbox();
  });

  if (varias) {
    miniaturas.forEach((m, k) => m.addEventListener('click', () => irPara(k)));

    
    botaoAmpliar.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        irPara(estado.indice + (e.key === 'ArrowRight' ? 1 : -1));
      }
    });

    
    let toque = null;
    palco.addEventListener('touchstart', e => {
      toque = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null } : null;
    }, { passive: true });
    palco.addEventListener('touchmove', e => {
      if (!toque || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - toque.x;
      const dy = e.touches[0].clientY - toque.y;
      if (toque.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) toque.horizontal = Math.abs(dx) > Math.abs(dy);
      if (toque.horizontal && e.cancelable) e.preventDefault();
    }, { passive: false });
    palco.addEventListener('touchend', e => {
      if (!toque) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - toque.x;
      const dy = t.clientY - toque.y;
      toque = null;
      if (Math.abs(dx) >= CONFIG.SWIPE_MINIMO && Math.abs(dx) > Math.abs(dy) * 1.2) {
        ignorarClique = true;
        setTimeout(() => { ignorarClique = false; }, 400);
        irPara(estado.indice + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    
    galeria.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pausar('hover'); });
    galeria.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') retomar('hover'); });
    galeria.addEventListener('focusin', e => {
      let teclado = true;
      try { teclado = e.target.matches(':focus-visible'); } catch (_) {}
      if (teclado && !(dialogo && dialogo.contains(e.target))) pausar('foco');
    });
    galeria.addEventListener('focusout', e => {
      if (!e.relatedTarget || !galeria.contains(e.relatedTarget)) retomar('foco');
    });

    
    document.addEventListener('visibilitychange', () => {
      document.hidden ? pausar('oculta') : retomar('oculta');
    });
    window.addEventListener('pagehide', () => pausar('oculta'));
    window.addEventListener('pageshow', () => retomar('oculta'));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entrada]) => {
        entrada.isIntersecting ? retomar('fora-da-tela') : pausar('fora-da-tela');
      }, { threshold: 0.25 }).observe(galeria);
    }

    
    if (movimentoReduzido.matches) estado.pausas.add('movimento-reduzido');
    agendar();
  }

  
  let controleLightbox = null; 
  let focoAnterior = null;

  function abrirLightbox() {
    if (!dialogo || dialogo.open) return;
    focoAnterior = document.activeElement;
    pausar('lightbox');
    travarRolagem(true);

    controleLightbox = new AbortController();
    const { signal } = controleLightbox;
    dialogo.addEventListener('keydown', teclaNoLightbox, { signal });
    lbPalco.addEventListener('pointerdown', ponteiroDesce, { signal });
    lbPalco.addEventListener('pointermove', ponteiroMove, { signal });
    lbPalco.addEventListener('pointerup', ponteiroSobe, { signal });
    lbPalco.addEventListener('pointercancel', ponteiroSobe, { signal });
    lbPalco.addEventListener('wheel', rodaDoMouse, { passive: false, signal });
    window.addEventListener('resize', () => aplicarZoom(false), { signal });

    atualizarLightbox();
    dialogo.showModal();
  }

  function fecharLightbox() {
    if (dialogo && dialogo.open) dialogo.close();
  }

  if (dialogo) {
   
    dialogo.addEventListener('close', () => {
      if (controleLightbox) controleLightbox.abort();
      controleLightbox = null;
      ponteiros.clear();
      gesto = null;
      travarRolagem(false);
      resetarZoom();
      retomar('lightbox');
      if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus({ preventScroll: true });
    });
    $('[data-lightbox-fechar]', dialogo).addEventListener('click', fecharLightbox);
    lbMais.addEventListener('click', () => zoomEm(estado.zoom + 1));
    lbMenos.addEventListener('click', () => zoomEm(estado.zoom - 1));
    if (varias) {
      $('[data-lightbox-anterior]', dialogo).addEventListener('click', () => irPara(estado.indice - 1));
      $('[data-lightbox-proxima]', dialogo).addEventListener('click', () => irPara(estado.indice + 1));
    }
  }

  function atualizarLightbox() {
    const i = estado.indice;
    resetarZoom();
    lbPalco.classList.add('is-loading');
    lbImg.onload = () => lbPalco.classList.remove('is-loading');
    lbImg.onerror = () => lbPalco.classList.remove('is-loading');
    lbImg.src = imagens[i];
    lbImg.alt = altDe(i);
    if (lbNumero && varias) lbNumero.textContent = `${i + 1} / ${total}`;
  }

  function travarRolagem(travar) {
    const raiz = document.documentElement;
    if (travar) {
      raiz.style.setProperty('--pd-scrollbar', `${window.innerWidth - raiz.clientWidth}px`);
      raiz.classList.add('pd-sem-rolagem');
    } else {
      raiz.classList.remove('pd-sem-rolagem');
      raiz.style.removeProperty('--pd-scrollbar');
    }
  }

  function teclaNoLightbox(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!varias) return;
      e.preventDefault();
      irPara(estado.indice + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomEm(estado.zoom + 1);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomEm(estado.zoom - 1);
    } else if (e.key === '0') {
      e.preventDefault();
      resetarZoom();
    } else if (e.key === 'Tab') {
      
      const focaveis = $$('button:not([disabled])', dialogo);
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const atual = document.activeElement;
      if (!dialogo.contains(atual)) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && atual === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  }

  
  const ponteiros = new Map();
  let gesto = null;
  let ultimoToque = { tempo: 0, x: 0, y: 0 };

  function resetarZoom() {
    estado.zoom = 1;
    estado.x = 0;
    estado.y = 0;
    aplicarZoom(false);
  }

  function limitar() {
    if (!lbImg) return;
    const maxX = Math.max(0, (lbImg.offsetWidth * estado.zoom - lbPalco.clientWidth) / 2);
    const maxY = Math.max(0, (lbImg.offsetHeight * estado.zoom - lbPalco.clientHeight) / 2);
    estado.x = Math.min(maxX, Math.max(-maxX, estado.x));
    estado.y = Math.min(maxY, Math.max(-maxY, estado.y));
  }

  function aplicarZoom(animar = true) {
    if (!lbImg) return;
    limitar();
    lbImg.classList.toggle('sem-transicao', !animar);
    lbImg.style.transform = `translate(${estado.x}px, ${estado.y}px) scale(${estado.zoom})`;
    lbPalco.classList.toggle('is-zoom', estado.zoom > 1);
    lbMenos.disabled = estado.zoom <= 1;
    lbMais.disabled = estado.zoom >= CONFIG.ZOOM_MAXIMO;
  }

  
  function zoomEm(novo, cx = 0, cy = 0, animar = true) {
    const zoom = Math.min(CONFIG.ZOOM_MAXIMO, Math.max(1, novo));
    const fator = zoom / estado.zoom;
    estado.x = cx - (cx - estado.x) * fator;
    estado.y = cy - (cy - estado.y) * fator;
    estado.zoom = zoom;
    if (zoom === 1) { estado.x = 0; estado.y = 0; }
    aplicarZoom(animar);
  }

  function relativoAoCentro(clientX, clientY) {
    const r = lbPalco.getBoundingClientRect();
    return { cx: clientX - (r.left + r.width / 2), cy: clientY - (r.top + r.height / 2) };
  }

  function distancia() {
    const [a, b] = Array.from(ponteiros.values());
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  function ponteiroDesce(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    lbPalco.setPointerCapture(e.pointerId);
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.size === 2) {
      const [a, b] = Array.from(ponteiros.values());
      const centro = relativoAoCentro((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesto = { tipo: 'pinca', distancia0: distancia(), zoom0: estado.zoom, ...centro };
    } else if (ponteiros.size === 1) {
      gesto = {
        tipo: estado.zoom > 1 ? 'arraste' : 'deslize', alvo: e.target,
        x0: e.clientX, y0: e.clientY, px: estado.x, py: estado.y, moveu: false
      };
    }
  }

  function ponteiroMove(e) {
    if (!ponteiros.has(e.pointerId) || !gesto) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesto.tipo === 'pinca' && ponteiros.size === 2) {
      zoomEm(gesto.zoom0 * (distancia() / gesto.distancia0), gesto.cx, gesto.cy, false);
      return;
    }
    const dx = e.clientX - gesto.x0;
    const dy = e.clientY - gesto.y0;
    if (Math.abs(dx) + Math.abs(dy) > 4) gesto.moveu = true;
    if (gesto.tipo === 'arraste') {
      estado.x = gesto.px + dx;
      estado.y = gesto.py + dy;
      aplicarZoom(false);
    }
  }

  function ponteiroSobe(e) {
    if (!ponteiros.has(e.pointerId)) return;
    ponteiros.delete(e.pointerId);
    const g = gesto;

    if (g && g.tipo === 'pinca') {
      
      const resto = Array.from(ponteiros.values())[0];
      gesto = resto ? { tipo: 'arraste', x0: resto.x, y0: resto.y, px: estado.x, py: estado.y, moveu: true } : null;
      return;
    }
    gesto = null;
    if (!g || e.type === 'pointercancel') return;

    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.tipo === 'deslize' && varias && Math.abs(dx) >= CONFIG.SWIPE_MINIMO && Math.abs(dx) > Math.abs(dy) * 1.2) {
      irPara(estado.indice + (dx < 0 ? 1 : -1));
      return;
    }
    if (g.moveu) return;

    
    const agora = e.timeStamp;
    const duplo = agora - ultimoToque.tempo < CONFIG.TOQUE_DUPLO_MS &&
                  Math.hypot(e.clientX - ultimoToque.x, e.clientY - ultimoToque.y) < 30;
    ultimoToque = { tempo: duplo ? 0 : agora, x: e.clientX, y: e.clientY };
    if (duplo) {
      const { cx, cy } = relativoAoCentro(e.clientX, e.clientY);
      estado.zoom > 1 ? resetarZoom() : zoomEm(CONFIG.ZOOM_DUPLO, cx, cy);
    } else if (g.alvo === lbPalco && estado.zoom === 1) {
      setTimeout(() => { if (ultimoToque.tempo === agora) fecharLightbox(); }, CONFIG.TOQUE_DUPLO_MS);
    }
  }

  function rodaDoMouse(e) {
    e.preventDefault();
    const { cx, cy } = relativoAoCentro(e.clientX, e.clientY);
    
    zoomEm(estado.zoom * Math.exp(-e.deltaY * 0.0015), cx, cy, false);
  }
})();
