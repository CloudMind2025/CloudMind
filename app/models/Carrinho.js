const pool = require('../../config/db');

const Carrinho = {

    async buscarOuCriar(id_cliente) {
        let [rows] = await pool.query(
            `SELECT * FROM carrinho WHERE id_cliente = ? AND status_carrinho = 'aberto'`,
            [id_cliente]
        );
        if (rows.length === 0) {
            const [result] = await pool.query(
                `INSERT INTO carrinho (id_cliente) VALUES (?)`,
                [id_cliente]
            );
            const [novo] = await pool.query(
                `SELECT * FROM carrinho WHERE id_carrinho = ?`,
                [result.insertId]
            );
            return novo[0];
        }
        return rows[0];
    },

    async listarItens(id_carrinho, conn = pool) {
        const [rows] = await conn.query(
            `SELECT ic.id_produto, ic.quantidade, ic.preco_unitario,
                    p.titulo_produto AS titulo, p.imagem, p.tipo_produto,
                    p.status_produto, p.preco_produto AS preco_atual, p.id_criador
             FROM item_carrinho ic
             INNER JOIN produto p ON ic.id_produto = p.id_produto
             WHERE ic.id_carrinho = ?`,
            [id_carrinho]
        );
        return rows;
    },

    async adicionarItem(id_carrinho, id_produto, preco_unitario) {
        await pool.query(
            `INSERT INTO item_carrinho (id_carrinho, id_produto, quantidade, preco_unitario)
             VALUES (?, ?, 1, ?)
             ON DUPLICATE KEY UPDATE
               quantidade = 1,
               preco_unitario = VALUES(preco_unitario)`,
            [id_carrinho, id_produto, preco_unitario]
        );
    },

    async contemProduto(id_cliente, id_produto) {
        const [rows] = await pool.query(
            `SELECT 1 FROM item_carrinho ic
             INNER JOIN carrinho c ON ic.id_carrinho = c.id_carrinho
             WHERE c.id_cliente = ? AND c.status_carrinho = 'aberto' AND ic.id_produto = ?
             LIMIT 1`,
            [id_cliente, id_produto]
        );
        return rows.length > 0;
    },

    async removerItem(id_carrinho, id_produto) {
        await pool.query(
            `DELETE FROM item_carrinho WHERE id_carrinho = ? AND id_produto = ?`,
            [id_carrinho, id_produto]
        );
    },

    async limpar(id_carrinho) {
        await pool.query(
            `DELETE FROM item_carrinho WHERE id_carrinho = ?`,
            [id_carrinho]
        );
    },

    async definirCupom(id_carrinho, id_cupom) {
        await pool.query(`UPDATE carrinho SET id_cupom = ? WHERE id_carrinho = ?`, [id_cupom || null, id_carrinho]);
    },

    async finalizar(id_carrinho) {
        await pool.query(
            `UPDATE carrinho SET status_carrinho = 'finalizado' WHERE id_carrinho = ?`,
            [id_carrinho]
        );
    }
};

module.exports = Carrinho;
