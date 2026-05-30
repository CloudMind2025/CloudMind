// ============================================================
//  CloudMind — Model: Favorito
//  Arquivo: models/Favorito.js
// ============================================================

const pool = require('../../config/db');

const Favorito = {

    // Lista favoritos do cliente  (página /favoritos)
    async listarPorCliente(id_cliente) {
        const [rows] = await pool.query(
            `SELECT f.id_favorito, f.data_favoritado,
                    p.id_produto, p.titulo, p.preco, p.imagem, p.tipo_produto
             FROM favorito f
             INNER JOIN produto p ON f.id_produto = p.id_produto
             WHERE f.id_cliente = ? AND p.status_produto = 'ativo'
             ORDER BY f.data_favoritado DESC`,
            [id_cliente]
        );
        return rows;
    },

    // Adiciona produto aos favoritos
    async adicionar(id_cliente, id_produto) {
        await pool.query(
            `INSERT IGNORE INTO favorito (id_cliente, id_produto) VALUES (?, ?)`,
            [id_cliente, id_produto]
        );
    },

    // Remove produto dos favoritos (pode deletar — não é exclusão lógica)
    async remover(id_cliente, id_produto) {
        await pool.query(
            `DELETE FROM favorito WHERE id_cliente = ? AND id_produto = ?`,
            [id_cliente, id_produto]
        );
    }
};

module.exports = Favorito;
