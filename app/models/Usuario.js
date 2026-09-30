const pool = require('../../config/db');
const arquivosProduto = require('../helpers/arquivosProduto');
const imagensProduto  = require('../helpers/imagensProduto');
const armazenamento = require('../helpers/armazenamento');

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
                    data_cad_usuario AS data_cadastro, status_usuario AS status, foto_usuario AS foto
             FROM usuario WHERE id_usuario = ?`,
            [id]
        );
        return rows[0];
    },

    async buscarPorEmail(email) {
        const [rows] = await pool.query(
            `SELECT id_usuario, nome_usuario AS nome, email_usuario AS email,
                    senha_usuario AS senha, status_usuario AS status, foto_usuario AS foto
             FROM usuario WHERE email_usuario = ?`,
            [email]
        );
        return rows[0];
    },

    async buscarStatus(id) {
        const [rows] = await pool.query(`SELECT status_usuario AS status FROM usuario WHERE id_usuario = ?`, [id]);
        return rows[0] ? rows[0].status : undefined;
    },

    async ehAdmin(id) {
        const [rows] = await pool.query(`SELECT 1 FROM administrador WHERE id_usuario = ? LIMIT 1`, [id]);
        return rows.length > 0;
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

    async suspender(id) {
        return this._mudarSuspensao(id, 'suspenso', 'ativo', 'suspenso');
    },

    async reativar(id) {
        return this._mudarSuspensao(id, 'ativo', 'suspenso', 'ativo');
    },

    async _mudarSuspensao(id, statusConta, statusProdutoDe, statusProdutoPara) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [conta] = await conn.query(
                `UPDATE usuario SET status_usuario = ? WHERE id_usuario = ?`, [statusConta, id]
            );
            if (!conta.affectedRows) {
                await conn.rollback();
                return null;
            }
            const [produtos] = await conn.query(
                `UPDATE produto SET status_produto = ? WHERE id_criador = ? AND status_produto = ?`,
                [statusProdutoPara, id, statusProdutoDe]
            );
            await conn.commit();
            return { produtos: produtos.affectedRows };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async excluir(id) {
        const conn = await pool.getConnection();
        let imagens = [];
        let arquivos = [];
        let midiasConta = [];
        let resultado = null;
        try {
            await conn.beginTransaction();

            const [[{ vendas }]] = await conn.query(
                `SELECT COUNT(*) AS vendas FROM item_pedido ip
                 INNER JOIN produto p ON p.id_produto = ip.id_produto
                 WHERE p.id_criador = ?`,
                [id]
            );

            // Pagamento real no Mercado Pago é registro financeiro: a conta é desativada e os pedidos ficam.
            const [[{ pagamentos }]] = await conn.query(
                `SELECT COUNT(*) AS pagamentos FROM pagamento pg
                 INNER JOIN pedido p ON p.id_pedido = pg.id_pedido
                 WHERE p.id_cliente = ? AND pg.mp_order_id IS NOT NULL`,
                [id]
            ).catch(err => { if (err.code === 'ER_NO_SUCH_TABLE') return [[{ pagamentos: 0 }]]; throw err; });

            if (Number(vendas) > 0 || Number(pagamentos) > 0) {
                await conn.query(`DELETE ic FROM item_carrinho ic JOIN produto p ON ic.id_produto = p.id_produto WHERE p.id_criador = ?`, [id]);
                await conn.query(`DELETE fv FROM favorito fv JOIN produto p ON fv.id_produto = p.id_produto WHERE p.id_criador = ?`, [id]);
                await conn.query(`UPDATE produto SET status_produto = 'excluido' WHERE id_criador = ?`, [id]);
                const [r] = await conn.query(`UPDATE usuario SET status_usuario = 'suspenso' WHERE id_usuario = ?`, [id]);
                await conn.commit();
                return r.affectedRows ? 'desativada' : null;
            }

            const [prods] = await conn.query(`SELECT imagem, arquivo FROM produto WHERE id_criador = ?`, [id]);
            const [extras] = await conn.query(
                `SELECT pi.caminho FROM produto_imagem pi JOIN produto p ON pi.id_produto = p.id_produto WHERE p.id_criador = ?`, [id]
            ).catch(() => [[]]);
            imagens  = [...prods.map(p => p.imagem), ...extras.map(e => e.caminho)].filter(Boolean);
            arquivos = prods.map(p => p.arquivo).filter(Boolean);

            const [[conta]] = await conn.query(`SELECT foto_usuario FROM usuario WHERE id_usuario = ?`, [id]);
            const [[loja]] = await conn.query(`SELECT capa_criador FROM criador WHERE id_usuario = ?`, [id]).catch(() => [[null]]);
            midiasConta = [conta && conta.foto_usuario, loja && loja.capa_criador].filter(armazenamento.ehChave);

            await conn.query(`DELETE r FROM reembolso r JOIN pedido p ON r.id_pedido = p.id_pedido WHERE p.id_cliente = ?`, [id]).catch(() => {});
            await conn.query(`DELETE ip FROM item_pedido ip JOIN pedido p ON ip.id_pedido = p.id_pedido WHERE p.id_cliente = ?`, [id]);
            await conn.query(`DELETE FROM pedido WHERE id_cliente = ?`, [id]);

            await conn.query(`DELETE ic FROM item_carrinho ic JOIN produto p ON ic.id_produto = p.id_produto WHERE p.id_criador = ?`, [id]);
            await conn.query(`DELETE fv FROM favorito fv JOIN produto p ON fv.id_produto = p.id_produto WHERE p.id_criador = ?`, [id]);
            await conn.query(`DELETE av FROM avaliacao_produto av JOIN produto p ON av.id_produto = p.id_produto WHERE p.id_criador = ?`, [id]);
            await conn.query(`DELETE FROM produto WHERE id_criador = ?`, [id]);

            await conn.query(`DELETE FROM avaliacao_produto WHERE id_cliente = ?`, [id]);
            await conn.query(`DELETE FROM avaliacao_criador WHERE id_cliente = ?`, [id]).catch(() => {});

            const [result] = await conn.query(`DELETE FROM usuario WHERE id_usuario = ?`, [id]);
            await conn.commit();
            resultado = result.affectedRows ? 'excluida' : null;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        if (resultado === 'excluida') {
            arquivos.forEach(ref => arquivosProduto.remover(ref));
            imagens.forEach(ref => imagensProduto.remover(ref));
            armazenamento.removerVarios(midiasConta);
        }
        return resultado;
    }
};

module.exports = Usuario;
