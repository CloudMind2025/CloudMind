const pool = require('../../config/db');

const Usuario = {

    async listarTodos() {
        const [rows] = await pool.query(
            `SELECT u.id_usuario, u.nome_usuario AS nome, u.email_usuario AS email,
                    u.data_cad_usuario AS data_cadastro, u.status_usuario AS status,
                    CASE
                        WHEN adm.id_usuario IS NOT NULL THEN 'admin'
                        WHEN cri.id_usuario IS NOT NULL THEN 'criador'
                        ELSE 'cliente'
                    END AS tipo
             FROM usuario u
             LEFT JOIN administrador adm ON u.id_usuario = adm.id_usuario
             LEFT JOIN criador cri       ON u.id_usuario = cri.id_usuario
             WHERE u.status_usuario IN ('ativo', 'suspenso')
             ORDER BY u.nome_usuario`
        );
        return rows;
    },

    async buscarPorId(id) {
        const [rows] = await pool.query(
            `SELECT id_usuario, nome_usuario AS nome, email_usuario AS email,
                    data_cad_usuario AS data_cadastro, status_usuario AS status
             FROM usuario WHERE id_usuario = ?`,
            [id]
        );
        return rows[0];
    },

    async buscarPorEmail(email) {
        const [rows] = await pool.query(
            `SELECT id_usuario, nome_usuario AS nome, email_usuario AS email,
                    senha_usuario AS senha, status_usuario AS status
             FROM usuario WHERE email_usuario = ?`,
            [email]
        );
        if (!rows[0]) return undefined;
        try {
            const [fRows] = await pool.query(
                `SELECT foto_usuario AS foto FROM usuario WHERE id_usuario = ?`,
                [rows[0].id_usuario]
            );
            rows[0].foto = fRows[0]?.foto || null;
        } catch {
            rows[0].foto = null;
        }
        return rows[0];
    },

    async atualizarFoto(id, foto) {
        const [result] = await pool.query(
            `UPDATE usuario SET foto_usuario = ? WHERE id_usuario = ?`,
            [foto, id]
        );
        return result.affectedRows;
    },

    async criar(dados) {
        const { nome, email, senha } = dados;
        const [result] = await pool.query(
            `INSERT INTO usuario (nome_usuario, email_usuario, senha_usuario) VALUES (?, ?, ?)`,
            [nome, email, senha]
        );
        return result.insertId;
    },

    async atualizar(id, dados) {
        const { nome, email } = dados;
        const [result] = await pool.query(
            `UPDATE usuario SET nome_usuario = ?, email_usuario = ? WHERE id_usuario = ?`,
            [nome, email, id]
        );
        return result.affectedRows;
    },

    async atualizarSenha(id, novaSenha) {
        const [result] = await pool.query(
            `UPDATE usuario SET senha_usuario = ? WHERE id_usuario = ?`,
            [novaSenha, id]
        );
        return result.affectedRows;
    },

    async atualizarStatus(id, status) {
        const [result] = await pool.query(
            `UPDATE usuario SET status_usuario = ? WHERE id_usuario = ?`,
            [status, id]
        );
        return result.affectedRows;
    },

    async excluir(id) {
        // 1. Pedidos do usuário como cliente: reembolsos → itens → pedidos
        await pool.query(`DELETE r FROM reembolso r
            JOIN pedido p ON r.id_pedido = p.id_pedido
            WHERE p.id_cliente = ?`, [id]);
        await pool.query(`DELETE ip FROM item_pedido ip
            JOIN pedido p ON ip.id_pedido = p.id_pedido
            WHERE p.id_cliente = ?`, [id]);
        await pool.query(`DELETE FROM pedido WHERE id_cliente = ?`, [id]);

        // 2. Dependências dos produtos criados por este usuário (produto.id_criador não tem CASCADE)
        await pool.query(`DELETE ic FROM item_carrinho ic
            JOIN produto p ON ic.id_produto = p.id_produto
            WHERE p.id_criador = ?`, [id]).catch(() => {});
        await pool.query(`DELETE ip FROM item_pedido ip
            JOIN produto p ON ip.id_produto = p.id_produto
            WHERE p.id_criador = ?`, [id]).catch(() => {});
        await pool.query(`DELETE av FROM avaliacao_produto av
            JOIN produto p ON av.id_produto = p.id_produto
            WHERE p.id_criador = ?`, [id]).catch(() => {});
        await pool.query(`DELETE fv FROM favorito fv
            JOIN produto p ON fv.id_produto = p.id_produto
            WHERE p.id_criador = ?`, [id]).catch(() => {});
        await pool.query(`DELETE dn FROM denuncia dn
            JOIN produto p ON dn.id_produto = p.id_produto
            WHERE p.id_criador = ?`, [id]).catch(() => {});
        await pool.query(`DELETE FROM produto WHERE id_criador = ?`, [id]);

        // 3. Avaliações feitas pelo usuário como cliente
        await pool.query(`DELETE FROM avaliacao_produto WHERE id_cliente = ?`, [id]).catch(() => {});
        await pool.query(`DELETE FROM avaliacao_criador WHERE id_cliente = ?`, [id]).catch(() => {});

        // 4. Deleta o usuário — CASCADE cuida de: cliente, criador, carrinho, suporte, denuncia, favorito
        const [result] = await pool.query(`DELETE FROM usuario WHERE id_usuario = ?`, [id]);
        return result.affectedRows;
    }
};

module.exports = Usuario;
