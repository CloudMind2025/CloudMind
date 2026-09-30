const fs   = require('fs');
const path = require('path');
const armazenamento = require('./armazenamento');

const DIR = path.resolve(__dirname, '..', 'public', 'image', 'uploads');

const MAX_ADICIONAIS = 7;
const TAMANHO_MAX_MB = 3;
const TAMANHO_MAX    = TAMANHO_MAX_MB * 1024 * 1024;
const EXTENSOES      = /\.(jpe?g|png)$/i;
const MIMES          = ['image/jpeg', 'image/png'];
const MIMES_GENERICOS = ['', 'application/octet-stream'];

function formatoAceito(file) {
    const mime = String(file.mimetype || '').toLowerCase();
    return EXTENSOES.test(file.originalname) && (MIMES.includes(mime) || MIMES_GENERICOS.includes(mime));
}

function tipoReal(caminho) {
    let fd;
    try {
        fd = fs.openSync(caminho, 'r');
        const b = Buffer.alloc(4);
        fs.readSync(fd, b, 0, 4, 0);
        if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { ext: 'jpg', mime: 'image/jpeg' };
        if (b.equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))) return { ext: 'png', mime: 'image/png' };
        return null;
    } catch (err) {
        return null;
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
}

function conteudoValido(caminho) {
    let fd;
    try {
        fd = fs.openSync(caminho, 'r');
        const b = Buffer.alloc(4);
        fs.readSync(fd, b, 0, 4, 0);
        const jpg = b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
        const png = b.equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
        return jpg || png;
    } catch (err) {
        return false;
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
}

function remover(ref) {
    if (!ref) return Promise.resolve(false);
    if (armazenamento.ehChave(ref)) return armazenamento.remover(ref);
    const alvo = path.resolve(DIR, path.basename(String(ref)));
    if (alvo.startsWith(DIR + path.sep)) fs.unlink(alvo, () => {});
    return Promise.resolve(true);
}

module.exports = { DIR, MAX_ADICIONAIS, TAMANHO_MAX, TAMANHO_MAX_MB, formatoAceito, conteudoValido, tipoReal, remover };
