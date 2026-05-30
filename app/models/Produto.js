const pool = require('../../config/db');

const Produto = {

    async listarTodos() {
        const [rows] = await pool.query(
            `SELECT p.id_produto, p.titulo_produto AS titulo, p.descricao_produto AS descricao,
                    p.preco_produto AS preco, p.tipo_produto, p.imagem, p.data_publicacao,
                    c.nome_categoria, u.nome_usuario AS nome_criador
             FROM produto p
             INNER JOIN categoria c ON p.id_categoria = c.id_categoria
             INNER JOIN usuario u   ON p.id_criador   = u.id_usuario
             WHERE p.status_produto = 'ativo'
             ORDER BY p.data_publicacao DESC`
        );
        return rows;
    },

    async listarPorCategoria(id_categoria) {
        const [rows] = await pool.query(
            `SELECT p.id_produto, p.titulo_produto AS titulo, p.descricao_produto AS descricao,
                    p.preco_produto AS preco, p.tipo_produto, p.imagem,
                    c.nome_categoria, u.nome_usuario AS nome_criador
             FROM produto p
             INNER JOIN categoria c ON p.id_categoria = c.id_categoria
             INNER JOIN usuario u   ON p.id_criador   = u.id_usuario
             WHERE p.status_produto = 'ativo' AND p.id_categoria = ?
             ORDER BY p.data_publicacao DESC`,
            [id_categoria]
        );
        return rows;
    },

    async buscarPorId(id) {
        const [rows] = await pool.query(
            `SELECT p.*, p.titulo_produto AS titulo, p.descricao_produto AS descricao,
                    p.preco_produto AS preco,
                    c.nome_categoria,
                    u.nome_usuario  AS nome_criador,
                    u.foto_usuario  AS foto_criador,
                    cr.media_avaliacoes,
                    cr.qtd_avaliacoes
             FROM produto p
             INNER JOIN categoria c ON p.id_categoria = c.id_categoria
             INNER JOIN usuario u   ON p.id_criador   = u.id_usuario
             LEFT  JOIN criador cr  ON p.id_criador   = cr.id_usuario
             WHERE p.id_produto = ? AND p.status_produto = 'ativo'`,
            [id]
        );
        return rows[0];
    },

    async listarPorCriador(id_criador) {
        const [rows] = await pool.query(
            `SELECT p.id_produto, p.titulo_produto AS titulo, p.preco_produto AS preco,
                    p.tipo_produto, p.status_produto, p.imagem, p.data_publicacao,
                    c.nome_categoria
             FROM produto p
             INNER JOIN categoria c ON p.id_categoria = c.id_categoria
             WHERE p.id_criador = ?
             ORDER BY p.data_publicacao DESC`,
            [id_criador]
        );
        return rows;
    },

    async criar(dados) {
        const { id_criador, id_categoria, titulo, descricao, preco, tipo_produto, imagem, arquivo } = dados;
        const [result] = await pool.query(
            `INSERT INTO produto (id_criador, id_categoria, titulo_produto, descricao_produto,
                                  preco_produto, tipo_produto, imagem, arquivo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id_criador, id_categoria, titulo, descricao, preco, tipo_produto, imagem || null, arquivo || null]
        );
        return result.insertId;
    },

    async atualizar(id, dados) {
        const { titulo, descricao, preco, tipo_produto, id_categoria, imagem } = dados;
        const [result] = await pool.query(
            `UPDATE produto SET titulo_produto = ?, descricao_produto = ?, preco_produto = ?,
                                tipo_produto = ?, id_categoria = ?, imagem = ?
             WHERE id_produto = ?`,
            [titulo, descricao, preco, tipo_produto, id_categoria, imagem, id]
        );
        return result.affectedRows;
    },

    async atualizarStatus(id, status) {
        const [result] = await pool.query(
            `UPDATE produto SET status_produto = ? WHERE id_produto = ?`,
            [status, id]
        );
        return result.affectedRows;
    },

    async excluir(id_produto, id_criador) {
        const [[produto]] = await pool.query(
            `SELECT id_criador FROM produto WHERE id_produto = ?`, [id_produto]
        );
        if (!produto || Number(produto.id_criador) !== Number(id_criador)) {
            throw new Error('Produto não encontrado ou sem permissão.');
        }
        await pool.query(`DELETE FROM item_carrinho WHERE id_produto = ?`, [id_produto]);
        await pool.query(`DELETE FROM avaliacao_produto WHERE id_produto = ?`, [id_produto]);
        await pool.query(`DELETE FROM favorito WHERE id_produto = ?`, [id_produto]);
        await pool.query(`DELETE ip FROM item_pedido ip WHERE ip.id_produto = ?`, [id_produto]);
        const [result] = await pool.query(`DELETE FROM produto WHERE id_produto = ?`, [id_produto]);
        return result.affectedRows;
    }
};

module.exports = Produto;
