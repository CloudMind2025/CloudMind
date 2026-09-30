const path = require('path');
const fs   = require('fs');
const tiposProduto = require('./tiposProduto');
const armazenamento = require('./armazenamento');

const DIR = path.resolve(process.env.ARQUIVOS_PRODUTO_DIR || path.join(__dirname, '..', '..', 'storage', 'produtos'));

const TAMANHO_MAX_MB = 100;
const TAMANHO_MAX    = TAMANHO_MAX_MB * 1024 * 1024;

const FORMATOS_POR_TIPO = Object.fromEntries(
    tiposProduto.CHAVES.map(k => [k, tiposProduto.TIPOS[k].upload.formatos])
);
const TODOS_FORMATOS = [...new Set(Object.values(FORMATOS_POR_TIPO).flat())];

function extensao(nome) {
    return path.extname(String(nome || '').split(/[?#]/)[0]).slice(1).toLowerCase();
}

function extensaoPermitida(nome, tipo) {
    const lista = tipo ? FORMATOS_POR_TIPO[String(tipo).toLowerCase()] : TODOS_FORMATOS;
    return !!lista && lista.includes(extensao(nome));
}

function formatoDoArquivo(nome) {
    const ext = extensao(nome);
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext.toUpperCase() : null;
}

function caminhoSeguro(nome) {
    if (!nome) return null;
    const caminho = path.resolve(DIR, path.basename(String(nome)));
    return caminho.startsWith(DIR + path.sep) ? caminho : null;
}

function remover(ref) {
    if (!ref) return Promise.resolve(false);
    if (armazenamento.ehChave(ref)) return armazenamento.remover(ref);
    const caminho = caminhoSeguro(ref);
    if (caminho) fs.unlink(caminho, () => {});
    return Promise.resolve(true);
}

function nomeParaDownload(titulo, nome) {
    const base = String(titulo || 'produto')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'produto';
    const ext = extensao(nome);
    return ext ? `${base}.${ext}` : base;
}

module.exports = {
    DIR,
    TAMANHO_MAX,
    TAMANHO_MAX_MB,
    FORMATOS_POR_TIPO,
    extensao,
    extensaoPermitida,
    formatoDoArquivo,
    caminhoSeguro,
    remover,
    nomeParaDownload
};
