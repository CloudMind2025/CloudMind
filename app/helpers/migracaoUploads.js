const fs   = require('fs');
const path = require('path');
const armazenamento   = require('./armazenamento');
const imagensProduto  = require('./imagensProduto');
const arquivosProduto = require('./arquivosProduto');

const PUBLICO = path.resolve(__dirname, '..', 'public');

function nomeLocal(valor) {
    return path.basename(String(valor || '').split('?')[0]);
}

function nomeDeterministico(valor) {
    const base = nomeLocal(valor).toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[^a-z0-9]+/, '');
    return `legado-${base}`.slice(0, 150);
}

const TIPOS = [
    {
        nome: 'Capa do produto', tabela: 'produto', pk: 'id_produto', coluna: 'imagem', dono: 'id_produto',
        filtro: `imagem LIKE 'image/uploads/%'`,
        local: (v, pastas) => path.join(pastas.publico, 'image', 'uploads', nomeLocal(v)),
        destino: ['products', 'cover'], publico: true
    },
    {
        nome: 'Imagem da galeria', tabela: 'produto_imagem', pk: 'id_imagem', coluna: 'caminho', dono: 'id_produto',
        filtro: `caminho LIKE 'image/uploads/%'`,
        local: (v, pastas) => path.join(pastas.publico, 'image', 'uploads', nomeLocal(v)),
        destino: ['products', 'gallery'], publico: true
    },
    {
        nome: 'Arquivo do produto', tabela: 'produto', pk: 'id_produto', coluna: 'arquivo', dono: 'id_produto',
        filtro: `arquivo IS NOT NULL AND arquivo <> '' AND arquivo NOT LIKE '%/%'`,
        local: (v, pastas) => path.join(pastas.arquivos, nomeLocal(v)),
        destino: ['products', 'files'], publico: false
    },
    {
        nome: 'Foto de perfil', tabela: 'usuario', pk: 'id_usuario', coluna: 'foto_usuario', dono: 'id_usuario',
        filtro: `foto_usuario LIKE '/image/avatars/%'`,
        local: (v, pastas) => path.join(pastas.publico, 'image', 'avatars', nomeLocal(v)),
        destino: ['users', 'avatar'], publico: true
    },
    {
        nome: 'Capa da loja', tabela: 'criador', pk: 'id_usuario', coluna: 'capa_criador', dono: 'id_usuario',
        filtro: `capa_criador LIKE 'image/capas/%'`, opcional: true,
        local: (v, pastas) => path.join(pastas.publico, 'image', 'capas', nomeLocal(v)),
        destino: ['sellers', 'cover'], publico: true
    }
];

async function linhasLegadas(db, t) {
    try {
        const [rows] = await db.query(
            `SELECT ${t.pk} AS pk, ${t.dono} AS dono, ${t.coluna} AS valor FROM ${t.tabela} WHERE ${t.filtro} ORDER BY ${t.pk}`
        );
        return rows;
    } catch (err) {
        if (t.opcional && err.code === 'ER_BAD_FIELD_ERROR') return [];
        throw err;
    }
}

