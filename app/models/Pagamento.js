const pool = require('../../config/db');

const ATIVOS = ['created', 'processing', 'action_required'];

function normalizar(row) {
    if (!row) return undefined;
    return {
        ...row,
        valor_centavos: Number(row.valor_centavos),
        valor_pago_centavos: row.valor_pago_centavos == null ? null : Number(row.valor_pago_centavos),
        tentativa: Number(row.tentativa)
    };
}

const Pagamento = {

    ATIVOS,

    // Uma linha por tentativa (order no Mercado Pago). A chave de idempotência é gravada
    // aqui, antes de qualquer chamada ao MP, para que um retry use sempre a mesma.
    async criarTentativa(conn, { id_pedido, tentativa, chave, external_reference, valor_centavos }) {
        const [result] = await conn.query(
            `INSERT INTO pagamento (id_pedido, tentativa, chave_idempotencia, external_reference, valor_centavos, moeda)
             VALUES (?, ?, ?, ?, ?, 'BRL')`,
            [id_pedido, tentativa, chave, external_reference, valor_centavos]
        );
        return result.insertId;
    },

    async buscarPorId(id_pagamento) {
        const [rows] = await pool.query(`SELECT * FROM pagamento WHERE id_pagamento = ?`, [id_pagamento]);
        return normalizar(rows[0]);
    },

    async buscarPorOrderId(mp_order_id) {
        const [rows] = await pool.query(`SELECT * FROM pagamento WHERE mp_order_id = ?`, [mp_order_id]);
        return normalizar(rows[0]);
    },

    // Tentativa de um pedido do próprio cliente (retorno do Checkout Pro).
    async buscarDoCliente({ mp_order_id, id_pedido, id_cliente }) {
        const [rows] = mp_order_id
            ? await pool.query(
                `SELECT pg.*, pe.status_pedido FROM pagamento pg INNER JOIN pedido pe ON pe.id_pedido = pg.id_pedido
                 WHERE pg.mp_order_id = ? AND pe.id_cliente = ?`,
                [mp_order_id, id_cliente])
            : await pool.query(
                `SELECT pg.*, pe.status_pedido FROM pagamento pg INNER JOIN pedido pe ON pe.id_pedido = pg.id_pedido
                 WHERE pg.id_pedido = ? AND pe.id_cliente = ? ORDER BY pg.tentativa DESC LIMIT 1`,
                [id_pedido, id_cliente]);
        return normalizar(rows[0]);
    },

    async ultimaDoPedido(id_pedido) {
        const [rows] = await pool.query(
            `SELECT * FROM pagamento WHERE id_pedido = ? ORDER BY tentativa DESC LIMIT 1`,
            [id_pedido]
        );
        return normalizar(rows[0]);
    },

    async listarDoPedido(conn, id_pedido) {
        const [rows] = await conn.query(
            `SELECT * FROM pagamento WHERE id_pedido = ? ORDER BY tentativa FOR UPDATE`,
            [id_pedido]
        );
        return rows.map(normalizar);
    },

    async registrarOrder(id_pagamento, { mp_order_id, checkout_url, status_mp, status_detail_mp, expira_em }) {
        await pool.query(
            `UPDATE pagamento SET mp_order_id = ?, checkout_url = ?, status_mp = ?, status_detail_mp = ?,
                                  expira_em = ?, ultimo_erro = NULL
             WHERE id_pagamento = ? AND (mp_order_id IS NULL OR mp_order_id = ?)`,
            [mp_order_id, checkout_url, status_mp || null, status_detail_mp || null, expira_em || null, id_pagamento, mp_order_id]
        );
    },

    async registrarErro(id_pagamento, mensagem) {
        await pool.query(
            `UPDATE pagamento SET ultimo_erro = ? WHERE id_pagamento = ?`,
            [String(mensagem || '').slice(0, 255), id_pagamento]
        );
    },

    async atualizarEstado(conn, id_pagamento, dados) {
        await conn.query(
            `UPDATE pagamento SET status_mp = ?, status_detail_mp = ?, mp_payment_id = COALESCE(?, mp_payment_id),
                                  metodo_pagamento = COALESCE(?, metodo_pagamento), valor_pago_centavos = ?,
                                  live_mode = COALESCE(?, live_mode), ultimo_erro = ?
             WHERE id_pagamento = ?`,
            [dados.status_mp, dados.status_detail_mp, dados.mp_payment_id, dados.metodo_pagamento,
             dados.valor_pago_centavos, dados.live_mode, dados.ultimo_erro, id_pagamento]
        );
    },

    async resumoDoPedido(id_pedido) {
        const [rows] = await pool.query(
            `SELECT tentativa, status_mp, status_detail_mp, metodo_pagamento, expira_em, ultimo_erro
             FROM pagamento WHERE id_pedido = ? ORDER BY tentativa DESC LIMIT 1`,
            [id_pedido]
        );
        return rows[0] || null;
    },

    // ---------- Eventos (notificações recebidas e alertas) ----------
    async registrarEvento({ x_request_id = null, tipo = null, acao = null, mp_resource_id = null, live_mode = null,
                            resultado = 'recebido', detalhe = null }) {
        const [result] = await pool.query(
            `INSERT INTO pagamento_evento (x_request_id, tipo, acao, mp_resource_id, live_mode, resultado, detalhe)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [x_request_id, tipo, acao, mp_resource_id, live_mode, resultado, detalhe == null ? null : String(detalhe).slice(0, 255)]
        );
        return result.insertId;
    },

    async concluirEvento(id_evento, resultado, detalhe = null) {
        await pool.query(
            `UPDATE pagamento_evento SET resultado = ?, detalhe = ? WHERE id_evento = ?`,
            [resultado, detalhe == null ? null : String(detalhe).slice(0, 255), id_evento]
        );
    },

    async eventoJaProcessado(x_request_id, mp_resource_id) {
        if (!x_request_id) return false;
        const [rows] = await pool.query(
            `SELECT 1 FROM pagamento_evento
             WHERE x_request_id = ? AND mp_resource_id = ? AND resultado = 'processado' LIMIT 1`,
            [x_request_id, mp_resource_id]
        );
        return rows.length > 0;
    }
};

module.exports = Pagamento;
