// Webhook do Mercado Pago (server-to-server): sem sessão, sem login e sem CSRF.
// A notificação não é confiável em si: só dispara a conferência da order na API (conciliar).
const express = require('express');
const router  = express.Router();

const { validarAssinatura } = require('../helpers/assinaturaMercadoPago');
const { conciliar } = require('../helpers/conciliacaoPagamento');
const pagamento = require('../helpers/pagamento');
const Pagamento = require('../models/Pagamento');

function texto(valor, max) {
    const bruto = Array.isArray(valor) ? valor[0] : valor;
    const t = bruto == null ? '' : String(bruto).trim();
    return t ? t.slice(0, max) : null;
}

function avisarAmbiente(live_mode) {
    const producao = process.env.NODE_ENV === 'production';
    if (typeof live_mode === 'boolean' && live_mode !== producao) {
        console.warn(`⚠️  [pagamento] notificação ${live_mode ? 'de PRODUÇÃO' : 'de TESTE'} recebida com NODE_ENV=${process.env.NODE_ENV || 'development'}: confira as credenciais.`);
    }
}

router.post('/webhooks/mercadopago', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    const dados = corpo.data && typeof corpo.data === 'object' ? corpo.data : {};
    const dataId = texto(req.query['data.id'], 64);
    const xRequestId = texto(req.get('x-request-id'), 100);

    const assinatura = validarAssinatura({
        xSignature: req.get('x-signature'), xRequestId, dataId, secret: pagamento.webhookSecret()
    });
    const motivo = !assinatura.valida ? assinatura.motivo
        : (dataId && texto(dados.id, 64) !== dataId ? 'data_id_divergente' : null);
    if (motivo) {
        console.warn('⚠️  [pagamento] webhook recusado', JSON.stringify({ motivo, x_request_id: xRequestId }));
        return res.sendStatus(401);
    }

    const tipo = texto(corpo.type || req.query.type, 40);
    if (tipo !== 'order' || !dataId) return res.status(200).json({ recebido: true, ignorado: true });

    const acao = texto(corpo.action, 60);
    const live_mode = typeof corpo.live_mode === 'boolean' ? corpo.live_mode : null;
    avisarAmbiente(live_mode);

    if (await Pagamento.eventoJaProcessado(xRequestId, dataId).catch(() => false)) {
        return res.status(200).json({ recebido: true, duplicado: true });
    }

    let id_evento;
    try {
        id_evento = await Pagamento.registrarEvento({ x_request_id: xRequestId, tipo, acao, mp_resource_id: dataId, live_mode });
    } catch (err) {
        pagamento.logErro('webhook: registrar evento', err, { mp_order_id: dataId, x_request_id: xRequestId });
        return res.sendStatus(500);
    }

    try {
        const r = await conciliar(dataId, { live_mode });
        const resultado = r.resultado === 'desconhecido' || r.resultado === 'invalido' ? 'ignorado' : 'processado';
        await Pagamento.concluirEvento(id_evento, resultado, [r.resultado, r.alerta].filter(Boolean).join(' / '))
            .catch(err => pagamento.logErro('webhook: concluir evento', err, { id_evento }));
        return res.status(200).json({ recebido: true });
    } catch (err) {
        // Falha ao consultar o MP ou ao gravar: 500 faz o Mercado Pago reenviar mais tarde.
        pagamento.logErro('webhook: conciliar', err, { mp_order_id: dataId, x_request_id: xRequestId });
        await Pagamento.concluirEvento(id_evento, 'erro', `${err.name}: ${err.message}`).catch(() => {});
        return res.sendStatus(500);
    }
});

module.exports = router;
