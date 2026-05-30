const pool = require('../../config/db');

const Suporte = {

    async criar({ id_usuario, tipo_chamada, descricao }) {
        const [result] = await pool.query(
            `INSERT INTO suporte (id_usuario, tipo_chamada, descricao_chamada) VALUES (?, ?, ?)`,
            [id_usuario, tipo_chamada, descricao]
        );
        return result.insertId;
    },

    async listarTodos() {
        const [rows] = await pool.query(
            `SELECT s.id_chamada, s.tipo_chamada, s.descricao_chamada AS descricao,
                    s.status_chamada AS status, s.data_chamada, s.data_fechamento,
                    COALESCE(u.nome_usuario, 'Anônimo') AS nome_usuario
             FROM suporte s LEFT JOIN usuario u ON s.id_usuario = u.id_usuario
             ORDER BY s.data_chamada DESC`
        );
        return rows;
    },

    async listarPorUsuario(id_usuario) {
        const [rows] = await pool.query(
            `SELECT id_chamada, tipo_chamada, descricao_chamada AS descricao,
                    status_chamada AS status, data_chamada, data_fechamento
             FROM suporte WHERE id_usuario = ? ORDER BY data_chamada DESC`,
            [id_usuario]
        );
        return rows;
    },

    async fechar(id_chamada) {
        const [result] = await pool.query(
            `UPDATE suporte SET status_chamada = 'fechado', data_fechamento = NOW()
             WHERE id_chamada = ?`,
            [id_chamada]
        );
        return result.affectedRows;
    },

    async atualizarStatus(id_chamada, novoStatus) {
        const [result] = await pool.query(
            `UPDATE suporte SET status_chamada = ? WHERE id_chamada = ?`,
            [novoStatus, id_chamada]
        );
        return result.affectedRows;
    },

    async buscarPorId(id_chamada) {
        const [rows] = await pool.query(
            `SELECT * FROM suporte WHERE id_chamada = ?`,
            [id_chamada]
        );
        return rows[0] || null;
    },

    async excluir(id_chamada) {
        const [result] = await pool.query(
            `DELETE FROM suporte WHERE id_chamada = ?`,
            [id_chamada]
        );
        return result.affectedRows;
    }
};

module.exports = Suporte;
