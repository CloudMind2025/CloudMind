const pool = require('../../config/db');
const arquivosProduto = require('../helpers/arquivosProduto');
const imagensProduto  = require('../helpers/imagensProduto');
const tiposProduto    = require('../helpers/tiposProduto');

const TIPOS_CATALOGO = tiposProduto.CHAVES;

let colunasNovas = null;
let colunasVerificadasEm = 0;
async function temColunasNovas() {
    if (colunasNovas === true) return true;
    if (colunasNovas === false && Date.now() - colunasVerificadasEm < 60000) return false;
    const [[r]] = await pool.query(
        `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND ((TABLE_NAME = 'produto' AND COLUMN_NAME = 'detalhes_produto')
             OR (TABLE_NAME = 'categoria' AND COLUMN_NAME = 'slug_categoria'))`
    );
    colunasNovas = Number(r && r.n) === 2;
    colunasVerificadasEm = Date.now();
    return colunasNovas;
}

async function colunasTipo() {
    return (await temColunasNovas())
        ? 'p.detalhes_produto, c.slug_categoria'
        : 'NULL AS detalhes_produto, NULL AS slug_categoria';
}

function comTipoNormalizado(p) {
    const { detalhes_produto, slug_categoria, ...resto } = p;
    const legada = !tiposProduto.categoriaPermitida(p.tipo_produto, slug_categoria);
    let detalhes = null;
    try { detalhes = detalhes_produto ? JSON.parse(detalhes_produto) : null; } catch (_) { detalhes = null; }
    return { ...resto, nome_categoria: legada ? null : p.nome_categoria, categoria_legada: legada, detalhes };
}

const JOIN_NOTAS = `
    LEFT JOIN (
        SELECT id_produto, AVG(nota) AS media_notas, COUNT(*) AS qtd_notas
        FROM avaliacao_produto WHERE nota BETWEEN 1 AND 5
        GROUP BY id_produto
    ) av ON av.id_produto = p.id_produto`;

