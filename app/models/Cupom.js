const pool = require('../../config/db');

const CAMPOS = `
    c.id_cupom, c.codigo, c.id_criador, c.tipo_desconto, c.valor_desconto,
    DATE_FORMAT(c.data_inicio, '%Y-%m-%d') AS data_inicio,
    DATE_FORMAT(c.data_fim, '%Y-%m-%d') AS data_fim,
    c.limite_usos, c.ativo, c.data_criacao,
    u.nome_usuario AS nome_criador, u.status_usuario AS status_criador,
    (SELECT COUNT(*) FROM cupom_uso cu WHERE cu.id_cupom = c.id_cupom) AS usos`;

function normalizar(row) {
    if (!row) return undefined;
    return {
        ...row,
        valor_desconto: Number(row.valor_desconto),
        limite_usos: row.limite_usos == null ? null : Number(row.limite_usos),
        ativo: !!Number(row.ativo),
        usos: Number(row.usos || 0),
        total_descontado: row.total_descontado == null ? undefined : Number(row.total_descontado)
    };
}

const Cupom = {

    async listarTodos() {
        const [rows] = await pool.query(
            `SELECT ${CAMPOS},
                    (SELECT COALESCE(SUM(cu.valor_desconto), 0) FROM cupom_uso cu WHERE cu.id_cupom = c.id_cupom) AS total_descontado
             FROM cupom c
             INNER JOIN usuario u ON u.id_usuario = c.id_criador
             ORDER BY c.data_criacao DESC, c.id_cupom DESC`
        );
        return rows.map(normalizar);
    },

    async buscarPorId(id_cupom) {
        const [rows] = await pool.query(
            `SELECT ${CAMPOS} FROM cupom c INNER JOIN usuario u ON u.id_usuario = c.id_criador WHERE c.id_cupom = ?`,
            [id_cupom]
        );
        return normalizar(rows[0]);
    },

    async buscarPorCodigo(codigo) {
        const [rows] = await pool.query(
            `SELECT ${CAMPOS} FROM cupom c INNER JOIN usuario u ON u.id_usuario = c.id_criador WHERE c.codigo = ?`,
            [codigo]
        );
        return normalizar(rows[0]);
    },

    async listarDisponiveisDoCriador(id_criador, dia) {
        const [rows] = await pool.query(
            `SELECT ${CAMPOS}
             FROM cupom c INNER JOIN usuario u ON u.id_usuario = c.id_criador
             WHERE c.id_criador = ? AND c.ativo = 1 AND u.status_usuario = 'ativo'
               AND ? BETWEEN c.data_inicio AND c.data_fim
               AND (c.limite_usos IS NULL OR c.limite_usos > (SELECT COUNT(*) FROM cupom_uso cu WHERE cu.id_cupom = c.id_cupom))
             ORDER BY c.data_fim, c.id_cupom`,
            [id_criador, dia]
        );
        return rows.map(normalizar);
    },

    async clienteJaUsou(id_cupom, id_cliente) {
        const [rows] = await pool.query(
            `SELECT 1 FROM cupom_uso WHERE id_cupom = ? AND id_cliente = ? LIMIT 1`,
            [id_cupom, id_cliente]
        );
        return rows.length > 0;
    },

    async criar(dados, criado_por) {
        const [result] = await pool.query(
            `INSERT INTO cupom (codigo, id_criador, tipo_desconto, valor_desconto, data_inicio, data_fim, limite_usos, ativo, criado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [dados.codigo, dados.id_criador, dados.tipo_desconto, dados.valor_desconto, dados.data_inicio,
             dados.data_fim, dados.limite_usos, dados.ativo ? 1 : 0, criado_por || null]
        );
        return result.insertId;
    },

    async atualizar(id_cupom, dados) {
        const [result] = await pool.query(
            `UPDATE cupom SET codigo = ?, id_criador = ?, tipo_desconto = ?, valor_desconto = ?,
                              data_inicio = ?, data_fim = ?, limite_usos = ?, ativo = ?
             WHERE id_cupom = ?`,
            [dados.codigo, dados.id_criador, dados.tipo_desconto, dados.valor_desconto, dados.data_inicio,
             dados.data_fim, dados.limite_usos, dados.ativo ? 1 : 0, id_cupom]
        );
        return result.affectedRows;
    },

    async definirAtivo(id_cupom, ativo) {
        const [result] = await pool.query(`UPDATE cupom SET ativo = ? WHERE id_cupom = ?`, [ativo ? 1 : 0, id_cupom]);
        return result.affectedRows;
    },

    async excluir(id_cupom) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [[c]] = await conn.query(`SELECT id_cupom FROM cupom WHERE id_cupom = ? FOR UPDATE`, [id_cupom]);
            if (!c) { await conn.rollback(); return null; }
            const [[{ usos }]] = await conn.query(`SELECT COUNT(*) AS usos FROM cupom_uso WHERE id_cupom = ?`, [id_cupom]);
            let resultado;
            if (Number(usos) > 0) {
                await conn.query(`UPDATE cupom SET ativo = 0 WHERE id_cupom = ?`, [id_cupom]);
                resultado = 'inativado';
            } else {
                await conn.query(`UPDATE carrinho SET id_cupom = NULL WHERE id_cupom = ?`, [id_cupom]);
                await conn.query(`DELETE FROM cupom WHERE id_cupom = ?`, [id_cupom]);
                resultado = 'excluido';
            }
            await conn.commit();
            return resultado;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async buscarParaCompra(conn, id_cupom, id_cliente) {
        const [[row]] = await conn.query(
            `SELECT c.id_cupom, c.codigo, c.id_criador, c.tipo_desconto, c.valor_desconto,
                    DATE_FORMAT(c.data_inicio, '%Y-%m-%d') AS data_inicio,
                    DATE_FORMAT(c.data_fim, '%Y-%m-%d') AS data_fim,
                    c.limite_usos, c.ativo, u.nome_usuario AS nome_criador, u.status_usuario AS status_criador
             FROM cupom c INNER JOIN usuario u ON u.id_usuario = c.id_criador
             WHERE c.id_cupom = ? FOR UPDATE`,
            [id_cupom]
        );
        if (!row) return { cupom: undefined, jaUsou: false };
        const [[{ usos }]] = await conn.query(`SELECT COUNT(*) AS usos FROM cupom_uso WHERE id_cupom = ?`, [id_cupom]);
        const [usado] = await conn.query(`SELECT 1 FROM cupom_uso WHERE id_cupom = ? AND id_cliente = ? LIMIT 1`, [id_cupom, id_cliente]);
        return { cupom: normalizar({ ...row, usos }), jaUsou: usado.length > 0 };
    }
};

module.exports = Cupom;
