const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PASTAS = {
    products: ['cover', 'gallery', 'files'],
    users:    ['avatar'],
    sellers:  ['cover']
};
const PASTAS_PRIVADAS = ['files'];

const REGEX_CHAVE = /^(products|users|sellers)\/([1-9]\d{0,9})\/(cover|gallery|files|avatar)\/([a-z0-9][a-z0-9._-]{0,150})$/;

class ErroArmazenamento extends Error {
    constructor(mensagem, causa) {
        super(mensagem);
        this.name = 'ErroArmazenamento';
        this.causa = causa;
    }
}

// ---------- Configuração ----------
function config() {
    const env = process.env;
    let endpoint = String(env.STORAGE_ENDPOINT || env.CELLAR_ADDON_HOST || '').trim().replace(/\/+$/, '');
    if (endpoint && !/^https?:\/\//i.test(endpoint)) endpoint = `https://${endpoint}`;
    const bucket = String(env.STORAGE_BUCKET || '').trim();
    const forcePathStyle = env.STORAGE_FORCE_PATH_STYLE !== 'false';
    let urlPublica = String(env.STORAGE_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (!urlPublica && endpoint && bucket) {
        urlPublica = forcePathStyle
            ? `${endpoint}/${bucket}`
            : endpoint.replace(/^(https?:\/\/)/i, `$1${bucket}.`);
    }
    return {
        endpoint,
        bucket,
        region: String(env.STORAGE_REGION || 'us-east-1').trim(),
        accessKeyId: String(env.STORAGE_ACCESS_KEY || env.CELLAR_ADDON_KEY_ID || '').trim(),
        secretAccessKey: String(env.STORAGE_SECRET_KEY || env.CELLAR_ADDON_KEY_SECRET || '').trim(),
        forcePathStyle,
        urlPublica,
        expiracao: Math.min(Math.max(Number(env.STORAGE_URL_EXPIRACAO) || 300, 30), 3600),
        acl: env.STORAGE_PUBLIC_ACL === 'none' ? null : 'public-read'
    };
}

// ---------- Chaves ----------
function extensaoSegura(ext) {
    const e = String(ext || '').replace(/^\./, '').toLowerCase();
    return /^[a-z0-9]{1,5}$/.test(e) ? e : null;
}

function novaChave(entidade, id, pasta, ext, prefixoNome = '') {
    const idNum = Number(id);
    if (!PASTAS[entidade] || !PASTAS[entidade].includes(pasta)) throw new ErroArmazenamento(`Pasta inválida: ${entidade}/${pasta}`);
    if (!Number.isInteger(idNum) || idNum < 1) throw new ErroArmazenamento('Registro inválido para a chave do arquivo.');
    const e = extensaoSegura(ext);
    if (!e) throw new ErroArmazenamento('Extensão de arquivo inválida.');
    const prefixo = String(prefixoNome || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    return `${entidade}/${idNum}/${pasta}/${prefixo}${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${e}`;
}

function ehChave(ref) {
    return typeof ref === 'string' && REGEX_CHAVE.test(ref) && !ref.includes('..');
}

function ehPublica(chave) {
    const m = REGEX_CHAVE.exec(String(chave || ''));
    return !!m && !PASTAS_PRIVADAS.includes(m[3]);
}

function urlMidia(ref) {
    if (!ref) return '';
    const valor = String(ref);
    if (ehChave(valor)) {
        if (!ehPublica(valor)) return '';
        const base = driverAtual ? driverAtual.urlPublicaBase : config().urlPublica;
        return base ? `${base}/${valor.split('/').map(encodeURIComponent).join('/')}` : '';
    }
    return valor.startsWith('/') || /^https?:\/\//i.test(valor) ? valor : `/${valor}`;
}

const PASTA_PUBLICA = path.resolve(__dirname, '..', 'public');
const legadoNoDisco = new Map();
function urlFoto(ref) {
    const url = urlMidia(ref);
    if (!url || ehChave(String(ref)) || /^https?:\/\//i.test(url)) return url;
    const relativo = url.split('?')[0].replace(/^\/+/, '');
    if (!legadoNoDisco.has(relativo)) {
        let caminho = '';
        try { caminho = path.resolve(PASTA_PUBLICA, decodeURIComponent(relativo)); } catch (_) {}
        legadoNoDisco.set(relativo, caminho.startsWith(PASTA_PUBLICA + path.sep) && fs.existsSync(caminho));
    }
    return legadoNoDisco.get(relativo) ? url : '';
}

// ---------- Driver S3 (Cellar) ----------
function criarDriverS3(cfg) {
    const { S3Client, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
    const { Upload } = require('@aws-sdk/lib-storage');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    const cliente = new S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region,
        forcePathStyle: cfg.forcePathStyle,
        credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
        maxAttempts: 3
    });
    let aclSuportada = !!cfg.acl;

    async function subir(params) {
        const envio = new Upload({ client: cliente, params, queueSize: 2, partSize: 8 * 1024 * 1024 });
        return envio.done();
    }

    return {
        nome: 's3',
        urlPublicaBase: cfg.urlPublica,

        async enviar({ chave, caminho, tipo, publico }) {
            const params = {
                Bucket: cfg.bucket,
                Key: chave,
                Body: fs.createReadStream(caminho),
                ContentType: tipo || 'application/octet-stream',
                CacheControl: publico ? 'public, max-age=31536000, immutable' : 'private, no-store'
            };
            if (publico && aclSuportada) params.ACL = cfg.acl;
            try {
                await subir(params);
            } catch (err) {
                if (params.ACL && /AccessControlListNotSupported|NotImplemented/i.test(String(err && (err.name || err.Code)))) {
                    aclSuportada = false;
                    console.warn('⚠️  Storage não aceita ACL por objeto: usando só a política do bucket (scripts/configurarStorage.js).');
                    delete params.ACL;
                    params.Body = fs.createReadStream(caminho);
                    await subir(params);
                } else {
                    throw err;
                }
            }
        },

        async info(chave) {
            try {
                const r = await cliente.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: chave }));
                return { tamanho: Number(r.ContentLength), tipo: r.ContentType || null };
            } catch (err) {
                if (err && (err.name === 'NotFound' || (err.$metadata && err.$metadata.httpStatusCode === 404))) return null;
                throw err;
            }
        },

        async remover(chave) {
            await cliente.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: chave }));
        },

        async urlDownload(chave, nomeArquivo, segundos) {
            const ascii = String(nomeArquivo || 'arquivo').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
            return getSignedUrl(cliente, new GetObjectCommand({
                Bucket: cfg.bucket,
                Key: chave,
                ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo || 'arquivo')}`,
                ResponseContentType: 'application/octet-stream',
                ResponseCacheControl: 'private, no-store'
            }), { expiresIn: segundos });
        },

        async listar(prefixo) {
            const chaves = [];
            let token;
            do {
                const r = await cliente.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefixo, ContinuationToken: token }));
                (r.Contents || []).forEach(o => chaves.push({ chave: o.Key, tamanho: Number(o.Size) }));
                token = r.IsTruncated ? r.NextContinuationToken : undefined;
            } while (token);
            return chaves;
        },

        cliente,
        bucket: cfg.bucket
    };
}

// ---------- Driver em memória (testes) ----------
function criarDriverMemoria({ urlPublicaBase = 'https://storage.teste/bucket', falhar = null } = {}) {
    const objetos = new Map();
    const checar = op => { if (falhar && falhar(op)) throw new Error(`Storage indisponível (${op})`); };
    return {
        nome: 'memoria',
        urlPublicaBase,
        objetos,
        async enviar({ chave, caminho, tipo, publico }) {
            checar('enviar');
            objetos.set(chave, { dados: fs.readFileSync(caminho), tipo, publico: !!publico });
        },
        async info(chave) {
            checar('info');
            const o = objetos.get(chave);
            return o ? { tamanho: o.dados.length, tipo: o.tipo } : null;
        },
        async remover(chave) { checar('remover'); objetos.delete(chave); },
        async urlDownload(chave, nome, segundos) {
            checar('urlDownload');
            return `${urlPublicaBase}/${chave}?assinatura=teste&expira=${segundos}&nome=${encodeURIComponent(nome)}`;
        },
        async listar(prefixo) {
            return [...objetos.keys()].filter(k => k.startsWith(prefixo || '')).map(k => ({ chave: k, tamanho: objetos.get(k).dados.length }));
        }
    };
}

// ---------- API usada pelo app ----------
let driverAtual = null;
let driverS3 = null;

function configurado() {
    if (driverAtual) return true;
    const c = config();
    return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

function driver() {
    if (driverAtual) return driverAtual;
    if (!configurado()) {
        throw new ErroArmazenamento('O armazenamento de arquivos não está configurado. Fale com o suporte.');
    }
    if (!driverS3) driverS3 = criarDriverS3(config());
    return driverS3;
}

function definirDriver(d) { driverAtual = d || null; }

async function enviar({ chave, caminho, tipo, publico }) {
    if (!ehChave(chave)) throw new ErroArmazenamento('Chave de arquivo inválida.');
    if (publico !== ehPublica(chave)) throw new ErroArmazenamento('Visibilidade não confere com a pasta do arquivo.');
    const tamanho = fs.statSync(caminho).size;
    const d = driver();
    try {
        await d.enviar({ chave, caminho, tipo, publico });
        const info = await d.info(chave);
        if (!info || info.tamanho !== tamanho) throw new Error(`confirmação falhou (${info ? info.tamanho : 'ausente'} ≠ ${tamanho} bytes)`);
    } catch (err) {
        console.error(`Falha ao enviar ${chave} ao storage:`, err && err.message);
        throw new ErroArmazenamento('Não foi possível guardar o arquivo agora. Tente novamente em instantes.', err);
    }
    return { chave, tamanho };
}

async function remover(chave) {
    if (!ehChave(chave)) return false;
    try {
        await driver().remover(chave);
        return true;
    } catch (err) {
        console.error(`Não foi possível remover ${chave} do storage:`, err && err.message);
        return false;
    }
}

async function removerVarios(chaves) {
    await Promise.all((chaves || []).filter(ehChave).map(remover));
}

async function info(chave) {
    return ehChave(chave) ? driver().info(chave) : null;
}

async function urlDownload(chave, nomeArquivo) {
    if (!ehChave(chave)) throw new ErroArmazenamento('Chave de arquivo inválida.');
    return driver().urlDownload(chave, nomeArquivo, config().expiracao);
}

async function listar(prefixo) {
    return driver().listar(prefixo);
}

module.exports = {
    PASTAS,
    ErroArmazenamento,
    config,
    configurado,
    definirDriver,
    criarDriverS3,
    criarDriverMemoria,
    novaChave,
    ehChave,
    ehPublica,
    extensaoSegura,
    urlMidia,
    urlFoto,
    enviar,
    remover,
    removerVarios,
    info,
    urlDownload,
    listar
};
