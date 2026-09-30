const pool = require('../../config/db');

const Favorito = {

    async listarPorCliente(id_cliente) {
        const [rows] = await pool.query(
            `SELECT f.data_favorito,
                    p.id_produto, p.titulo_produto AS titulo, p.descricao_produto AS descricao,
                    p.preco_produto AS preco, p.imagem, p.tipo_produto
             FROM favorito f
             INNER JOIN produto p ON f.id_produto = p.id_produto
             WHERE f.id_cliente = ? AND p.status_produto = 'ativo'
             ORDER BY f.data_favorito DESC`,
            [id_cliente]
        );
        return rows;
    },

    async existe(id_cliente, id_produto) {
        const [rows] = await pool.query(
            `SELECT 1 FROM favorito WHERE id_cliente = ? AND id_produto = ? LIMIT 1`,
            [id_cliente, id_produto]
        );
        return rows.length > 0;
    },

    async adicionar(id_cliente, id_produto) {
        await pool.query(
            `INSERT IGNORE INTO favorito (id_cliente, id_produto) VALUES (?, ?)`,
            [id_cliente, id_produto]
        );
    },

    async remover(id_cliente, id_produto) {
        await pool.query(
            `DELETE FROM favorito WHERE id_cliente = ? AND id_produto = ?`,
            [id_cliente, id_produto]
        );
    }
};

module.exports = Favorito;
