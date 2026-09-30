const tiposProduto = require('./tiposProduto');

const GENERICO = {
    rotulo:  'Produto digital',
    icone:   'fa-box-open',
    entrega: 'Arquivo digital do produto',
    previa: {
        titulo: 'Prévia do conteúdo',
        vazio:  'O vendedor ainda não disponibilizou uma prévia do conteúdo.'
    }
};

function tipoProduto(tipo) {
    const chave = String(tipo || '').trim().toLowerCase();
    const cfg = tiposProduto.tipo(chave);
    if (cfg) return { chave, rotulo: cfg.rotulo, icone: cfg.icone, entrega: cfg.entrega, previa: cfg.previa };
    const rotulo = chave ? chave.charAt(0).toUpperCase() + chave.slice(1) : GENERICO.rotulo;
    return { chave, ...GENERICO, rotulo };
}

function formatarPreco(valor) {
    return 'R$ ' + parseFloat(valor).toFixed(2).replace('.', ',');
}

function formatarNota(nota) {
    return Number(nota).toFixed(1).replace('.', ',');
}

function nomePublico(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'Usuário';
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes[partes.length - 1].charAt(0).toUpperCase()}.`;
}

function estrelas(nota) {
    const n = Math.max(0, Math.min(5, Number(nota) || 0));
    return [1, 2, 3, 4, 5].map(i => (n >= i - 0.25 ? 'cheia' : n >= i - 0.75 ? 'meia' : 'vazia'));
}

module.exports = {
    tipoProduto, formatarPreco, formatarNota, nomePublico, estrelas,
    TIPOS_CHAVES: tiposProduto.CHAVES,
    fichaDoProduto: tiposProduto.fichaDoProduto,
    detalhesParaFormulario: tiposProduto.detalhesParaFormulario,
    detalhesCompletos: tiposProduto.detalhesCompletos
};
