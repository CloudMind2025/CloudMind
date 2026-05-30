const pool = require('../../config/db');

const Pedido = {

    async listarPorCliente(id_cliente) {
        const [rows] = await pool.query(
            `SELECT id_pedido, data_pedido, comissao, status_pedido AS status
             FROM pedido WHERE id_cliente = ? ORDER BY data_pedido DESC`,
            [id_cliente]
        );
        return rows;
    },

    async buscarComItens(id_pedido) {
        const [pedido] = await pool.query(`SELECT * FROM pedido WHERE id_pedido = ?`, [id_pedido]);
        const [itens]  = await pool.query(
            `SELECT ip.*, p.titulo_produto AS titulo, p.imagem, p.tipo_produto
             FROM item_pedido ip INNER JOIN produto p ON ip.id_produto = p.id_produto
             WHERE ip.id_pedido = ?`,
            [id_pedido]
        );
        return { pedido: pedido[0], itens };
    },

    async listarDownloads(id_cliente) {
        const [rows] = await pool.query(
            `SELECT p.titulo_produto AS titulo, p.imagem, p.arquivo, p.tipo_produto, pe.data_pedido
             FROM item_pedido ip
             INNER JOIN pedido  pe ON ip.id_pedido  = pe.id_pedido
             INNER JOIN produto p  ON ip.id_produto = p.id_produto
             WHERE pe.id_cliente = ? AND pe.status_pedido = 'pago'
             ORDER BY pe.data_pedido DESC`,
            [id_cliente]
        );
        return rows;
    },

    async criar(id_cliente, valor_total) {
        const [result] = await pool.query(
            `INSERT INTO pedido (id_cliente, comissao) VALUES (?, ?)`,
            [id_cliente, valor_total]
        );
        return result.insertId;
    },

    async adicionarItem(id_pedido, id_produto, quantidade, preco_unitario) {
        await pool.query(
            `INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario) VALUES (?, ?, ?, ?)`,
            [id_pedido, id_produto, quantidade, preco_unitario]
        );
    },

    async cancelar(id_pedido) {
        const [result] = await pool.query(
            `UPDATE pedido SET status_pedido = 'cancelado' WHERE id_pedido = ?`,
            [id_pedido]
        );
        return result.affectedRows;
    }
};

module.exports = Pedido;
