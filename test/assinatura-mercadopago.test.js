const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { WebhookSignatureValidator } = require('mercadopago');
const { validarAssinatura, montarManifest } = require('../app/helpers/assinaturaMercadoPago');

const SECRET = 'segredo-de-teste-do-webhook';
const hmac = (manifest, secret = SECRET) => crypto.createHmac('sha256', secret).update(manifest).digest('hex');

test('vetor conhecido: manifest documentado e HMAC-SHA256 em hex', () => {
    const manifest = 'id:ord01jyh1z1yjn4hz8j3q0rb3yp6d;request-id:bb56a2f1-6aae-46ac-982e-9dcd3581d08e;ts:1742505638683;';
    assert.equal(montarManifest({ dataId: 'ORD01JYH1Z1YJN4HZ8J3Q0RB3YP6D', xRequestId: 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e', ts: '1742505638683' }), manifest);
    const r = validarAssinatura({
        xSignature: `ts=1742505638683,v1=${hmac(manifest)}`,
        xRequestId: 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e',
        dataId: 'ORD01JYH1Z1YJN4HZ8J3Q0RB3YP6D',
        secret: SECRET
    });
    assert.deepEqual(r, { valida: true, motivo: null });
});

test('data.id em maiúsculas é convertido para minúsculas (como manda a documentação)', () => {
    const v1 = hmac('id:ordabc;request-id:req-1;ts:100;');
    assert.equal(validarAssinatura({ xSignature: `ts=100,v1=${v1}`, xRequestId: 'req-1', dataId: 'ORDABC', secret: SECRET }).valida, true);
    // quem assinou com o id em maiúsculas não passa
    const errado = hmac('id:ORDABC;request-id:req-1;ts:100;');
    assert.equal(validarAssinatura({ xSignature: `ts=100,v1=${errado}`, xRequestId: 'req-1', dataId: 'ORDABC', secret: SECRET }).valida, false);
});

test('partes ausentes (data.id ou x-request-id) saem do manifest', () => {
    assert.equal(montarManifest({ dataId: null, xRequestId: 'req-1', ts: '5' }), 'request-id:req-1;ts:5;');
    assert.equal(montarManifest({ dataId: 'X1', xRequestId: null, ts: '5' }), 'id:x1;ts:5;');
    const v1 = hmac('id:x1;ts:5;');
    assert.equal(validarAssinatura({ xSignature: `ts=5,v1=${v1}`, xRequestId: undefined, dataId: 'X1', secret: SECRET }).valida, true);
});

test('mesmo resultado do validador oficial do SDK (ids já em minúsculas)', () => {
    const casos = [
        { dataId: 'ordtst01ks5aj6htk2hrq3xj3c2jckp9', xRequestId: 'a1b2', ts: '1704908010' },
        { dataId: '123456', xRequestId: 'c3d4-e5', ts: '1742505638683' }
    ];
    for (const c of casos) {
        const xSignature = `ts=${c.ts},v1=${hmac(montarManifest(c))}`;
        assert.doesNotThrow(() => WebhookSignatureValidator.validate({ xSignature, xRequestId: c.xRequestId, dataId: c.dataId, secret: SECRET }));
        assert.equal(validarAssinatura({ xSignature, xRequestId: c.xRequestId, dataId: c.dataId, secret: SECRET }).valida, true);
    }
});

test('recusas: secret errada, assinatura ausente, header malformado, v1 de outro tamanho — sem lançar', () => {
    const manifest = 'id:ord1;request-id:r;ts:9;';
    const base = { xRequestId: 'r', dataId: 'ORD1', secret: SECRET };
    assert.equal(validarAssinatura({ ...base, xSignature: `ts=9,v1=${hmac(manifest, 'outra')}` }).motivo, 'assinatura_divergente');
    assert.equal(validarAssinatura({ ...base, xSignature: undefined }).motivo, 'assinatura_ausente');
    assert.equal(validarAssinatura({ ...base, xSignature: '' }).motivo, 'assinatura_ausente');
    assert.equal(validarAssinatura({ ...base, xSignature: 'lixo' }).motivo, 'ts_invalido');
    assert.equal(validarAssinatura({ ...base, xSignature: `v1=${hmac(manifest)}` }).motivo, 'ts_invalido');
    assert.equal(validarAssinatura({ ...base, xSignature: 'ts=9,v1=abc' }).motivo, 'v1_invalido');
    assert.equal(validarAssinatura({ ...base, xSignature: `ts=9,v1=${'z'.repeat(64)}` }).motivo, 'v1_invalido');
    assert.equal(validarAssinatura({ ...base, secret: '', xSignature: `ts=9,v1=${hmac(manifest)}` }).motivo, 'secret_ausente');
    // data.id trocado depois de assinado
    assert.equal(validarAssinatura({ ...base, dataId: 'ORD2', xSignature: `ts=9,v1=${hmac(manifest)}` }).valida, false);
    // ts trocado
    assert.equal(validarAssinatura({ ...base, xSignature: `ts=10,v1=${hmac(manifest)}` }).valida, false);
});

test('header com espaços e ordem diferente é aceito', () => {
    const v1 = hmac('id:ord1;request-id:r;ts:9;');
    assert.equal(validarAssinatura({ xSignature: ` v1=${v1} , ts=9 `, xRequestId: 'r', dataId: 'ORD1', secret: SECRET }).valida, true);
});
