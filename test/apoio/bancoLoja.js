function criarBancoLoja() {
    let estado = {
        usuarios: new Map(),   // id → { nome, email, status, foto }
        admins: new Set(),
        criadores: new Set(),
        clientes: new Set(),
        produtos: new Map(),   // id → { id_produto, id_criador, titulo, preco, tipo, status, imagem, arquivo }
        carrinhos: new Map(),  // id → { id_carrinho, id_cliente, status_carrinho, id_cupom }
        itensCarrinho: [],     // { id_carrinho, id_produto, preco_unitario }
        pedidos: [],           // { id_pedido, id_cliente, status, data, data_pagamento }
        itensPedido: [],       // { id_pedido, id_produto, quantidade, preco_unitario, desconto }
        cupons: new Map(),     // id → { ...colunas }
        usos: [],              // { id_uso, id_cupom, id_cliente, id_pedido, valor_desconto }
        pagamentos: [],        // linhas da tabela pagamento
        eventos: [],           // linhas da tabela pagamento_evento
        seq: { carrinho: 1, pedido: 1, cupom: 1, uso: 1, pagamento: 1, evento: 1 },
        hojeBanco: '2026-09-26'
    };

    const r = rows => [rows];
    const ok = (affectedRows = 1, extra = {}) => [{ affectedRows, ...extra }];
    const dup = () => { throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }); };

    const usosDe = id => estado.usos.filter(u => u.id_cupom === Number(id)).length;
    function linhaCupom(c) {
        const u = estado.usuarios.get(c.id_criador) || {};
        return {
            id_cupom: c.id_cupom, codigo: c.codigo, id_criador: c.id_criador, tipo_desconto: c.tipo_desconto,
            valor_desconto: c.valor_desconto, data_inicio: c.data_inicio, data_fim: c.data_fim, limite_usos: c.limite_usos,
            ativo: c.ativo, data_criacao: new Date(), nome_criador: u.nome, status_criador: u.status || 'ativo',
            usos: usosDe(c.id_cupom),
            total_descontado: estado.usos.filter(x => x.id_cupom === c.id_cupom).reduce((s, x) => s + x.valor_desconto, 0)
        };
    }

    async function query(sql, p = []) {
        const s = sql.replace(/\s+/g, ' ').trim();

        if (/INFORMATION_SCHEMA/.test(s)) return r([{ n: 2, existe: 1 }]);
        if (/^SELECT status_usuario AS status FROM usuario/.test(s)) return r([{ status: 'ativo' }]);

        // ---- Cupom ----
        if (/^INSERT INTO cupom \(/.test(s)) {
            const [codigo, id_criador, tipo, valor, inicio, fim, limite, ativo] = p;
            if ([...estado.cupons.values()].some(c => c.codigo === codigo)) dup();
            const id = estado.seq.cupom++;
            estado.cupons.set(id, { id_cupom: id, codigo, id_criador, tipo_desconto: tipo, valor_desconto: valor,
                data_inicio: inicio, data_fim: fim, limite_usos: limite, ativo });
            return ok(1, { insertId: id });
        }
        if (/^UPDATE cupom SET codigo = \?/.test(s)) {
            const [codigo, id_criador, tipo, valor, inicio, fim, limite, ativo, id] = p;
            if ([...estado.cupons.values()].some(c => c.codigo === codigo && c.id_cupom !== Number(id))) dup();
            const c = estado.cupons.get(Number(id));
            if (!c) return ok(0);
            Object.assign(c, { codigo, id_criador, tipo_desconto: tipo, valor_desconto: valor, data_inicio: inicio, data_fim: fim, limite_usos: limite, ativo });
            return ok(1);
        }
        if (/^UPDATE cupom SET ativo = \? WHERE id_cupom = \?/.test(s)) {
            const c = estado.cupons.get(Number(p[1]));
            if (!c) return ok(0);
            c.ativo = p[0];
            return ok(1);
        }
        if (/^UPDATE cupom SET ativo = 0 WHERE id_cupom = \?/.test(s)) {
            const c = estado.cupons.get(Number(p[0])); if (c) c.ativo = 0; return ok(c ? 1 : 0);
        }
        if (/^DELETE FROM cupom WHERE id_cupom = \?/.test(s)) { estado.cupons.delete(Number(p[0])); return ok(1); }
        if (/^SELECT id_cupom FROM cupom WHERE id_cupom = \? FOR UPDATE/.test(s)) {
            return r(estado.cupons.has(Number(p[0])) ? [{ id_cupom: Number(p[0]) }] : []);
        }
        if (/^SELECT COUNT\(\*\) AS usos FROM cupom_uso WHERE id_cupom = \?/.test(s)) return r([{ usos: usosDe(p[0]) }]);
        if (/^SELECT 1 FROM cupom_uso WHERE id_cupom = \? AND id_cliente = \?/.test(s)) {
            return r(estado.usos.some(u => u.id_cupom === Number(p[0]) && u.id_cliente === Number(p[1])) ? [{ 1: 1 }] : []);
        }
        if (/FROM cupom c INNER JOIN usuario u ON u.id_usuario = c.id_criador/.test(s)) {
            const todos = [...estado.cupons.values()];
            if (/WHERE c.id_cupom = \? FOR UPDATE/.test(s)) { const c = estado.cupons.get(Number(p[0])); return r(c ? [linhaCupom(c)] : []); }
            if (/WHERE c.id_cupom = \?/.test(s)) { const c = estado.cupons.get(Number(p[0])); return r(c ? [linhaCupom(c)] : []); }
            if (/WHERE c.codigo = \?/.test(s)) return r(todos.filter(c => c.codigo === p[0]).map(linhaCupom));
            if (/WHERE c.id_criador = \? AND c.ativo = 1/.test(s)) {
                const [id, dia] = p;
                return r(todos.map(linhaCupom).filter(c => c.id_criador === Number(id) && c.ativo && c.status_criador === 'ativo'
                    && dia >= c.data_inicio && dia <= c.data_fim && (c.limite_usos == null || c.limite_usos > c.usos)));
            }
            if (/ORDER BY c.data_criacao DESC/.test(s)) return r(todos.map(linhaCupom).reverse());
        }
        if (/^INSERT INTO cupom_uso/.test(s)) {
            const [id_cupom, id_cliente, id_pedido, valor] = p;
            if (estado.usos.some(u => u.id_cupom === id_cupom && u.id_cliente === id_cliente)) dup();
            estado.usos.push({ id_uso: estado.seq.uso++, id_cupom, id_cliente, id_pedido, valor_desconto: valor });
            return ok(1);
        }

        // ---- Usuários ----
        if (/FROM usuario u INNER JOIN criador c ON u.id_usuario = c.id_usuario WHERE u.status_usuario = 'ativo'/.test(s)) {
            return r([...estado.criadores].filter(id => (estado.usuarios.get(id) || {}).status === 'ativo')
                .map(id => ({ id_usuario: id, nome: estado.usuarios.get(id).nome, email: estado.usuarios.get(id).email, status: 'ativo' })));
        }
        if (/FROM usuario u INNER JOIN cliente c ON u.id_usuario = c.id_usuario WHERE u.id_usuario = \?/.test(s)) {
            const id = Number(p[0]);
            return r(estado.clientes.has(id) ? [{ id_usuario: id, nome: estado.usuarios.get(id).nome }] : []);
        }
        if (/^INSERT INTO cliente/.test(s)) { estado.clientes.add(Number(p[0])); return ok(1); }
        if (/c\.bio_criador AS bio/.test(s)) {
            const u = estado.usuarios.get(Number(p[0]));
            return r(u && estado.criadores.has(Number(p[0])) ? [{ id_usuario: Number(p[0]), nome: u.nome, foto: u.foto || null, desde: new Date(), status: u.status, bio: null, capa: null }] : []);
        }
        if (/CASE WHEN adm.id_usuario IS NOT NULL THEN 'admin'/.test(s)) { // Usuario.listarTodos (painel)
            return r([...estado.usuarios.entries()].map(([id, u]) => ({ id_usuario: id, nome: u.nome, email: u.email, status: u.status,
                data_cadastro: new Date(), tipo: estado.admins.has(id) ? 'admin' : estado.criadores.has(id) ? 'criador' : 'cliente' })));
        }

        // ---- Carrinho ----
        if (/^SELECT \* FROM carrinho WHERE id_cliente = \? AND status_carrinho = 'aberto'/.test(s)) {
            return r([...estado.carrinhos.values()].filter(c => c.id_cliente === Number(p[0]) && c.status_carrinho === 'aberto').map(c => ({ ...c })));
        }
        if (/^INSERT INTO carrinho \(id_cliente\)/.test(s)) {
            const id = estado.seq.carrinho++;
            estado.carrinhos.set(id, { id_carrinho: id, id_cliente: Number(p[0]), status_carrinho: 'aberto', id_cupom: null });
            return ok(1, { insertId: id });
        }
        if (/^SELECT \* FROM carrinho WHERE id_carrinho = \?/.test(s)) return r([{ ...estado.carrinhos.get(Number(p[0])) }]);
        if (/^UPDATE carrinho SET id_cupom = \? WHERE id_carrinho = \?/.test(s)) {
            const c = estado.carrinhos.get(Number(p[1])); if (c) c.id_cupom = p[0]; return ok(c ? 1 : 0);
        }
        if (/^UPDATE carrinho SET id_cupom = NULL WHERE id_carrinho = \?/.test(s)) {
            const c = estado.carrinhos.get(Number(p[0])); if (c) c.id_cupom = null; return ok(1);
        }
        if (/^UPDATE carrinho SET id_cupom = NULL WHERE id_cupom = \?/.test(s)) {
            estado.carrinhos.forEach(c => { if (c.id_cupom === Number(p[0])) c.id_cupom = null; }); return ok(1);
        }
        if (/FROM item_carrinho ic INNER JOIN produto p ON ic.id_produto = p.id_produto WHERE ic.id_carrinho = \?/.test(s)) {
            return r(estado.itensCarrinho.filter(i => i.id_carrinho === Number(p[0])).map(i => {
                const pr = estado.produtos.get(i.id_produto);
                return { id_produto: pr.id_produto, quantidade: 1, preco_unitario: i.preco_unitario, titulo: pr.titulo, imagem: pr.imagem,
                    tipo_produto: pr.tipo, status_produto: pr.status, preco_atual: pr.preco, id_criador: pr.id_criador };
            }));
        }
        if (/^DELETE FROM item_carrinho WHERE id_carrinho = \? AND id_produto IN \(\?\)/.test(s)) {
            estado.itensCarrinho = estado.itensCarrinho.filter(i => !(i.id_carrinho === Number(p[0]) && p[1].includes(i.id_produto)));
            return ok(1);
        }

        // ---- Pedido ----
        if (/^SELECT DISTINCT ip.id_produto FROM item_pedido ip/.test(s)) {
            const [cliente, ids] = p;
            const pagos = new Set(estado.pedidos.filter(x => x.id_cliente === Number(cliente) && x.status === 'pago').map(x => x.id_pedido));
            return r([...new Set(estado.itensPedido.filter(i => pagos.has(i.id_pedido) && ids.includes(i.id_produto)).map(i => i.id_produto))].map(id => ({ id_produto: id })));
        }
        if (/^INSERT INTO pedido \(id_cliente, status_pedido, data_pagamento\) VALUES \(\?, \?, (NOW\(\)|NULL)\)$/.test(s)) {
            const id = estado.seq.pedido++;
            estado.pedidos.push({ id_pedido: id, id_cliente: Number(p[0]), status: p[1], data: estado.hojeBanco,
                data_pagamento: /NOW\(\)\)$/.test(s) ? new Date() : null });
            return ok(1, { insertId: id });
        }
        if (/^SELECT id_carrinho FROM carrinho WHERE id_carrinho = \? AND id_cliente = \? FOR UPDATE/.test(s)) {
            const c = estado.carrinhos.get(Number(p[0]));
            return r(c && c.id_cliente === Number(p[1]) ? [{ id_carrinho: c.id_carrinho }] : []);
        }
        if (/^SELECT pe.id_pedido FROM pedido pe INNER JOIN item_pedido ip ON ip.id_pedido = pe.id_pedido WHERE pe.id_cliente = \? AND pe.status_pedido = 'pendente'/.test(s)) {
            const [cliente, ids] = p;
            const achados = estado.pedidos
                .filter(pe => pe.id_cliente === Number(cliente) && pe.status === 'pendente'
                    && estado.itensPedido.some(i => i.id_pedido === pe.id_pedido && ids.includes(i.id_produto)))
                .sort((a, b) => b.id_pedido - a.id_pedido);
            return r(achados.slice(0, 1).map(pe => ({ id_pedido: pe.id_pedido })));
        }
        if (/^SELECT status_pedido AS status FROM pedido WHERE id_pedido = \? AND id_cliente = \?/.test(s)) {
            const pe = estado.pedidos.find(x => x.id_pedido === Number(p[0]) && x.id_cliente === Number(p[1]));
            return r(pe ? [{ status: pe.status }] : []);
        }
        if (/^SELECT id_pedido, id_cliente, status_pedido AS status FROM pedido WHERE id_pedido = \? FOR UPDATE/.test(s)) {
            const pe = estado.pedidos.find(x => x.id_pedido === Number(p[0]));
            return r(pe ? [{ id_pedido: pe.id_pedido, id_cliente: pe.id_cliente, status: pe.status }] : []);
        }
        {
            const m = /^UPDATE pedido SET status_pedido = '(\w+)'(, data_pagamento = NOW\(\))? WHERE id_pedido = \? AND status_pedido = '(\w+)'$/.exec(s);
            if (m) {
                const pe = estado.pedidos.find(x => x.id_pedido === Number(p[0]) && x.status === m[3]);
                if (!pe) return ok(0);
                pe.status = m[1];
                if (m[2]) pe.data_pagamento = new Date();
                return ok(1);
            }
        }
        if (/^DELETE FROM cupom_uso WHERE id_pedido = \?/.test(s)) {
            const antes = estado.usos.length;
            estado.usos = estado.usos.filter(u => u.id_pedido !== Number(p[0]));
            return ok(antes - estado.usos.length);
        }
        if (/^SELECT preco_unitario FROM item_pedido WHERE id_pedido = \?/.test(s)) {
            return r(estado.itensPedido.filter(i => i.id_pedido === Number(p[0])).map(i => ({ preco_unitario: i.preco_unitario })));
        }
        if (/AS qtd_itens/.test(s)) { // Pedido.listarPorCliente (Minhas compras)
            return r(estado.pedidos.filter(pe => pe.id_cliente === Number(p[0])).sort((a, b) => b.id_pedido - a.id_pedido).map(pe => {
                const itens = estado.itensPedido.filter(i => i.id_pedido === pe.id_pedido);
                const pr = estado.produtos.get((itens[0] || {}).id_produto) || {};
                return { id_pedido: pe.id_pedido, data_pedido: new Date(), status: pe.status, qtd_itens: itens.length,
                    total: itens.reduce((soma, i) => soma + i.preco_unitario, 0), titulo_principal: pr.titulo || null, imagem_principal: '' };
            }));
        }
        if (/MAX\(pe.data_pedido\) AS data_pedido FROM item_pedido ip/.test(s)) { // Pedido.listarDownloads
            const pagos = new Set(estado.pedidos.filter(pe => pe.id_cliente === Number(p[0]) && pe.status === 'pago').map(pe => pe.id_pedido));
            const ids = [...new Set(estado.itensPedido.filter(i => pagos.has(i.id_pedido)).map(i => i.id_produto))];
            return r(ids.map(id => {
                const pr = estado.produtos.get(id);
                return { id_produto: id, titulo: pr.titulo, imagem: pr.imagem, tipo_produto: pr.tipo, arquivo: pr.arquivo, data_pedido: new Date() };
            }));
        }
        if (/^SELECT 1 FROM item_pedido ip INNER JOIN pedido pe ON ip.id_pedido = pe.id_pedido WHERE pe.id_cliente = \? AND ip.id_produto = \? AND pe.status_pedido = 'pago'/.test(s)) {
            const pagos = new Set(estado.pedidos.filter(pe => pe.id_cliente === Number(p[0]) && pe.status === 'pago').map(pe => pe.id_pedido));
            return r(estado.itensPedido.some(i => pagos.has(i.id_pedido) && i.id_produto === Number(p[1])) ? [{ 1: 1 }] : []);
        }

        // ---- Exclusão de conta (Usuario.excluir) ----
        if (/^SELECT COUNT\(\*\) AS vendas FROM item_pedido ip INNER JOIN produto p ON p.id_produto = ip.id_produto WHERE p.id_criador = \?/.test(s)) {
            return r([{ vendas: estado.itensPedido.filter(i => (estado.produtos.get(i.id_produto) || {}).id_criador === Number(p[0])).length }]);
        }
        if (/^SELECT COUNT\(\*\) AS pagamentos FROM pagamento pg INNER JOIN pedido p ON p.id_pedido = pg.id_pedido WHERE p.id_cliente = \? AND pg.mp_order_id IS NOT NULL/.test(s)) {
            const deles = new Set(estado.pedidos.filter(pe => pe.id_cliente === Number(p[0])).map(pe => pe.id_pedido));
            return r([{ pagamentos: estado.pagamentos.filter(pg => deles.has(pg.id_pedido) && pg.mp_order_id).length }]);
        }
        if (/^UPDATE usuario SET status_usuario = 'suspenso' WHERE id_usuario = \?/.test(s)) {
            const u = estado.usuarios.get(Number(p[0]));
            if (u) u.status = 'suspenso';
            return ok(u ? 1 : 0);
        }

        // ---- Pagamento (tentativas) e pagamento_evento ----
        const linhaPagamento = pg => ({ ...pg });
        if (/^INSERT INTO pagamento \(id_pedido, tentativa, chave_idempotencia, external_reference, valor_centavos, moeda\)/.test(s)) {
            const [id_pedido, tentativa, chave, ref, valor] = p;
            if (estado.pagamentos.some(pg => (pg.id_pedido === id_pedido && pg.tentativa === tentativa) || pg.chave_idempotencia === chave)) dup();
            const id = estado.seq.pagamento++;
            estado.pagamentos.push({ id_pagamento: id, id_pedido, tentativa, chave_idempotencia: chave, mp_order_id: null, mp_payment_id: null,
                external_reference: ref, valor_centavos: valor, valor_pago_centavos: null, moeda: 'BRL', status_mp: null, status_detail_mp: null,
                metodo_pagamento: null, checkout_url: null, expira_em: null, live_mode: null, ultimo_erro: null, criado_em: new Date() });
            return ok(1, { insertId: id });
        }
        if (/^SELECT \* FROM pagamento WHERE id_pagamento = \?$/.test(s)) {
            return r(estado.pagamentos.filter(pg => pg.id_pagamento === Number(p[0])).map(linhaPagamento));
        }
        if (/^SELECT \* FROM pagamento WHERE mp_order_id = \?$/.test(s)) {
            return r(estado.pagamentos.filter(pg => pg.mp_order_id === p[0]).map(linhaPagamento));
        }
        if (/^SELECT pg\.\*, pe\.status_pedido FROM pagamento pg INNER JOIN pedido pe ON pe\.id_pedido = pg\.id_pedido WHERE pg\.mp_order_id = \? AND pe\.id_cliente = \?/.test(s)) {
            return r(estado.pagamentos.filter(pg => pg.mp_order_id === p[0]).map(pg => {
                const pe = estado.pedidos.find(x => x.id_pedido === pg.id_pedido);
                return pe && pe.id_cliente === Number(p[1]) ? { ...pg, status_pedido: pe.status } : null;
            }).filter(Boolean));
        }
        if (/^SELECT pg\.\*, pe\.status_pedido FROM pagamento pg INNER JOIN pedido pe ON pe\.id_pedido = pg\.id_pedido WHERE pg\.id_pedido = \? AND pe\.id_cliente = \?/.test(s)) {
            const pe = estado.pedidos.find(x => x.id_pedido === Number(p[0]) && x.id_cliente === Number(p[1]));
            if (!pe) return r([]);
            const lista = estado.pagamentos.filter(pg => pg.id_pedido === pe.id_pedido).sort((a, b) => b.tentativa - a.tentativa);
            return r(lista.slice(0, 1).map(pg => ({ ...pg, status_pedido: pe.status })));
        }
        if (/^SELECT (\*|tentativa, status_mp, status_detail_mp, metodo_pagamento, expira_em, ultimo_erro) FROM pagamento WHERE id_pedido = \? ORDER BY tentativa DESC LIMIT 1/.test(s)) {
            const lista = estado.pagamentos.filter(pg => pg.id_pedido === Number(p[0])).sort((a, b) => b.tentativa - a.tentativa);
            return r(lista.slice(0, 1).map(linhaPagamento));
        }
        if (/^SELECT \* FROM pagamento WHERE id_pedido = \? ORDER BY tentativa FOR UPDATE/.test(s)) {
            return r(estado.pagamentos.filter(pg => pg.id_pedido === Number(p[0])).sort((a, b) => a.tentativa - b.tentativa).map(linhaPagamento));
        }
        if (/^UPDATE pagamento SET mp_order_id = \?, checkout_url = \?, status_mp = \?, status_detail_mp = \?, expira_em = \?, ultimo_erro = NULL WHERE id_pagamento = \? AND \(mp_order_id IS NULL OR mp_order_id = \?\)/.test(s)) {
            const [order, url, st, det, expira, id] = p;
            if (estado.pagamentos.some(pg => pg.mp_order_id === order && pg.id_pagamento !== Number(id))) dup();
            const pg = estado.pagamentos.find(x => x.id_pagamento === Number(id) && (x.mp_order_id === null || x.mp_order_id === order));
            if (!pg) return ok(0);
            Object.assign(pg, { mp_order_id: order, checkout_url: url, status_mp: st, status_detail_mp: det, expira_em: expira, ultimo_erro: null });
            return ok(1);
        }
        if (/^UPDATE pagamento SET ultimo_erro = \? WHERE id_pagamento = \?/.test(s)) {
            const pg = estado.pagamentos.find(x => x.id_pagamento === Number(p[1]));
            if (pg) pg.ultimo_erro = p[0];
            return ok(pg ? 1 : 0);
        }
        if (/^UPDATE pagamento SET status_mp = \?, status_detail_mp = \?, mp_payment_id = COALESCE/.test(s)) {
            const [st, det, pay, metodo, pago, live, erro, id] = p;
            const pg = estado.pagamentos.find(x => x.id_pagamento === Number(id));
            if (!pg) return ok(0);
            Object.assign(pg, { status_mp: st, status_detail_mp: det, mp_payment_id: pay ?? pg.mp_payment_id,
                metodo_pagamento: metodo ?? pg.metodo_pagamento, valor_pago_centavos: pago, live_mode: live ?? pg.live_mode, ultimo_erro: erro });
            return ok(1);
        }
        if (/^INSERT INTO pagamento_evento/.test(s)) {
            const [x_request_id, tipo, acao, mp_resource_id, live_mode, resultado, detalhe] = p;
            const id = estado.seq.evento++;
            estado.eventos.push({ id_evento: id, x_request_id, tipo, acao, mp_resource_id, live_mode, resultado, detalhe });
            return ok(1, { insertId: id });
        }
        if (/^UPDATE pagamento_evento SET resultado = \?, detalhe = \? WHERE id_evento = \?/.test(s)) {
            const ev = estado.eventos.find(e => e.id_evento === Number(p[2]));
            if (ev) Object.assign(ev, { resultado: p[0], detalhe: p[1] });
            return ok(ev ? 1 : 0);
        }
        if (/^SELECT 1 FROM pagamento_evento WHERE x_request_id = \? AND mp_resource_id = \? AND resultado = 'processado'/.test(s)) {
            return r(estado.eventos.some(e => e.x_request_id === p[0] && e.mp_resource_id === p[1] && e.resultado === 'processado') ? [{ 1: 1 }] : []);
        }
        if (/^INSERT INTO item_pedido \(id_pedido, id_produto, quantidade, preco_unitario, desconto\)/.test(s)) {
            estado.itensPedido.push({ id_pedido: p[0], id_produto: p[1], quantidade: 1, preco_unitario: Number(p[2]), desconto: Number(p[3]) });
            return ok(1);
        }
        if (/^INSERT INTO item_pedido \(id_pedido, id_produto, quantidade, preco_unitario\)/.test(s)) {
            estado.itensPedido.push({ id_pedido: p[0], id_produto: p[1], quantidade: 1, preco_unitario: Number(p[2]), desconto: 0 });
            return ok(1);
        }
        if (/^SELECT id_pedido, id_cliente, data_pedido, data_pagamento, status_pedido AS status FROM pedido WHERE id_pedido = \? AND id_cliente = \?/.test(s)) {
            const pe = estado.pedidos.find(x => x.id_pedido === Number(p[0]) && x.id_cliente === Number(p[1]));
            return r(pe ? [{ id_pedido: pe.id_pedido, id_cliente: pe.id_cliente, data_pedido: new Date(), data_pagamento: pe.data_pagamento || null, status: pe.status }] : []);
        }
        if (/FROM item_pedido ip INNER JOIN produto p ON ip.id_produto = p.id_produto WHERE ip.id_pedido = \?/.test(s)) {
            return r(estado.itensPedido.filter(i => i.id_pedido === Number(p[0])).map(i => {
                const pr = estado.produtos.get(i.id_produto);
                return { id_produto: i.id_produto, quantidade: 1, preco_unitario: i.preco_unitario, desconto: i.desconto,
                    titulo: pr.titulo, imagem: pr.imagem, tipo_produto: pr.tipo, arquivo: pr.arquivo };
            }));
        }
        if (/FROM cupom_uso cu INNER JOIN cupom c ON c.id_cupom = cu.id_cupom WHERE cu.id_pedido = \?/.test(s)) {
            const u = estado.usos.find(x => x.id_pedido === Number(p[0]));
            return r(u ? [{ codigo: estado.cupons.get(u.id_cupom).codigo, valor_desconto: u.valor_desconto }] : []);
        }
        if (/^SELECT DATE_FORMAT\(CURDATE\(\), '%Y-%m-%d'\) AS hoje/.test(s)) return r([{ hoje: estado.hojeBanco }]);
        if (/AS chave, COALESCE\(SUM\(ip.quantidade \* ip.preco_unitario\), 0\) AS faturamento/.test(s)) {
            const porMes = /'%Y-%m' \) AS chave|'%Y-%m'\) AS chave/.test(s);
            const grupos = {};
            estado.pedidos.filter(pe => pe.status === 'pago' && pe.data >= p[p.length - 1]).forEach(pe => {
                const chave = porMes ? pe.data.slice(0, 7) : pe.data;
                estado.itensPedido.filter(i => i.id_pedido === pe.id_pedido).forEach(i => {
                    const g = grupos[chave] || (grupos[chave] = { chave, faturamento: 0, vendas: 0, pedidos: new Set(), descontos: 0 });
                    g.faturamento += i.preco_unitario; g.vendas++; g.pedidos.add(pe.id_pedido); g.descontos += i.desconto;
                });
            });
            return r(Object.values(grupos).map(g => ({ ...g, pedidos: g.pedidos.size })));
        }

        if (/^UPDATE (cliente|criador) SET data_ultimo_ped/.test(s)) return ok(1);
        if (/SUM\(ip\.quantidade \* ip\.preco_unitario\), 0\) AS total, COUNT\(\*\) AS vendas/.test(s)) return r([{ total: 0, vendas: 0 }]);
        if (/^(SELECT|DELETE)/.test(s)) return r([]);
        return ok(0);
    }

    // Transações serializadas (faz o papel do SELECT ... FOR UPDATE do MySQL: uma finalização
    // simultânea espera a outra terminar). O rollback só restaura o snapshot se a transação escreveu,
    // para não desfazer gravações feitas fora dela enquanto esperava.
    let fila = Promise.resolve();
    function travar() {
        let soltar;
        const minhaVez = fila;
        fila = new Promise(resolve => { soltar = resolve; });
        return minhaVez.then(() => soltar);
    }

    const banco = {
        get estado() { return estado; },
        pool: {
            on() {},
            query,
            async getConnection() {
                let copia = null;
                let soltar = null;
                let escreveu = false;
                const liberar = () => { if (soltar) { const s = soltar; soltar = null; s(); } };
                return {
                    async query(sql, p) {
                        if (soltar && /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) escreveu = true;
                        return query(sql, p);
                    },
                    async beginTransaction() { soltar = await travar(); copia = structuredClone(estado); escreveu = false; },
                    async commit() { copia = null; liberar(); },
                    async rollback() { if (copia && escreveu) estado = copia; copia = null; liberar(); },
                    release() { liberar(); }
                };
            }
        }
    };
    return banco;
}

module.exports = { criarBancoLoja };
