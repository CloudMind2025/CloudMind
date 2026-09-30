
(function () {
  'use strict';

  
  document.addEventListener('click', function (e) {
    var botao = e.target.closest('.btn-detalhe');
    if (!botao) return;
    var modal = document.getElementById('modalDetalhe');
    modal.querySelector('#detalhe-titulo').textContent = botao.dataset.titulo || 'Detalhes';
    ['rotulo1', 'valor1', 'rotulo2', 'valor2', 'status', 'data', 'descricao'].forEach(function (chave) {
      var alvo = modal.querySelector('[data-m="' + chave + '"]');
      if (alvo) alvo.textContent = botao.dataset[chave] || '-';
    });
  }, true);

  if (!window.Chart) return;
  var semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined;
  var reais = function (v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var base = { responsive: true, maintainAspectRatio: false, animation: semAnimacao };

  var canvasVendas = document.getElementById('graficoVendas');
  var dadosVendas = document.getElementById('dadosVendas');
  if (canvasVendas && dadosVendas) {
    var serie = JSON.parse(dadosVendas.textContent || '{"dias":[],"meses":[]}');
    var estado = { metrica: 'faturamento', periodo: '7' };
    var nomesMeses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    var diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    var inteiro = function (v) { return String(Math.round(v)); };

    function rotulo(ponto) {
      var p = ponto.chave.split('-').map(Number);
      if (p.length === 2) return nomesMeses[p[1] - 1] + '/' + String(p[0]).slice(2);
      var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
      return estado.periodo === '7' ? diasSemana[dt.getUTCDay()] + ' ' + p[2] : ('0' + p[2]).slice(-2) + '/' + ('0' + p[1]).slice(-2);
    }
    function pontos() {
      if (estado.periodo === '12m') return serie.meses;
      return serie.dias.slice(estado.periodo === '7' ? -7 : -30);
    }

    var grafico = new window.Chart(canvasVendas, {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [], backgroundColor: 'rgba(198,155,60,0.85)', hoverBackgroundColor: '#b88b32', borderRadius: 6, maxBarThickness: 42 }] },
      options: Object.assign({}, base, {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) {
          return estado.metrica === 'faturamento' ? reais(c.parsed.y) : c.parsed.y + (c.parsed.y === 1 ? ' venda' : ' vendas');
        } } } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
      })
    });

    var descricaoPeriodo = { '7': 'nos últimos 7 dias', '30': 'nos últimos 30 dias', '12m': 'nos últimos 12 meses' };
    function atualizar() {
      var lista = pontos();
      grafico.data.labels = lista.map(rotulo);
      grafico.data.datasets[0].data = lista.map(function (p) { return p[estado.metrica]; });
      grafico.options.scales.y.ticks.callback = estado.metrica === 'faturamento' ? reais : inteiro;
      grafico.update();
      var soma = function (campo) { return lista.reduce(function (s, p) { return s + p[campo]; }, 0); };
      document.querySelector('[data-total="faturamento"]').textContent = reais(soma('faturamento'));
      document.querySelector('[data-total="vendas"]').textContent = soma('vendas');
      document.querySelector('[data-total="pedidos"]').textContent = soma('pedidos');
      document.querySelector('[data-total="descontos"]').textContent = reais(soma('descontos'));
      canvasVendas.setAttribute('aria-label', (estado.metrica === 'faturamento' ? 'Faturamento' : 'Quantidade de vendas') +
        ' dos pedidos pagos ' + descricaoPeriodo[estado.periodo]);
    }

    document.querySelectorAll('[data-vendas] [data-metrica], [data-vendas] [data-periodo]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        var chave = botao.hasAttribute('data-metrica') ? 'metrica' : 'periodo';
        estado[chave] = botao.getAttribute('data-' + chave);
        botao.parentElement.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === botao)); });
        atualizar();
      });
    });
    atualizar();
  }

  var tipos = document.getElementById('graficoTipos');
  if (tipos) {
    new window.Chart(tipos, {
      type: 'doughnut',
      data: { labels: ['Clientes', 'Vendedores', 'Admins'], datasets: [{ data: JSON.parse(tipos.dataset.valores || '[0,0,0]'), backgroundColor: ['#234162', '#2b4c7e', '#93c5fd'] }] },
      options: Object.assign({}, base, { plugins: { legend: { position: 'right' } } })
    });
  }
})();
