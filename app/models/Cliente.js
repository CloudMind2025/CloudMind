const pool = require('../../config/db');

const Cliente = {

    async criar(id_usuario, cpf) {
        const [result] = await pool.query(
            `INSERT INTO cliente (id_usuario, CPF) VALUES (?, ?)`,
            [id_usuario, cpf]
        );
        return result.affectedRows;
    },

    async buscarPorId(id) {
        const [rows] = await pool.query(
            `SELECT u.id_usuario, u.nome_usuario AS nome, u.email_usuario AS email,
                    u.data_cad_usuario AS data_cadastro, u.status_usuario AS status,
                    c.CPF, c.avaliacoes_feitas, c.data_ultimo_ped
             FROM usuario u INNER JOIN cliente c ON u.id_usuario = c.id_usuario
             WHERE u.id_usuario = ?`,
            [id]
        );
        return rows[0];
    },

    async buscarOuCriar(id_usuario) {
        const cliente = await this.buscarPorId(id_usuario);
        if (cliente) return cliente;

        const cpfFake = String(id_usuario).padStart(11, '0');
        await this.criar(id_usuario, cpfFake);
        return this.buscarPorId(id_usuario);
    },

    async listarTodos() {
        const [rows] = await pool.query(
            `SELECT u.id_usuario, u.nome_usuario AS nome, u.email_usuario AS email,
                    u.status_usuario AS status, c.CPF, c.data_ultimo_ped
             FROM usuario u INNER JOIN cliente c ON u.id_usuario = c.id_usuario
             WHERE u.status_usuario = 'ativo' ORDER BY u.nome_usuario`
        );
        return rows;
    }
};

module.exports = Cliente;
