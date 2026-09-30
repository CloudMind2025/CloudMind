const crypto = require('crypto');
const pool = require('../../config/db');
const arquivosProduto = require('../helpers/arquivosProduto');
const cupons = require('../helpers/cupons');
const Cupom = require('./Cupom');
const Carrinho = require('./Carrinho');
const Pagamento = require('./Pagamento');

const semColunaCupom = err => err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE');

class ErroPedidoPendente extends Error {
    constructor(id_pedido) {
        super('Já existe um pedido aguardando pagamento com estes produtos.');
        this.name = 'ErroPedidoPendente';
        this.id_pedido = id_pedido;
    }
}

class ErroCarrinhoMudou extends Error {
    constructor() {
        super('Seu carrinho mudou durante a finalização. Confira os itens e o total e finalize de novo — nenhum pedido foi criado e nada foi cobrado.');
        this.name = 'ErroCarrinhoMudou';
    }
}

// Itens do carrinho que podem ser comprados agora: ativos, ainda não pagos e de outro vendedor.
function filtrarCompraveis(id_cliente, itens, jaComprados) {
    return itens
        .filter(i => i.status_produto === 'ativo' && !jaComprados.includes(i.id_produto)
                  && Number(i.id_criador) !== Number(id_cliente))
        .map(i => ({ id_produto: i.id_produto, preco: parseFloat(i.preco_atual), id_criador: i.id_criador }));
}

// Preço em reais (número) → centavos inteiros. Ausente, NaN ou negativo é erro, nunca "grátis".
function centavosDoItem(valor) {
    const c = typeof valor === 'number' ? Math.round(valor * 100) : NaN;
    if (!Number.isSafeInteger(c) || c < 0) throw new Error('Valor de item inválido na finalização do pedido.');
    return c;
}

function mesmosItens(a, b) {
    const chave = lista => lista.map(i => `${i.id_produto}:${Math.round(Number(i.preco) * 100)}`).sort().join('|');
    return a.length === b.length && chave(a) === chave(b);
}

