const pool = require('../../config/db');

const PerguntaProduto = {

    async listarPorProduto(id_produto, limite = 50) {
        const [rows] = await pool.query(
            `SELECT pp.id_pergunta, pp.pergunta, pp.resposta, pp.data_pergunta, pp.data_resposta,
                    u.nome_usuario AS nome_usuario
             FROM pergunta_produto pp
             INNER JOIN usuario u ON pp.id_usuario = u.id_usuario
             WHERE pp.id_produto = ?
             ORDER BY pp.data_pergunta DESC
             LIMIT ?`,
            [id_produto, limite]
        );
        return rows;
    },

    async criar(id_produto, id_usuario, pergunta) {
        const [result] = await pool.query(
            `INSERT INTO pergunta_produto (id_produto, id_usuario, pergunta) VALUES (?, ?, ?)`,
            [id_produto, id_usuario, pergunta]
        );
        return result.insertId;
    },

    async responder(id_pergunta, id_criador, resposta) {
        const [result] = await pool.query(
            `UPDATE pergunta_produto pp
             INNER JOIN produto p ON pp.id_produto = p.id_produto
             SET pp.resposta = ?, pp.data_resposta = NOW()
             WHERE pp.id_pergunta = ? AND p.id_criador = ?`,
            [resposta, id_pergunta, id_criador]
        );
        return result.affectedRows;
    }
};

module.exports = PerguntaProduto;