const Produto = {

    TIPOS_CATALOGO,

    async listarCatalogo({ q = '', tipo = '', pagina = 1, porPagina = 12 } = {}) {
        const where = [`p.status_produto = 'ativo'`];
        const params = [];
        const termo = String(q || '').trim().slice(0, 100);
        if (termo) {
            where.push(`(p.titulo_produto LIKE ? OR p.descricao_produto LIKE ? OR p.resumo_produto LIKE ?)`);
            const like = `%${termo.replace(/[\\%_]/g, c => '\\' + c)}%`;
            params.push(like, like, like);
        }
        if (TIPOS_CATALOGO.includes(tipo)) {
            where.push(`p.tipo_produto = ?`);
            params.push(tipo);
        }
        const filtro = where.join(' AND ');

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM produto p WHERE ${filtro}`, params);
        const offset = (Math.max(1, pagina) - 1) * porPagina;
        const [rows] = await pool.query(
            `SELECT p.id_produto, p.id_criador, p.titulo_produto AS titulo, p.resumo_produto AS resumo,
                    p.preco_produto AS preco, p.tipo_produto, p.imagem, p.data_publicacao,
                    c.nome_categoria, u.nome_usuario AS nome_criador,
                    COALESCE(av.media_notas, 0) AS media_notas, COALESCE(av.qtd_notas, 0) AS qtd_notas
             FROM produto p
             INNER JOIN categoria c ON p.id_categoria = c.id_categoria
             INNER JOIN usuario u   ON p.id_criador   = u.id_usuario
             ${JOIN_NOTAS}
             WHERE ${filtro}
             ORDER BY p.data_publicacao DESC, p.id_produto DESC
             LIMIT ? OFFSET ?`,
            [...params, porPagina, offset]
        );
        return { produtos: rows, total: Number(total) };
    },

    async titulosParaSugestao(limite = 200) {
        const [rows] = await pool.query(
            `SELECT titulo_produto AS titulo FROM produto
             WHERE status_produto = 'ativo'
             ORDER BY data_publicacao DESC LIMIT ?`,
            [limite]
        );
        return [...new Set(rows.map(r => r.titulo))];
    },

    async listarCategorias() {
        if (!(await temColunasNovas())) return [];
        const [rows] = await pool.query(
            `SELECT id_categoria, nome_categoria, slug_categoria FROM categoria
             WHERE slug_categoria IS NOT NULL ORDER BY nome_categoria`
        );
        return rows;
    },

    async buscarCategoria(id_categoria) {
        const novas = await temColunasNovas();
        const [rows] = await pool.query(
            `SELECT id_categoria, nome_categoria, ${novas ? 'slug_categoria' : 'NULL AS slug_categoria'}
             FROM categoria WHERE id_categoria = ?`,
            [id_categoria]
        );
        return rows[0];
    },

    async estatisticasPublicas() {
        const [[row]] = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM produto WHERE status_produto = 'ativo') AS produtos,
                (SELECT COUNT(*) FROM criador cr INNER JOIN usuario u ON u.id_usuario = cr.id_usuario
                  WHERE u.status_usuario = 'ativo') AS vendedores,
                (SELECT AVG(nota) FROM avaliacao_produto WHERE nota BETWEEN 1 AND 5) AS media_notas,
                (SELECT COUNT(*) FROM avaliacao_produto WHERE nota BETWEEN 1 AND 5) AS qtd_notas`
        );
        return {
            produtos:   Number(row.produtos),
            vendedores: Number(row.vendedores),
            mediaNotas: row.media_notas === null ? null : Number(row.media_notas),
            qtdNotas:   Number(row.qtd_notas)
        };
    },

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

    async buscarDetalhe(id) {
        const [rows] = await pool.query(
            `SELECT ${await colunasTipo()}, p.id_produto, p.id_criador, p.id_categoria,
                    p.titulo_produto AS titulo, p.resumo_produto AS resumo, p.sku_produto AS sku,
                    p.descricao_produto AS descricao, p.preco_produto AS preco,
                    p.tipo_produto, p.imagem, p.arquivo, p.data_publicacao, p.status_produto,
                    c.nome_categoria,
                    u.nome_usuario     AS nome_criador,
                    u.foto_usuario     AS foto_criador,
                    u.data_cad_usuario AS criador_desde,
                    rep.media_avaliacoes,
                    COALESCE(rep.qtd_avaliacoes, 0) AS qtd_avaliacoes
             FROM produto p
             INNER JOIN categoria c ON p.id_categoria = c.id_categoria
             INNER JOIN usuario u   ON p.id_criador   = u.id_usuario
             LEFT JOIN (
                 SELECT pr.id_criador, AVG(a.nota) AS media_avaliacoes, COUNT(*) AS qtd_avaliacoes
                 FROM avaliacao_produto a INNER JOIN produto pr ON pr.id_produto = a.id_produto
                 WHERE a.nota BETWEEN 1 AND 5
                 GROUP BY pr.id_criador
             ) rep ON rep.id_criador = p.id_criador
             WHERE p.id_produto = ?`,
            [id]
        );
        if (!rows[0]) return undefined;
        const produto = comTipoNormalizado(rows[0]);

        produto.formato_arquivo = arquivosProduto.formatoDoArquivo(produto.arquivo);
        delete produto.arquivo;
        produto.imagens = await this.listarImagens(produto.id_produto, produto.imagem);
        return produto;
    },

    async listarImagens(id_produto, imagemPrincipal) {
        const galeria = imagemPrincipal ? [imagemPrincipal] : [];
        try {
            const [rows] = await pool.query(
                `SELECT caminho FROM produto_imagem WHERE id_produto = ? ORDER BY ordem, id_imagem`,
                [id_produto]
            );
            return galeria.concat(rows.map(r => r.caminho));
        } catch (err) {
            console.error('Imagens adicionais indisponíveis:', err.message);
            return galeria;
        }
    },

    async buscarArquivo(id_produto) {
        const [rows] = await pool.query(
            `SELECT id_produto, id_criador, titulo_produto AS titulo, tipo_produto, arquivo
             FROM produto WHERE id_produto = ?`,
            [id_produto]
        );
        return rows[0];
    },

    async atualizarArquivo(id_produto, id_criador, arquivo) {
        const [result] = await pool.query(
            `UPDATE produto SET arquivo = ? WHERE id_produto = ? AND id_criador = ?`,
            [arquivo, id_produto, id_criador]
        );
        return result.affectedRows;
    },

    async listarRelacionados(id_produto, id_categoria, limite = 4, tipo_produto = null) {
        const [rows] = await pool.query(
            `SELECT p.id_produto, p.titulo_produto AS titulo, p.preco_produto AS preco,
                    p.tipo_produto, p.imagem, u.nome_usuario AS nome_criador
             FROM produto p
             INNER JOIN usuario u ON p.id_criador = u.id_usuario
             WHERE p.status_produto = 'ativo' AND p.id_produto <> ?
             ORDER BY (p.id_categoria = ? AND p.tipo_produto = ?) DESC, (p.id_categoria = ?) DESC,
                      (p.tipo_produto = ?) DESC, p.data_publicacao DESC
             LIMIT ?`,
            [id_produto, id_categoria, tipo_produto, id_categoria, tipo_produto, limite]
        );
        return rows;
    },

    async listarPorCriador(id_criador) {
        const [rows] = await pool.query(
            `SELECT ${await colunasTipo()}, p.id_produto, p.titulo_produto AS titulo, p.preco_produto AS preco,
                    p.resumo_produto AS resumo, p.sku_produto AS sku, p.descricao_produto AS descricao,
                    p.id_categoria, p.tipo_produto, p.status_produto, p.imagem, p.arquivo, p.data_publicacao,
                    c.nome_categoria,
                    (SELECT COUNT(*) FROM produto_imagem pi WHERE pi.id_produto = p.id_produto) AS qtd_imagens_adicionais,
                    (SELECT COUNT(*) FROM item_pedido ip WHERE ip.id_produto = p.id_produto) AS vendas
             FROM produto p
             INNER JOIN categoria c ON p.id_categoria = c.id_categoria
             WHERE p.id_criador = ? AND p.status_produto <> 'excluido'
             ORDER BY p.data_publicacao DESC`,
            [id_criador]
        );
        return rows.map(({ arquivo, ...p }) => ({ ...comTipoNormalizado(p), formato_arquivo: arquivosProduto.formatoDoArquivo(arquivo) }));
    },

    async listarVitrine(id_criador) {
        const [rows] = await pool.query(
            `SELECT ${await colunasTipo()}, p.id_produto, p.id_criador, p.titulo_produto AS titulo, p.resumo_produto AS resumo,
                    p.preco_produto AS preco, p.tipo_produto, p.imagem, p.data_publicacao,
                    c.nome_categoria,
                    COALESCE(av.media_notas, 0) AS media_notas, COALESCE(av.qtd_notas, 0) AS qtd_notas,
                    COALESCE(vd.vendas, 0) AS vendas
             FROM produto p
             INNER JOIN categoria c ON p.id_categoria = c.id_categoria
             ${JOIN_NOTAS}
             LEFT JOIN (
                 SELECT ip.id_produto, COUNT(*) AS vendas
                 FROM item_pedido ip
                 INNER JOIN pedido pe  ON pe.id_pedido  = ip.id_pedido
                 INNER JOIN produto px ON px.id_produto = ip.id_produto
                 WHERE pe.status_pedido = 'pago' AND px.id_criador = ?
                 GROUP BY ip.id_produto
             ) vd ON vd.id_produto = p.id_produto
             WHERE p.id_criador = ? AND p.status_produto = 'ativo'
             ORDER BY p.data_publicacao DESC, p.id_produto DESC`,
            [id_criador, id_criador]
        );
        return rows.map(p => ({ ...comTipoNormalizado(p), media_notas: Number(p.media_notas), qtd_notas: Number(p.qtd_notas), vendas: Number(p.vendas) }));
    },

    async reservar(dados) {
        const { id_criador, id_categoria, titulo, resumo, sku, descricao, preco, tipo_produto } = dados;
        const detalhes = dados.detalhes && Object.keys(dados.detalhes).length ? JSON.stringify(dados.detalhes) : null;
        const novas = await temColunasNovas();
        const [result] = await pool.query(
            `INSERT INTO produto (id_criador, id_categoria, titulo_produto, resumo_produto, sku_produto,
                                  descricao_produto, preco_produto, tipo_produto, imagem, arquivo, status_produto${novas ? ', detalhes_produto' : ''})
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'inativo'${novas ? ', ?' : ''})`,
            [id_criador, id_categoria, titulo, resumo || null, sku || null, descricao, preco, tipo_produto,
             ...(novas ? [detalhes] : [])]
        );
        return result.insertId;
    },

    async concluirPublicacao(id_produto, id_criador, { imagem, imagensAdicionais = [], arquivo }) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [result] = await conn.query(
                `UPDATE produto SET imagem = ?, arquivo = ?, status_produto = 'ativo'
                 WHERE id_produto = ? AND id_criador = ? AND imagem IS NULL AND arquivo IS NULL`,
                [imagem, arquivo, id_produto, id_criador]
            );
            if (result.affectedRows !== 1) throw new Error('Reserva do produto não encontrada para concluir a publicação.');
            if (imagensAdicionais.length) {
                await conn.query(
                    `INSERT INTO produto_imagem (id_produto, caminho, ordem) VALUES ?`,
                    [imagensAdicionais.map((caminho, i) => [id_produto, caminho, i + 1])]
                );
            }
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async descartarReserva(id_produto, id_criador) {
        const [result] = await pool.query(
            `DELETE FROM produto WHERE id_produto = ? AND id_criador = ? AND imagem IS NULL AND arquivo IS NULL`,
            [id_produto, id_criador]
        );
        return result.affectedRows;
    },

    async buscarParaEdicao(id_produto, id_criador) {
        const [rows] = await pool.query(
            `SELECT id_produto, id_criador, titulo_produto AS titulo, tipo_produto, status_produto, imagem, arquivo
             FROM produto
             WHERE id_produto = ? AND id_criador = ? AND status_produto IN ('ativo', 'inativo')`,
            [id_produto, id_criador]
        );
        return rows[0];
    },

    async atualizar(id_produto, id_criador, dados) {
        const { titulo, resumo, sku, descricao, preco, tipo_produto, id_categoria, imagem } = dados;
        const detalhes = dados.detalhes && Object.keys(dados.detalhes).length ? JSON.stringify(dados.detalhes) : null;
        const novas = await temColunasNovas();
        const [result] = await pool.query(
            `UPDATE produto SET titulo_produto = ?, resumo_produto = ?, sku_produto = ?, descricao_produto = ?,
                                preco_produto = ?, tipo_produto = ?, id_categoria = ?, imagem = COALESCE(?, imagem)
                                ${novas ? ', detalhes_produto = ?' : ''}
             WHERE id_produto = ? AND id_criador = ? AND status_produto IN ('ativo', 'inativo')`,
            [titulo, resumo || null, sku || null, descricao, preco, tipo_produto, id_categoria, imagem || null,
             ...(novas ? [detalhes] : []), id_produto, id_criador]
        );
        return result.affectedRows;
    },

    async alterarStatus(id_produto, id_criador, statusAtual, novoStatus) {
        const [result] = await pool.query(
            `UPDATE produto SET status_produto = ?
             WHERE id_produto = ? AND id_criador = ? AND status_produto = ?`,
            [novoStatus, id_produto, id_criador, statusAtual]
        );
        return result.affectedRows;
    },

    async excluir(id_produto, id_criador) {
        const conn = await pool.getConnection();
        let imagens = [];
        let arquivo = null;
        let modo = null;
        try {
            await conn.beginTransaction();
            const [[produto]] = await conn.query(
                `SELECT id_criador, arquivo, imagem, status_produto FROM produto WHERE id_produto = ? FOR UPDATE`,
                [id_produto]
            );
            if (!produto || Number(produto.id_criador) !== Number(id_criador) || produto.status_produto === 'excluido') {
                await conn.rollback();
                return null;
            }

            const [[{ vendas }]] = await conn.query(
                `SELECT COUNT(*) AS vendas FROM item_pedido WHERE id_produto = ?`, [id_produto]
            );
            await conn.query(`DELETE FROM item_carrinho WHERE id_produto = ?`, [id_produto]);
            await conn.query(`DELETE FROM favorito WHERE id_produto = ?`, [id_produto]);

            if (Number(vendas) > 0) {
                await conn.query(`UPDATE produto SET status_produto = 'excluido' WHERE id_produto = ?`, [id_produto]);
                modo = 'logica';
            } else {
                const [extras] = await conn.query(`SELECT caminho FROM produto_imagem WHERE id_produto = ?`, [id_produto]);
                imagens = [produto.imagem, ...extras.map(e => e.caminho)].filter(Boolean);
                arquivo = produto.arquivo;
                await conn.query(`DELETE FROM avaliacao_produto WHERE id_produto = ?`, [id_produto]);
                await conn.query(`DELETE FROM produto WHERE id_produto = ?`, [id_produto]);
                modo = 'fisica';
            }
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        if (modo === 'fisica') {
            arquivosProduto.remover(arquivo);
            imagens.forEach(ref => imagensProduto.remover(ref));
        }
        return modo;
    }
};

module.exports = Produto;