const Pedido = {

    ErroPedidoPendente,
    ErroCarrinhoMudou,
    filtrarCompraveis,
    centavosDoItem,

    async listarPorCliente(id_cliente) {
        const [rows] = await pool.query(
            `SELECT pe.id_pedido, pe.data_pedido, pe.status_pedido AS status,
                    COUNT(ip.id_produto) AS qtd_itens,
                    COALESCE(SUM(ip.quantidade * ip.preco_unitario), 0) AS total,
                    SUBSTRING_INDEX(GROUP_CONCAT(p.titulo_produto ORDER BY ip.id_produto SEPARATOR '\\n'), '\\n', 1) AS titulo_principal,
                    SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(p.imagem, '') ORDER BY ip.id_produto SEPARATOR '\\n'), '\\n', 1) AS imagem_principal
             FROM pedido pe
             LEFT JOIN item_pedido ip ON ip.id_pedido  = pe.id_pedido
             LEFT JOIN produto p      ON p.id_produto  = ip.id_produto
             WHERE pe.id_cliente = ?
             GROUP BY pe.id_pedido
             ORDER BY pe.data_pedido DESC, pe.id_pedido DESC`,
            [id_cliente]
        );
        return rows;
    },

    async buscarComItens(id_pedido, id_cliente) {
        const [pedido] = await pool.query(
            `SELECT id_pedido, id_cliente, data_pedido, data_pagamento, status_pedido AS status
             FROM pedido WHERE id_pedido = ? AND id_cliente = ?`,
            [id_pedido, id_cliente]
        );
        if (!pedido[0]) return { pedido: undefined, itens: [] };
        const consultaItens = comDesconto => pool.query(
            `SELECT ip.id_produto, ip.quantidade, ip.preco_unitario, ${comDesconto ? 'ip.desconto' : '0 AS desconto'},
                    p.titulo_produto AS titulo, p.imagem, p.tipo_produto, p.arquivo
             FROM item_pedido ip INNER JOIN produto p ON ip.id_produto = p.id_produto
             WHERE ip.id_pedido = ?`,
            [id_pedido]
        );
        const [itens] = await consultaItens(true).catch(err => {
            if (semColunaCupom(err)) return consultaItens(false);
            throw err;
        });
        const [usoCupom] = await pool.query(
            `SELECT c.codigo, cu.valor_desconto FROM cupom_uso cu INNER JOIN cupom c ON c.id_cupom = cu.id_cupom
             WHERE cu.id_pedido = ?`,
            [id_pedido]
        ).catch(err => { if (semColunaCupom(err)) return [[]]; throw err; });
        pedido[0].cupom = usoCupom[0] ? { codigo: usoCupom[0].codigo, valor_desconto: Number(usoCupom[0].valor_desconto) } : null;
        return {
            pedido: pedido[0],
            itens: itens.map(({ arquivo, ...i }) => ({ ...i, formato_arquivo: arquivosProduto.formatoDoArquivo(arquivo) }))
        };
    },

    async listarDownloads(id_cliente) {
        const [rows] = await pool.query(
            `SELECT p.id_produto, p.titulo_produto AS titulo, p.imagem, p.tipo_produto, p.arquivo,
                    MAX(pe.data_pedido) AS data_pedido
             FROM item_pedido ip
             INNER JOIN pedido  pe ON ip.id_pedido  = pe.id_pedido
             INNER JOIN produto p  ON ip.id_produto = p.id_produto
             WHERE pe.id_cliente = ? AND pe.status_pedido = 'pago'
             GROUP BY p.id_produto
             ORDER BY data_pedido DESC`,
            [id_cliente]
        );
        return rows.map(({ arquivo, ...d }) => ({ ...d, formato_arquivo: arquivosProduto.formatoDoArquivo(arquivo) }));
    },

    async clientePossuiProduto(id_cliente, id_produto) {
        const [rows] = await pool.query(
            `SELECT 1 FROM item_pedido ip
             INNER JOIN pedido pe ON ip.id_pedido = pe.id_pedido
             WHERE pe.id_cliente = ? AND ip.id_produto = ? AND pe.status_pedido = 'pago'
             LIMIT 1`,
            [id_cliente, id_produto]
        );
        return rows.length > 0;
    },

    async produtosJaComprados(id_cliente, ids_produto, conn = pool) {
        if (!ids_produto.length) return [];
        const [rows] = await conn.query(
            `SELECT DISTINCT ip.id_produto FROM item_pedido ip
             INNER JOIN pedido pe ON ip.id_pedido = pe.id_pedido
             WHERE pe.id_cliente = ? AND pe.status_pedido = 'pago' AND ip.id_produto IN (?)`,
            [id_cliente, ids_produto]
        );
        return rows.map(r => r.id_produto);
    },

    // Pedido do cliente ainda aguardando pagamento com algum destes produtos (evita cobrança em dobro).
    async pendenteComProdutos(id_cliente, ids_produto, conn = pool) {
        if (!ids_produto.length) return null;
        const [rows] = await conn.query(
            `SELECT pe.id_pedido FROM pedido pe
             INNER JOIN item_pedido ip ON ip.id_pedido = pe.id_pedido
             WHERE pe.id_cliente = ? AND pe.status_pedido = 'pendente' AND ip.id_produto IN (?)
             ORDER BY pe.id_pedido DESC LIMIT 1`,
            [id_cliente, ids_produto]
        );
        return rows[0] ? rows[0].id_pedido : null;
    },

    async buscarStatus(id_pedido, id_cliente) {
        const [rows] = await pool.query(
            `SELECT status_pedido AS status FROM pedido WHERE id_pedido = ? AND id_cliente = ?`,
            [id_pedido, id_cliente]
        );
        return rows[0] ? rows[0].status : null;
    },

    // Cria o pedido numa transação só. Os itens e preços são relidos do banco aqui dentro, com o
    // carrinho travado, e precisam bater com o que o cliente viu (`esperados`).
    // modoCobranca: 'online' (Mercado Pago) → pedido 'pendente' + tentativa de pagamento com a chave
    // de idempotência já gravada; 'demonstracao' → pago na hora. Total R$ 0,00 → pago na hora, sem MP.
    // Nenhuma chamada externa acontece com esta transação aberta.
    async criarComItens(id_cliente, id_carrinho, esperados, modoCobranca, cupom = null) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            await conn.query(
                `SELECT id_carrinho FROM carrinho WHERE id_carrinho = ? AND id_cliente = ? FOR UPDATE`,
                [id_carrinho, id_cliente]
            );
            const pendente = await this.pendenteComProdutos(id_cliente, esperados.map(i => i.id_produto), conn);
            if (pendente) throw new ErroPedidoPendente(pendente);

            const noCarrinho = await Carrinho.listarItens(id_carrinho, conn);
            const jaComprados = await this.produtosJaComprados(id_cliente, noCarrinho.map(i => i.id_produto), conn);
            const itens = filtrarCompraveis(id_cliente, noCarrinho, jaComprados);
            if (!itens.length || !mesmosItens(itens, esperados)) throw new ErroCarrinhoMudou();

            let calculo = null;
            let cupomTravado = null;
            if (cupom) {
                const { cupom: atual, jaUsou } = await Cupom.buscarParaCompra(conn, cupom.id_cupom, id_cliente);
                const verificacao = cupons.verificarUso({ cupom: atual, itens, dia: cupom.dia, jaUsou });
                if (!verificacao.ok) throw new cupons.ErroCupom(verificacao.erro);
                if (Math.abs(verificacao.calculo.desconto - Number(cupom.descontoEsperado)) > 0.001) {
                    throw new cupons.ErroCupom('O desconto do cupom mudou durante a finalização. Confira o carrinho e tente de novo.');
                }
                calculo = verificacao.calculo;
                cupomTravado = atual;
            }

            const linhas = itens.map(item => {
                const linha = calculo ? calculo.itens.find(i => i.id_produto === item.id_produto) : null;
                return {
                    id_produto: item.id_produto,
                    centavos: centavosDoItem(linha ? linha.precoFinal : item.preco),
                    desconto: linha ? linha.desconto : null
                };
            });
            const total_centavos = linhas.reduce((soma, l) => soma + l.centavos, 0);
            const pagoAgora = total_centavos === 0 || modoCobranca !== 'online';
            const status = pagoAgora ? 'pago' : 'pendente';

            const [result] = await conn.query(
                `INSERT INTO pedido (id_cliente, status_pedido, data_pagamento) VALUES (?, ?, ${pagoAgora ? 'NOW()' : 'NULL'})`,
                [id_cliente, status]
            );
            const id_pedido = result.insertId;
            for (const l of linhas) {
                if (l.desconto != null) {
                    await conn.query(
                        `INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario, desconto) VALUES (?, ?, 1, ?, ?)`,
                        [id_pedido, l.id_produto, cupons.reais(l.centavos), l.desconto]
                    );
                } else {
                    await conn.query(
                        `INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario) VALUES (?, ?, 1, ?)`,
                        [id_pedido, l.id_produto, cupons.reais(l.centavos)]
                    );
                }
            }
            if (calculo) {
                await conn.query(
                    `INSERT INTO cupom_uso (id_cupom, id_cliente, id_pedido, valor_desconto) VALUES (?, ?, ?, ?)`,
                    [cupomTravado.id_cupom, id_cliente, id_pedido, calculo.desconto]
                );
                await conn.query(`UPDATE carrinho SET id_cupom = NULL WHERE id_carrinho = ?`, [id_carrinho]);
            }
            let id_pagamento = null;
            if (!pagoAgora) {
                id_pagamento = await Pagamento.criarTentativa(conn, {
                    id_pedido, tentativa: 1, chave: crypto.randomUUID(),
                    external_reference: `pedido-${id_pedido}`, valor_centavos: total_centavos
                });
            }
            await conn.query(
                `DELETE FROM item_carrinho WHERE id_carrinho = ? AND id_produto IN (?)`,
                [id_carrinho, itens.map(i => i.id_produto)]
            );
            await conn.query(`UPDATE cliente SET data_ultimo_ped = NOW() WHERE id_usuario = ?`, [id_cliente]);
            await conn.query(
                `UPDATE criador SET data_ultimo_ped = NOW() WHERE id_usuario IN (?)`,
                [[...new Set(itens.map(i => i.id_criador))]]
            );
            await conn.commit();
            return { id_pedido, status, id_pagamento, total_centavos };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    // ===== Painéis (dados reais) =====

    async vendasPorMes({ id_criador = null, meses = 6 } = {}) {
        const params = [meses - 1];
        let filtroCriador = '';
        if (id_criador) { filtroCriador = 'AND p.id_criador = ?'; params.push(id_criador); }
        const [rows] = await pool.query(
            `SELECT DATE_FORMAT(pe.data_pedido, '%Y-%m') AS mes,
                    SUM(ip.quantidade * ip.preco_unitario) AS total,
                    COUNT(*) AS itens
             FROM item_pedido ip
             INNER JOIN pedido pe  ON ip.id_pedido  = pe.id_pedido
             INNER JOIN produto p  ON ip.id_produto = p.id_produto
             WHERE pe.status_pedido = 'pago'
               AND pe.data_pedido >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m-01')
               ${filtroCriador}
             GROUP BY mes ORDER BY mes`,
            params
        );
        return rows.map(r => ({ mes: r.mes, total: Number(r.total), itens: Number(r.itens) }));
    },

    async vendasRecentesDoCriador(id_criador, limite = 5) {
        const [rows] = await pool.query(
            `SELECT pe.id_pedido, pe.data_pedido, pe.status_pedido AS status,
                    ip.preco_unitario, ip.quantidade,
                    p.id_produto, p.titulo_produto AS titulo,
                    u.nome_usuario AS nome_cliente
             FROM item_pedido ip
             INNER JOIN pedido pe  ON ip.id_pedido  = pe.id_pedido
             INNER JOIN produto p  ON ip.id_produto = p.id_produto
             INNER JOIN usuario u  ON pe.id_cliente = u.id_usuario
             WHERE p.id_criador = ?
             ORDER BY pe.data_pedido DESC, pe.id_pedido DESC
             LIMIT ?`,
            [id_criador, limite]
        );
        return rows;
    },

    async totaisDoCriador(id_criador) {
        const [[row]] = await pool.query(
            `SELECT COALESCE(SUM(ip.quantidade * ip.preco_unitario), 0) AS total, COUNT(*) AS vendas
             FROM item_pedido ip
             INNER JOIN pedido pe ON ip.id_pedido  = pe.id_pedido
             INNER JOIN produto p ON ip.id_produto = p.id_produto
             WHERE p.id_criador = ? AND pe.status_pedido = 'pago'`,
            [id_criador]
        );
        return { total: Number(row.total), vendas: Number(row.vendas) };
    },

    async serieVendas() {
        const hoje = cupons.hoje();
        const ajuste = cupons.minutosDoFuso();
        const [a, m, d] = hoje.split('-').map(Number);
        const iso = dt => dt.toISOString().slice(0, 10);
        const inicioDias = new Date(Date.UTC(a, m - 1, d - 29));
        const inicioMeses = new Date(Date.UTC(a, m - 1 - 11, 1));

        const dataLocal = 'DATE_ADD(pe.data_pedido, INTERVAL (? - TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW())) MINUTE)';
        const consulta = (formato, inicio, comDesconto) => pool.query(
            `SELECT DATE_FORMAT(${dataLocal}, '${formato}') AS chave,
                    COALESCE(SUM(ip.quantidade * ip.preco_unitario), 0) AS faturamento,
                    COUNT(*) AS vendas,
                    COUNT(DISTINCT pe.id_pedido) AS pedidos,
                    ${comDesconto ? 'COALESCE(SUM(ip.desconto), 0)' : '0'} AS descontos
             FROM item_pedido ip
             INNER JOIN pedido pe ON ip.id_pedido = pe.id_pedido
             WHERE pe.status_pedido = 'pago' AND ${dataLocal} >= ?
             GROUP BY chave ORDER BY chave`,
            [ajuste, ajuste, inicio]
        );
        const buscar = async (formato, inicio) => {
            const [rows] = await consulta(formato, inicio, true).catch(err => {
                if (semColunaCupom(err)) return consulta(formato, inicio, false);
                throw err;
            });
            const porChave = {};
            rows.forEach(r => { porChave[r.chave] = r; });
            return porChave;
        };

        const [diasBanco, mesesBanco] = await Promise.all([buscar('%Y-%m-%d', iso(inicioDias)), buscar('%Y-%m', iso(inicioMeses))]);
        const ponto = (chave, r) => ({
            chave,
            faturamento: r ? Number(Number(r.faturamento).toFixed(2)) : 0,
            vendas: r ? Number(r.vendas) : 0,
            pedidos: r ? Number(r.pedidos) : 0,
            descontos: r ? Number(Number(r.descontos).toFixed(2)) : 0
        });
        const dias = [];
        for (let i = 0; i < 30; i++) {
            const chave = iso(new Date(Date.UTC(a, m - 1, d - 29 + i)));
            dias.push(ponto(chave, diasBanco[chave]));
        }
        const meses = [];
        for (let i = 0; i < 12; i++) {
            const chave = iso(new Date(Date.UTC(a, m - 1 - 11 + i, 1))).slice(0, 7);
            meses.push(ponto(chave, mesesBanco[chave]));
        }
        return { hoje, dias, meses };
    },

    // ===== Transições de status (monotônicas: pendente→pago|cancelado, pago→reembolsado) =====
    // Usadas dentro da transação da conciliação, com o pedido travado por bloquear().

    async totalCentavos(conn, id_pedido) {
        const [rows] = await conn.query(`SELECT preco_unitario FROM item_pedido WHERE id_pedido = ?`, [id_pedido]);
        return rows.reduce((soma, r) => soma + centavosDoItem(Number(r.preco_unitario)), 0);
    },

    async bloquear(conn, id_pedido) {
        const [rows] = await conn.query(
            `SELECT id_pedido, id_cliente, status_pedido AS status FROM pedido WHERE id_pedido = ? FOR UPDATE`,
            [id_pedido]
        );
        return rows[0];
    },

    async marcarPago(conn, id_pedido) {
        const [result] = await conn.query(
            `UPDATE pedido SET status_pedido = 'pago', data_pagamento = NOW() WHERE id_pedido = ? AND status_pedido = 'pendente'`,
            [id_pedido]
        );
        return result.affectedRows;
    },

    // Cancelar devolve o cupom: o uso reservado na criação do pedido deixa de contar.
    async marcarCancelado(conn, id_pedido) {
        const [result] = await conn.query(
            `UPDATE pedido SET status_pedido = 'cancelado' WHERE id_pedido = ? AND status_pedido = 'pendente'`,
            [id_pedido]
        );
        if (result.affectedRows) {
            await conn.query(`DELETE FROM cupom_uso WHERE id_pedido = ?`, [id_pedido])
                .catch(err => { if (!semColunaCupom(err)) throw err; });
        }
        return result.affectedRows;
    },

    async marcarReembolsado(conn, id_pedido) {
        const [result] = await conn.query(
            `UPDATE pedido SET status_pedido = 'reembolsado' WHERE id_pedido = ? AND status_pedido = 'pago'`,
            [id_pedido]
        );
        return result.affectedRows;
    },

    async cancelar(id_pedido) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const alterados = await this.marcarCancelado(conn, id_pedido);
            await conn.commit();
            return alterados;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }
};

module.exports = Pedido;
