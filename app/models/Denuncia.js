const pool = require('../../config/db');

const Denuncia = {

    async criar({ id_usuario, id_produto, id_criador, motivo, descricao }) {
        const [result] = await pool.query(
            `INSERT INTO denuncia (id_cliente, id_produto, id_criador, motivo_denuncia, descricao_denuncia)
             VALUES (?, ?, ?, ?, ?)`,
            [id_usuario, id_produto || null, id_criador || null, motivo, descricao]
        );
        return result.insertId;
    },

    async listarTodas() {
        const [rows] = await pool.query(
            `SELECT d.id_denuncia, d.id_cliente, d.motivo_denuncia AS motivo,
                    d.descricao_denuncia AS descricao,
                    d.status_denuncia AS status, d.data_denuncia,
                    u.nome_usuario   AS denunciante,
                    p.titulo_produto AS produto_denunciado,
                    uc.nome_usuario  AS criador_denunciado
             FROM denuncia d
             LEFT  JOIN usuario u  ON d.id_cliente = u.id_usuario
             LEFT  JOIN produto p  ON d.id_produto = p.id_produto
             LEFT  JOIN usuario uc ON d.id_criador  = uc.id_usuario
             ORDER BY d.data_denuncia DESC`
        );
        return rows;
    },

    async buscarPorId(id_denuncia) {
        const [rows] = await pool.query(
            `SELECT * FROM denuncia WHERE id_denuncia = ?`,
            [id_denuncia]
        );
        return rows[0] || null;
    },

    async arquivar(id_denuncia) {
        const [result] = await pool.query(
            `UPDATE denuncia SET status_denuncia = 'resolvida' WHERE id_denuncia = ?`,
            [id_denuncia]
        );
        return result.affectedRows;
    }
};

module.exports = Denuncia;
