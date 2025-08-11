
   // Atualiza ano do rodapé
    document.getElementById('year').textContent = new Date().getFullYear();

    // Tab simples (progressivo, sem dependências)
    const tabs = document.querySelectorAll('.tabs-nav button');
    const panels = document.querySelectorAll('.tab-panel');
    tabs.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.setAttribute('aria-selected','false'));
        panels.forEach(p => p.hidden = true);
        btn.setAttribute('aria-selected','true');
        panels[idx].hidden = false;
      });
    });

    // Thumbs troca imagem principal
    document.querySelectorAll('.thumbs img').forEach(thumb => {
      thumb.addEventListener('click', () => {
        document.querySelector('.main-image img').src = thumb.src;
      });
    });