const pool = require('../../config/db');

function montarResumo(rows) {
    const distribuicao = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let total = 0;
    let soma  = 0;
    rows.forEach(r => {
        const qtd = Number(r.qtd);
        distribuicao[r.nota] = qtd;
        total += qtd;
        soma  += qtd * r.nota;
    });
    return { total, media: total ? soma / total : 0, distribuicao };
}

const AvaliacaoProduto = {

    async resumoPorProduto(id_produto) {
        const [rows] = await pool.query(
            `SELECT nota, COUNT(*) AS qtd
             FROM avaliacao_produto
             WHERE id_produto = ? AND nota BETWEEN 1 AND 5
             GROUP BY nota`,
            [id_produto]
        );
        return montarResumo(rows);
    },

    async resumoPorCriador(id_criador) {
        const [rows] = await pool.query(
            `SELECT a.nota, COUNT(*) AS qtd
             FROM avaliacao_produto a
             INNER JOIN produto p ON a.id_produto = p.id_produto
             WHERE p.id_criador = ? AND a.nota BETWEEN 1 AND 5
             GROUP BY a.nota`,
            [id_criador]
        );
        return montarResumo(rows);
    },

    async listarPorCriador(id_criador, limite = 6) {
        const [rows] = await pool.query(
            `SELECT a.id_avaliacao, a.nota, a.comentario, a.data_avaliacao,
                    p.id_produto, p.titulo_produto AS titulo_produto, p.status_produto,
                    u.nome_usuario AS nome_cliente,
                    EXISTS (
                        SELECT 1 FROM item_pedido ip
                        INNER JOIN pedido pe ON ip.id_pedido = pe.id_pedido
                        WHERE ip.id_produto = a.id_produto
                          AND pe.id_cliente = a.id_cliente
                          AND pe.status_pedido = 'pago'
                    ) AS compra_verificada
             FROM avaliacao_produto a
             INNER JOIN produto p ON a.id_produto = p.id_produto
             INNER JOIN usuario u ON a.id_cliente = u.id_usuario
             WHERE p.id_criador = ? AND a.nota BETWEEN 1 AND 5
             ORDER BY a.data_avaliacao DESC
             LIMIT ?`,
            [id_criador, limite]
        );
        return rows;
    },

    async listarPorProduto(id_produto, limite = 10) {
        const [rows] = await pool.query(
            `SELECT a.id_avaliacao, a.nota, a.comentario, a.data_avaliacao,
                    u.nome_usuario AS nome_cliente,
                    EXISTS (
                        SELECT 1 FROM item_pedido ip
                        INNER JOIN pedido pe ON ip.id_pedido = pe.id_pedido
                        WHERE ip.id_produto = a.id_produto
                          AND pe.id_cliente = a.id_cliente
                          AND pe.status_pedido = 'pago'
                    ) AS compra_verificada
             FROM avaliacao_produto a
             INNER JOIN usuario u ON a.id_cliente = u.id_usuario
             WHERE a.id_produto = ?
             ORDER BY a.data_avaliacao DESC
             LIMIT ?`,
            [id_produto, limite]
        );
        return rows;
    },

    async recentesDoCriador(id_criador, limite = 5) {
        const [rows] = await pool.query(
            `SELECT a.nota, a.comentario, a.data_avaliacao,
                    p.id_produto, p.titulo_produto AS titulo,
                    u.nome_usuario AS nome_cliente
             FROM avaliacao_produto a
             INNER JOIN produto p ON a.id_produto = p.id_produto
             INNER JOIN usuario u ON a.id_cliente = u.id_usuario
             WHERE p.id_criador = ?
             ORDER BY a.data_avaliacao DESC
             LIMIT ?`,
            [id_criador, limite]
        );
        return rows;
    },

    async buscarDoCliente(id_cliente, id_produto) {
        const [rows] = await pool.query(
            `SELECT nota, comentario FROM avaliacao_produto
             WHERE id_cliente = ? AND id_produto = ?
             ORDER BY data_avaliacao DESC LIMIT 1`,
            [id_cliente, id_produto]
        );
        return rows[0];
    },

    async salvar(id_cliente, id_produto, nota, comentario) {
        if (await this.buscarDoCliente(id_cliente, id_produto)) {
            await pool.query(
                `UPDATE avaliacao_produto SET nota = ?, comentario = ?, data_avaliacao = NOW()
                 WHERE id_cliente = ? AND id_produto = ?`,
                [nota, comentario || null, id_cliente, id_produto]
            );
            return 'atualizada';
        }

        await pool.query(
            `INSERT INTO avaliacao_produto (id_cliente, id_produto, nota, comentario) VALUES (?, ?, ?, ?)`,
            [id_cliente, id_produto, nota, comentario || null]
        );
        await pool.query(
            `UPDATE cliente SET avaliacoes_feitas = avaliacoes_feitas + 1 WHERE id_usuario = ?`,
            [id_cliente]
        );
        return 'criada';
    }
};

module.exports = AvaliacaoProduto;
