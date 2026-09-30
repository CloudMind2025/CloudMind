const tiposProduto = require('../../app/helpers/tiposProduto');

function criarBanco() {
    const categorias = Object.entries(tiposProduto.CATEGORIAS)
        .map(([slug, nome], i) => ({ id_categoria: 101 + i, nome_categoria: nome, slug_categoria: slug }));
    const estado = {
        categorias,
        produtos: new Map(),
        imagens: [],          // produto_imagem
        usuarios: new Map(),  // id → { nome, foto_usuario, status }
        criadores: new Map(), // id → { bio, capa }
        compras: new Set(),   // "cliente:produto" com pedido pago
        proximoProduto: 1,
        proximaImagem: 1,
        falhar: null          // (sql) => true para simular queda do banco
    };

    const r = rows => [rows];
    const ok = (affectedRows = 1, extra = {}) => [{ affectedRows, ...extra }];

    async function query(sql, p = []) {
        if (estado.falhar && estado.falhar(sql)) throw Object.assign(new Error('Banco indisponível (simulado)'), { code: 'PROTOCOL_CONNECTION_LOST' });
        const s = sql.replace(/\s+/g, ' ').trim();

        if (/INFORMATION_SCHEMA/.test(s)) return r([{ n: 2, existe: 1 }]);
        if (/^SELECT status_usuario AS status FROM usuario/.test(s)) return r([{ status: 'ativo' }]);
        if (/FROM categoria WHERE slug_categoria IS NOT NULL/.test(s)) return r(estado.categorias);
        if (/FROM categoria WHERE id_categoria = \?/.test(s)) return r(estado.categorias.filter(c => c.id_categoria === Number(p[0])));

        // ---- Produto: reserva / conclusão / descarte ----
        if (/^INSERT INTO produto \(/.test(s)) {
            const id = estado.proximoProduto++;
            const [id_criador, id_categoria, titulo, resumo, sku, descricao, preco, tipo, detalhes] = p;
            estado.produtos.set(id, { id_produto: id, id_criador, id_categoria, titulo_produto: titulo, resumo_produto: resumo,
                sku_produto: sku, descricao_produto: descricao, preco_produto: preco, tipo_produto: tipo, imagem: null,
                arquivo: null, status_produto: 'inativo', detalhes_produto: detalhes || null, data_publicacao: new Date() });
            return ok(1, { insertId: id });
        }
        if (/^UPDATE produto SET imagem = \?, arquivo = \?, status_produto = 'ativo'/.test(s)) {
            const pr = estado.produtos.get(Number(p[2]));
            if (!pr || pr.id_criador !== p[3] || pr.imagem !== null || pr.arquivo !== null) return ok(0);
            Object.assign(pr, { imagem: p[0], arquivo: p[1], status_produto: 'ativo' });
            return ok(1);
        }
        if (/^INSERT INTO produto_imagem/.test(s)) {
            p[0].forEach(([id_produto, caminho, ordem]) => estado.imagens.push({ id_imagem: estado.proximaImagem++, id_produto, caminho, ordem }));
            return ok(p[0].length);
        }
        if (/^DELETE FROM produto WHERE id_produto = \? AND id_criador = \? AND imagem IS NULL/.test(s)) {
            const pr = estado.produtos.get(Number(p[0]));
            if (!pr || pr.imagem !== null || pr.arquivo !== null) return ok(0);
            estado.produtos.delete(pr.id_produto);
            return ok(1);
        }

        // ---- Produto: leitura ----
        if (/AS criador_desde/.test(s)) { // buscarDetalhe
            const pr = estado.produtos.get(Number(p[0]));
            if (!pr) return r([]);
            const cat = estado.categorias.find(c => c.id_categoria === Number(pr.id_categoria)) || {};
            const u = estado.usuarios.get(pr.id_criador) || {};
            return r([{ detalhes_produto: pr.detalhes_produto, slug_categoria: cat.slug_categoria || null,
                id_produto: pr.id_produto, id_criador: pr.id_criador, id_categoria: pr.id_categoria, titulo: pr.titulo_produto,
                resumo: pr.resumo_produto, sku: pr.sku_produto, descricao: pr.descricao_produto, preco: pr.preco_produto,
                tipo_produto: pr.tipo_produto, imagem: pr.imagem, arquivo: pr.arquivo, data_publicacao: pr.data_publicacao,
                status_produto: pr.status_produto, nome_categoria: cat.nome_categoria || null, nome_criador: u.nome || 'Vendedor',
                foto_criador: u.foto_usuario || null, criador_desde: new Date('2026-01-01'), media_avaliacoes: null, qtd_avaliacoes: 0 }]);
        }
        if (/^SELECT caminho FROM produto_imagem WHERE id_produto = \? ORDER BY/.test(s)) {
            return r(estado.imagens.filter(i => i.id_produto === Number(p[0])).sort((a, b) => a.ordem - b.ordem).map(i => ({ caminho: i.caminho })));
        }
        if (/^SELECT id_produto, id_criador, titulo_produto AS titulo, tipo_produto, arquivo FROM produto WHERE id_produto = \?/.test(s)) {
            const pr = estado.produtos.get(Number(p[0]));
            return r(pr ? [{ id_produto: pr.id_produto, id_criador: pr.id_criador, titulo: pr.titulo_produto, tipo_produto: pr.tipo_produto, arquivo: pr.arquivo }] : []);
        }
        if (/FROM produto WHERE id_produto = \? AND id_criador = \? AND status_produto IN/.test(s)) { // buscarParaEdicao
            const pr = estado.produtos.get(Number(p[0]));
            return r(pr && pr.id_criador === p[1] ? [{ id_produto: pr.id_produto, id_criador: pr.id_criador, titulo: pr.titulo_produto,
                tipo_produto: pr.tipo_produto, status_produto: pr.status_produto, imagem: pr.imagem, arquivo: pr.arquivo }] : []);
        }
        if (/^UPDATE produto SET titulo_produto = \?/.test(s)) { // atualizar (com detalhes_produto)
            const [titulo, resumo, sku, descricao, preco, tipo, id_categoria, imagem, detalhes, id, criador] = p;
            const pr = estado.produtos.get(Number(id));
            if (!pr || pr.id_criador !== criador) return ok(0);
            Object.assign(pr, { titulo_produto: titulo, resumo_produto: resumo, sku_produto: sku, descricao_produto: descricao,
                preco_produto: preco, tipo_produto: tipo, id_categoria, imagem: imagem || pr.imagem, detalhes_produto: detalhes });
            return ok(1);
        }
        if (/^UPDATE produto SET arquivo = \? WHERE id_produto = \? AND id_criador = \?/.test(s)) {
            const pr = estado.produtos.get(Number(p[1]));
            if (!pr || pr.id_criador !== p[2]) return ok(0);
            pr.arquivo = p[0];
            return ok(1);
        }

        // ---- Produto: exclusão (Produto.excluir) ----
        if (/^SELECT id_criador, arquivo, imagem, status_produto FROM produto WHERE id_produto = \? FOR UPDATE/.test(s)) {
            const pr = estado.produtos.get(Number(p[0]));
            return r(pr ? [{ id_criador: pr.id_criador, arquivo: pr.arquivo, imagem: pr.imagem, status_produto: pr.status_produto }] : []);
        }
        if (/^SELECT COUNT\(\*\) AS vendas FROM item_pedido WHERE id_produto = \?/.test(s)) {
            return r([{ vendas: [...estado.compras].filter(c => c.endsWith(`:${p[0]}`)).length }]);
        }
        if (/^SELECT caminho FROM produto_imagem WHERE id_produto = \?$/.test(s)) {
            return r(estado.imagens.filter(i => i.id_produto === Number(p[0])).map(i => ({ caminho: i.caminho })));
        }
        if (/^DELETE FROM produto WHERE id_produto = \?$/.test(s)) {
            estado.produtos.delete(Number(p[0]));
            estado.imagens = estado.imagens.filter(i => i.id_produto !== Number(p[0]));
            return ok(1);
        }

        // ---- Compras ----
        if (/FROM item_pedido ip INNER JOIN pedido pe ON ip.id_pedido = pe.id_pedido WHERE pe.id_cliente = \? AND ip.id_produto = \?/.test(s)) {
            return r(estado.compras.has(`${p[0]}:${p[1]}`) ? [{ 1: 1 }] : []);
        }

        // ---- Usuário / loja ----
        if (/AS data_cadastro, status_usuario AS status, foto_usuario AS foto FROM usuario WHERE id_usuario = \?/.test(s)) {
            const u = estado.usuarios.get(Number(p[0]));
            return r(u ? [{ id_usuario: Number(p[0]), nome: u.nome, foto: u.foto_usuario || null, status: 'ativo' }] : []);
        }
        if (/^UPDATE usuario SET foto_usuario = \?/.test(s)) {
            const u = estado.usuarios.get(Number(p[1]));
            if (!u) return ok(0);
            u.foto_usuario = p[0];
            return ok(1);
        }
        if (/c\.bio_criador AS bio/.test(s)) {
            const u = estado.usuarios.get(Number(p[0]));
            const c = estado.criadores.get(Number(p[0]));
            return r(u && c ? [{ id_usuario: Number(p[0]), nome: u.nome, foto: u.foto_usuario || null, desde: new Date(), status: 'ativo', bio: c.bio || null, capa: c.capa || null }] : []);
        }
        if (/^UPDATE criador SET capa_criador = \?/.test(s)) {
            const c = estado.criadores.get(Number(p[1]));
            if (!c) return ok(0);
            c.capa = p[0];
            return ok(1);
        }

        if (/SUM\(ip\.quantidade \* ip\.preco_unitario\)/.test(s)) return r([{ total: 0, vendas: 0 }]);

        if (/^(SELECT|DELETE)/.test(s)) return r([]);
        return ok(0);
    }

    const pool = {
        on() {},
        query,
        async getConnection() {
            return { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
        }
    };
    return { pool, estado };
}

module.exports = { criarBanco };