async function migrar(db, { confirmar = false, log = () => {}, pastas = { publico: PUBLICO, arquivos: arquivosProduto.DIR } } = {}) {
    if (!armazenamento.configurado()) throw new Error('Storage não configurado: defina as variáveis STORAGE_* antes de migrar.');
    const relatorio = { confirmar, inicio: new Date().toISOString(), migrados: [], jaNoStorage: [], seriaMigrado: [], naoRecuperaveis: [], erros: [] };

    for (const t of TIPOS) {
        const linhas = await linhasLegadas(db, t);
        log(`${t.nome}: ${linhas.length} referência(s) antiga(s)`);
        for (const r of linhas) {
            const item = { tipo: t.nome, tabela: t.tabela, id: r.pk, dono: r.dono, valor: r.valor };
            try {
                const caminho = t.local(r.valor, pastas);
                if (!caminho || !fs.existsSync(caminho)) {
                    relatorio.naoRecuperaveis.push({ ...item, motivo: 'O arquivo não existe nesta máquina (enviado em outra instância cujo disco já foi apagado).' });
                    continue;
                }
                let tipoConteudo = 'application/octet-stream';
                if (t.publico) {
                    const real = imagensProduto.tipoReal(caminho);
                    if (!real) {
                        relatorio.naoRecuperaveis.push({ ...item, motivo: 'O arquivo local não é uma imagem JPG/PNG válida.' });
                        continue;
                    }
                    tipoConteudo = real.mime;
                }
                const chave = `${t.destino[0]}/${Number(r.dono)}/${t.destino[1]}/${nomeDeterministico(r.valor)}`;
                if (!armazenamento.ehChave(chave)) {
                    relatorio.erros.push({ ...item, erro: `Chave gerada inválida: ${chave}` });
                    continue;
                }
                const tamanho = fs.statSync(caminho).size;
                const existente = await armazenamento.info(chave);
                const jaEnviado = !!existente && existente.tamanho === tamanho;

                if (!confirmar) {
                    relatorio.seriaMigrado.push({ ...item, chave, tamanho, jaNoStorage: jaEnviado });
                    continue;
                }
                if (!jaEnviado) await armazenamento.enviar({ chave, caminho, tipo: tipoConteudo, publico: t.publico });
                const [res] = await db.query(
                    `UPDATE ${t.tabela} SET ${t.coluna} = ? WHERE ${t.pk} = ? AND ${t.coluna} = ?`,
                    [chave, r.pk, r.valor]
                );
                if (res.affectedRows === 1) {
                    (jaEnviado ? relatorio.jaNoStorage : relatorio.migrados).push({ ...item, chave, tamanho });
                    log(`  ✔ ${t.tabela}#${r.pk}: ${r.valor} → ${chave}`);
                } else {
                    relatorio.erros.push({ ...item, chave, erro: 'O registro mudou durante a migração; nada foi alterado (o objeto enviado fica disponível para a próxima execução).' });
                }
            } catch (err) {
                relatorio.erros.push({ ...item, erro: err.message });
                log(`  ✘ ${t.tabela}#${r.pk}: ${err.message}`);
            }
        }
    }
    relatorio.fim = new Date().toISOString();
    return relatorio;
}

async function chavesReferenciadas(db) {
    const consultas = [
        ['produto', 'id_produto', 'imagem'], ['produto', 'id_produto', 'arquivo'],
        ['produto_imagem', 'id_imagem', 'caminho'], ['usuario', 'id_usuario', 'foto_usuario'],
        ['criador', 'id_usuario', 'capa_criador']
    ];
    const refs = [];
    for (const [tabela, pk, coluna] of consultas) {
        try {
            const [rows] = await db.query(`SELECT ${pk} AS pk, ${coluna} AS valor FROM ${tabela} WHERE ${coluna} IS NOT NULL`);
            rows.filter(r => armazenamento.ehChave(r.valor)).forEach(r => refs.push({ tabela, id: r.pk, coluna, chave: r.valor }));
        } catch (err) {
            if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
        }
    }
    return refs;
}

async function verificar(db, { http = true } = {}) {
    const refs = await chavesReferenciadas(db);
    const faltando = [];
    const publicasInacessiveis = [];
    for (const r of refs) {
        const info = await armazenamento.info(r.chave);
        if (!info) { faltando.push(r); continue; }
        if (http && armazenamento.ehPublica(r.chave) && typeof fetch === 'function') {
            const resp = await fetch(armazenamento.urlMidia(r.chave), { method: 'HEAD' }).catch(e => ({ status: e.message }));
            if (resp.status !== 200) publicasInacessiveis.push({ ...r, status: resp.status });
        }
    }
    return { total: refs.length, faltando, publicasInacessiveis };
}

async function orfaos(db) {
    const usadas = new Set((await chavesReferenciadas(db)).map(r => r.chave));
    const todos = [];
    for (const prefixo of Object.keys(armazenamento.PASTAS)) todos.push(...await armazenamento.listar(`${prefixo}/`));
    return todos.filter(o => !usadas.has(o.chave));
}

module.exports = { TIPOS, migrar, verificar, orfaos, chavesReferenciadas, nomeDeterministico };
