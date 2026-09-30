// Validação da assinatura dos Webhooks do Mercado Pago (header x-signature: "ts=...,v1=...").
// Manifest documentado: id:[data.id];request-id:[x-request-id];ts:[ts];
// com data.id em minúsculas e omitindo as partes que não vierem na notificação.
const crypto = require('crypto');

function texto(valor) {
    const bruto = Array.isArray(valor) ? valor[0] : valor;
    const t = bruto == null ? '' : String(bruto).trim();
    return t || null;
}

function lerCabecalho(xSignature) {
    const partes = {};
    String(xSignature || '').split(',').forEach(parte => {
        const i = parte.indexOf('=');
        if (i < 1) return;
        const chave = parte.slice(0, i).trim().toLowerCase();
        const valor = parte.slice(i + 1).trim();
        if (valor && !(chave in partes)) partes[chave] = valor;
    });
    return { ts: partes.ts || null, v1: partes.v1 || null };
}

function montarManifest({ dataId, xRequestId, ts }) {
    let manifest = '';
    if (dataId) manifest += `id:${dataId.toLowerCase()};`;
    if (xRequestId) manifest += `request-id:${xRequestId};`;
    return `${manifest}ts:${ts};`;
}

// Retorna { valida: boolean, motivo } — nunca lança por entrada malformada.
function validarAssinatura({ xSignature, xRequestId, dataId, secret }) {
    const falha = motivo => ({ valida: false, motivo });
    if (!secret) return falha('secret_ausente');
    const cabecalho = texto(xSignature);
    if (!cabecalho) return falha('assinatura_ausente');
    const { ts, v1 } = lerCabecalho(cabecalho);
    if (!ts || !/^\d{1,20}$/.test(ts)) return falha('ts_invalido');
    if (!v1 || !/^[0-9a-f]{64}$/i.test(v1)) return falha('v1_invalido');

    const manifest = montarManifest({ dataId: texto(dataId), xRequestId: texto(xRequestId), ts });
    const esperado = crypto.createHmac('sha256', String(secret)).update(manifest).digest();
    const recebido = Buffer.from(v1, 'hex');
    if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
        return falha('assinatura_divergente');
    }
    return { valida: true, motivo: null };
}

module.exports = { validarAssinatura, montarManifest, lerCabecalho };
