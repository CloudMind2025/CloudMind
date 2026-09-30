const pool = require('../../config/db');

const Criador = {

    async criar(id_usuario, cpf, bio = null) {
        const [result] = await pool.query(
            `INSERT INTO criador (id_usuario, cpf, bio_criador) VALUES (?, ?, ?)`,
            [id_usuario, cpf || null, bio]
        );
        return result.affectedRows;
    },

    async cpfEmUso(cpf) {
        const [rows] = await pool.query(`SELECT 1 FROM criador WHERE cpf = ? LIMIT 1`, [cpf]);
        return rows.length > 0;
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

    async buscarPerfilPublico(id) {
        const consulta = capa => pool.query(
            `SELECT u.id_usuario, u.nome_usuario AS nome, u.foto_usuario AS foto,
                    u.data_cad_usuario AS desde, u.status_usuario AS status,
                    c.bio_criador AS bio, ${capa ? 'c.capa_criador' : 'NULL'} AS capa
             FROM usuario u INNER JOIN criador c ON u.id_usuario = c.id_usuario
             WHERE u.id_usuario = ?`,
            [id]
        );
        try {
            const [rows] = await consulta(true);
            return rows[0];
        } catch (err) {
            if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
            console.error('Capa da loja indisponível:', err.message);
            const [rows] = await consulta(false);
            return rows[0];
        }
    },

    async atualizarCapa(id, capa) {
        const [result] = await pool.query(
            `UPDATE criador SET capa_criador = ? WHERE id_usuario = ?`,
            [capa, id]
        );
        return result.affectedRows;
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
