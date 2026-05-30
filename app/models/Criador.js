const pool = require('../../config/db');

const Criador = {

    async criar(id_usuario, cpf, bio = null) {
        const [result] = await pool.query(
            `INSERT INTO criador (id_usuario, cpf, bio_criador) VALUES (?, ?, ?)`,
            [id_usuario, cpf || null, bio]
        );
        return result.affectedRows;
    },

    async buscarPorId(id) {
        const [rows] = await pool.query(
            `SELECT u.id_usuario, u.nome_usuario AS nome, u.email_usuario AS email,
                    u.status_usuario AS status,
                    c.bio_criador, c.media_avaliacoes, c.qtd_avaliacoes, c.data_ultimo_ped
             FROM usuario u INNER JOIN criador c ON u.id_usuario = c.id_usuario
             WHERE u.id_usuario = ?`,
            [id]
        );
        return rows[0];
    },

    async listarTodos() {
        const [rows] = await pool.query(
            `SELECT u.id_usuario, u.nome_usuario AS nome, u.email_usuario AS email,
                    u.status_usuario AS status, c.media_avaliacoes, c.qtd_avaliacoes
             FROM usuario u INNER JOIN criador c ON u.id_usuario = c.id_usuario
             WHERE u.status_usuario = 'ativo' ORDER BY u.nome_usuario`
        );
        return rows;
    },

    async atualizarBio(id, bio) {
        const [result] = await pool.query(
            `UPDATE criador SET bio_criador = ? WHERE id_usuario = ?`,
            [bio, id]
        );
        return result.affectedRows;
    }
};

module.exports = Criador;
