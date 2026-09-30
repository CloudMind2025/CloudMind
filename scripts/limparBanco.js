const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const {
    RAIZ, TABELAS_LIMPAR, TABELAS_MANTER, FILTRO_NAO_ADMIN,
    abrirConexao, listarConexoes, falhaAoConectar
} = require('./_banco');

const confirmar = process.argv.includes('--confirmar');

function filtro(t) {
    return t.soNaoAdmin ? ` WHERE ${FILTRO_NAO_ADMIN}` : '';
}

async function verificarTabelas(conn) {
    const [rows] = await conn.query(
        `SELECT TABLE_NAME AS nome FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`
    );
    const existentes    = new Set(rows.map(r => r.nome));
    const conhecidas    = new Set([...TABELAS_LIMPAR.map(t => t.nome), ...TABELAS_MANTER]);
    const desconhecidas = [...existentes].filter(n => !conhecidas.has(n));
    if (desconhecidas.length) {
        throw new Error(`Tabela(s) fora da lista de limpeza: ${desconhecidas.join(', ')}. ` +
                        'Inclua em scripts/_banco.js (TABELAS_LIMPAR ou TABELAS_MANTER) antes de continuar.');
    }
    return TABELAS_LIMPAR.filter(t => existentes.has(t.nome));
}

async function lerAdministradores(conn) {
    const [rows] = await conn.query(
        `SELECT u.id_usuario, u.nome_usuario, u.email_usuario, u.foto_usuario
         FROM administrador a JOIN usuario u ON u.id_usuario = a.id_usuario
         ORDER BY u.id_usuario`
    );
    return rows;
}

async function contar(conn, tabelas) {
    const contagem = {};
    for (const t of tabelas) {
        const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM ??${filtro(t)}`, [t.nome]);
        contagem[t.nome] = Number(n);
    }
    return contagem;
}

async function lerAutoIncrement(conn, tabelas) {
    const [cols] = await conn.query(
        `SELECT TABLE_NAME AS nome FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND EXTRA LIKE '%auto_increment%'`
    );
    const comAuto = new Set(cols.map(c => c.nome));
    const valores = {};
    for (const t of tabelas) {
        if (!comAuto.has(t.nome)) continue;
        const [[linha]] = await conn.query('SHOW CREATE TABLE ??', [t.nome]);
        const m = /\bAUTO_INCREMENT=(\d+)/.exec(linha['Create Table']);
        valores[t.nome] = m ? Number(m[1]) : 1;
    }
    return valores;
}

function serializar(linha) {
    const saida = {};
    for (const [coluna, valor] of Object.entries(linha)) {
        saida[coluna] = Buffer.isBuffer(valor) ? { __base64: valor.toString('base64') } : valor;
    }
    return saida;
}

async function lerBackup(conn, tabelas, administradores) {
    const autoIncrement = await lerAutoIncrement(conn, tabelas);
    const backup = {
        criadoEm: new Date().toISOString(),
        banco:    process.env.DB_NAME,
        host:     process.env.DB_HOST,
        administradores: administradores.map(a => ({ id_usuario: a.id_usuario, email_usuario: a.email_usuario })),
        tabelas:  {}
    };
    for (const t of tabelas) {
        const [linhas] = await conn.query(`SELECT * FROM ??${filtro(t)}`, [t.nome]);
        backup.tabelas[t.nome] = {
            autoIncrement: autoIncrement[t.nome] || null,
            linhas: linhas.map(serializar)
        };
    }
    return backup;
}

async function apagar(conn, tabelas) {
    const apagados = {};
    for (const t of [...tabelas].reverse()) {
        const [res] = await conn.query(`DELETE FROM ??${filtro(t)}`, [t.nome]);
        apagados[t.nome] = res.affectedRows;
    }
    return apagados;
}

async function conferir(conn, tabelas) {
    const problemas = [];
    const restantes = await contar(conn, tabelas);
    for (const [nome, n] of Object.entries(restantes)) {
        if (n !== 0) problemas.push(`${nome} ainda tem ${n} linha(s)`);
    }
    const [[{ usuarios, admins }]] = await conn.query(
        `SELECT (SELECT COUNT(*) FROM usuario) AS usuarios, (SELECT COUNT(*) FROM administrador) AS admins`
    );
    if (Number(usuarios) !== Number(admins)) {
        problemas.push(`usuario tem ${usuarios} linha(s), mas há ${admins} administrador(es)`);
    }
    return problemas;
}

// ------------------------------------------------------------
//  Arquivos enviados pelos usuários
// ------------------------------------------------------------

function sha256(arquivo) {
    return crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
}

function arquivosDaPasta(pasta) {
    if (!fs.existsSync(pasta)) return [];
    return fs.readdirSync(pasta, { withFileTypes: true })
        .filter(d => d.isFile())
        .map(d => path.join(pasta, d.name));
}

function arquivosParaMover(administradores) {
    const publico = path.join(RAIZ, 'app', 'public');
    const manter  = new Set(
        administradores
            .filter(a => a.foto_usuario)
            .map(a => path.join(publico, String(a.foto_usuario).replace(/^\/+/, '')).toLowerCase())
    );
    const fotoDeAdmin = new RegExp(`^avatar-(${administradores.map(a => Number(a.id_usuario)).join('|')})\\.`, 'i');

    const { DIR: pastaArquivosProduto } = require('../app/helpers/arquivosProduto');
    const avatars = arquivosDaPasta(path.join(publico, 'image', 'avatars'))
        .filter(f => !manter.has(f.toLowerCase()) && !(administradores.length && fotoDeAdmin.test(path.basename(f))));

    return [
        ...arquivosDaPasta(path.join(publico, 'image', 'uploads')),
        ...avatars,
        ...arquivosDaPasta(pastaArquivosProduto)
    ].filter(f => !manter.has(f.toLowerCase()));
}

function moverArquivo(origem, destino) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    try {
        fs.renameSync(origem, destino);
    } catch (err) {
        if (err.code !== 'EXDEV') throw err;
        fs.copyFileSync(origem, destino);
        fs.unlinkSync(origem);
    }
}

// ------------------------------------------------------------
//  Checkpoint
// ------------------------------------------------------------

function criarPastaCheckpoint() {
    const d    = new Date();
    const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let pasta  = path.join(RAIZ, '_checkpoints', `limpeza-banco-${data}`);
    for (let i = 2; fs.existsSync(pasta); i++) {
        pasta = path.join(RAIZ, '_checkpoints', `limpeza-banco-${data}-${i}`);
    }
    fs.mkdirSync(path.join(pasta, 'banco'), { recursive: true });
    return pasta;
}

function gravarRestaurarPs1(pasta) {
    const rel = path.relative(RAIZ, pasta);
    const ps1 = `# ============================================================
#  Desfaz a limpeza do banco registrada neste checkpoint.
# ============================================================
param(
    [string]$Raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path,
    [switch]$SemBanco
)
$ErrorActionPreference = 'Stop'
$checkpoint = $PSScriptRoot

if (-not $SemBanco) {
    & node (Join-Path $Raiz 'scripts\\restaurarBanco.js') $checkpoint
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host 'O banco NÃO foi restaurado; os arquivos continuam no checkpoint.' -ForegroundColor Red
        exit 1
    }
}

$manifesto = Join-Path $checkpoint 'arquivos.json'
if (Test-Path -LiteralPath $manifesto) {
    $lista = Get-Content -LiteralPath $manifesto -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($a in $lista) {
        $origem = Join-Path $checkpoint $a.backup
        if ([System.IO.Path]::IsPathRooted($a.original)) { $destino = $a.original } else { $destino = Join-Path $Raiz $a.original }
        if (-not (Test-Path -LiteralPath $origem)) { Write-Host "Já restaurado: $($a.original)"; continue }
        if (Test-Path -LiteralPath $destino) {
            Write-Host "Mantido no checkpoint (já existe um arquivo com esse nome): $($a.original)" -ForegroundColor Yellow
            continue
        }
        New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($destino)) | Out-Null
        Move-Item -LiteralPath $origem -Destination $destino
        if ((Get-FileHash -LiteralPath $destino -Algorithm SHA256).Hash -ne $a.sha256.ToUpper()) {
            Write-Host "ATENÇÃO: conteúdo diferente do original: $($a.original)" -ForegroundColor Yellow
        } else {
            Write-Host "Restaurado: $($a.original)"
        }
    }
}

Write-Host ''
Write-Host 'Pronto. Reinicie o servidor (node app.js).'
`;
    fs.writeFileSync(path.join(pasta, 'restaurar.ps1'), '﻿' + ps1.replace(/\n/g, '\r\n'), 'utf8');
}

function gravarReadme(pasta, r) {
    const rel   = path.relative(RAIZ, pasta);
    const quando = new Date(r.backup.criadoEm).toLocaleString('pt-BR');
    const linhasApagadas = Object.entries(r.apagados || {})
        .filter(([, n]) => n > 0)
        .map(([nome, n]) => `| \`${nome}\` | ${n} |`);
    const ids = Object.entries(r.autoIncrementAntes)
        .map(([nome, antes]) => `| \`${nome}\` | ${antes} | ${r.autoIncrementDepois[nome] != null ? r.autoIncrementDepois[nome] : '—'} |`);

    const md = `# Checkpoint — limpeza do banco (${quando})

Estado do banco **antes** de \`node scripts/limparBanco.js --confirmar\`, que apagou contas, produtos, pedidos, carrinhos, tickets de suporte, denúncias, perguntas e avaliações. Ficaram só os administradores e as categorias.

Banco: \`${r.backup.banco}\` em \`${r.backup.host}\`
${r.concluido ? '' : '\n> ⚠️ **A limpeza não terminou.** Veja a saída do script. O backup em `banco/backup.json` está completo.\n'}
## Administradores mantidos

| id | nome | e-mail |
|---|---|---|
${r.administradores.map(a => `| ${a.id_usuario} | ${a.nome_usuario} | ${a.email_usuario} |`).join('\n')}

## O que foi apagado

| Tabela | Linhas |
|---|---|
${linhasApagadas.length ? linhasApagadas.join('\n') : '| — | 0 |'}

As linhas apagadas estão em \`banco/backup.json\`.

## Numeração (AUTO_INCREMENT)

| Tabela | Antes | Depois |
|---|---|---|
${ids.join('\n')}

Com os IDs reiniciados, **reinicie qualquer instância do app que esteja rodando** (local ou publicada). As sessões ficam na memória do servidor e poderiam apontar para um ID que será reaproveitado.

## Arquivos movidos para \`arquivos/\`

${r.movidos.length
    ? `${r.movidos.length} arquivo(s). Lista completa, com o hash de cada um, em \`arquivos.json\`:\n\n${r.movidos.map(a => `- \`${a.original.replace(/\\/g, '/')}\``).join('\n')}`
    : 'Nenhum.'}

Só os arquivos **desta cópia do projeto** foram movidos. Outras cópias que usam o mesmo banco (a dos colegas, o app publicado) continuam com os delas.

## Como desfazer

Na raiz do projeto:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File "${rel}\\restaurar.ps1"
\`\`\`

1. Reinsere as linhas de \`banco/backup.json\` numa transação (\`scripts/restaurarBanco.js\`) e devolve a numeração antiga. Se uma conta ou produto criado depois da limpeza ocupar o mesmo ID ou e-mail, **nada é gravado**, e o script mostra qual foi o conflito.
2. Só se o banco voltar, devolve os arquivos de \`arquivos/\` ao lugar original. Arquivo com o mesmo nome que já exista não é sobrescrito.

Os scripts \`scripts/limparBanco.js\`, \`scripts/restaurarBanco.js\`, \`scripts/conexoes.js\` e \`scripts/_banco.js\` **não são removidos**, porque a restauração depende deles.
`;
    fs.writeFileSync(path.join(pasta, 'README.md'), md, 'utf8');
}

// ------------------------------------------------------------

async function main() {
    const conn = await abrirConexao().catch(falhaAoConectar);
    try {
        const tabelas        = await verificarTabelas(conn);
        const administradores = await lerAdministradores(conn);
        if (!administradores.length) {
            throw new Error('Nenhum administrador encontrado. Rode "node config/criarAdmin.js" antes; nada foi apagado.');
        }

        const contagem = await contar(conn, tabelas);
        const arquivos = arquivosParaMover(administradores);
        const outras   = (await listarConexoes(conn)).filter(c => !c.minha);

        console.log(`Banco: ${process.env.DB_NAME} em ${process.env.DB_HOST}\n`);
        console.log('Ficam:');
        administradores.forEach(a => console.log(`  administrador #${a.id_usuario}  ${a.nome_usuario} <${a.email_usuario}>`));
        console.log(`  tabelas ${TABELAS_MANTER.join(', ')}\n`);
        console.log('Saem:');
        tabelas.forEach(t => console.log(`  ${t.nome.padEnd(18)} ${String(contagem[t.nome]).padStart(5)}${t.soNaoAdmin ? '  (menos administradores)' : ''}`));
        console.log(`  ${'arquivos enviados'.padEnd(18)} ${String(arquivos.length).padStart(5)}  (uploads, fotos de perfil, arquivos de produto)\n`);
        if (outras.length) {
            console.log(`⚠️  Há ${outras.length} outra(s) conexão(ões) no banco (app rodando?). Pare o app antes de limpar.\n`);
        }

        if (!confirmar) {
            console.log('Simulação: nada foi alterado. Para executar: node scripts/limparBanco.js --confirmar');
            return;
        }

        const pasta  = criarPastaCheckpoint();
        const backup = await lerBackup(conn, tabelas, administradores);
        const arquivoBackup = path.join(pasta, 'banco', 'backup.json');
        fs.writeFileSync(arquivoBackup, JSON.stringify(backup, null, 2), 'utf8');
        const relido = JSON.parse(fs.readFileSync(arquivoBackup, 'utf8'));
        for (const t of tabelas) {
            if (relido.tabelas[t.nome].linhas.length !== contagem[t.nome]) {
                throw new Error(`Backup de ${t.nome} incompleto; nada foi apagado.`);
            }
        }
        gravarRestaurarPs1(pasta);
        const resumo = {
            backup, administradores, apagados: null, movidos: [], concluido: false,
            autoIncrementAntes: Object.fromEntries(Object.entries(backup.tabelas)
                .filter(([, t]) => t.autoIncrement).map(([nome, t]) => [nome, t.autoIncrement])),
            autoIncrementDepois: {}
        };
        gravarReadme(pasta, resumo);
        console.log(`💾 Backup gravado em ${path.relative(RAIZ, pasta)}\n`);

        await conn.beginTransaction();
        try {
            resumo.apagados = await apagar(conn, tabelas);
            const problemas = await conferir(conn, tabelas);
            if (problemas.length) throw new Error(`Conferência falhou: ${problemas.join('; ')}`);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw new Error(`${err.message} — ROLLBACK feito, nada foi apagado.`);
        }
        tabelas.forEach(t => console.log(`✅ ${t.nome.padEnd(18)} ${resumo.apagados[t.nome]} apagada(s)`));

        for (const nome of Object.keys(resumo.autoIncrementAntes)) {
            try {
                await conn.query('ALTER TABLE ?? AUTO_INCREMENT = 1', [nome]);
            } catch (err) {
                console.log(`⚠️  Não foi possível reiniciar os IDs de ${nome}: ${err.message}`);
            }
        }
        resumo.autoIncrementDepois = await lerAutoIncrement(conn, tabelas.filter(t => resumo.autoIncrementAntes[t.nome]));
        console.log('\n✅ IDs reiniciados:', Object.entries(resumo.autoIncrementDepois).map(([n, v]) => `${n}=${v}`).join(', '));

        const manifesto = path.join(pasta, 'arquivos.json');
        for (const origem of arquivos) {
            const dentroDoProjeto = !path.relative(RAIZ, origem).startsWith('..');
            const original = dentroDoProjeto ? path.relative(RAIZ, origem) : origem;
            const backupRel = path.join('arquivos', dentroDoProjeto ? original : path.join('_fora_do_projeto', path.basename(origem)));
            const hash = sha256(origem);
            moverArquivo(origem, path.join(pasta, backupRel));
            if (sha256(path.join(pasta, backupRel)) !== hash) throw new Error(`Hash diferente após mover ${original}`);
            resumo.movidos.push({ original, backup: backupRel, sha256: hash });
            fs.writeFileSync(manifesto, JSON.stringify(resumo.movidos, null, 2), 'utf8');
        }
        if (!arquivos.length) fs.writeFileSync(manifesto, '[]', 'utf8');
        console.log(`✅ ${resumo.movidos.length} arquivo(s) movido(s) para o checkpoint.`);

        resumo.concluido = true;
        gravarReadme(pasta, resumo);
        console.log(`\nBanco limpo. Para desfazer: ${path.relative(RAIZ, pasta)}\\restaurar.ps1`);
        console.log('Reinicie qualquer instância do app que esteja rodando (local ou publicada).');
    } catch (err) {
        console.error('❌', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
}

if (require.main === module) main();

module.exports = { verificarTabelas, lerAdministradores, contar, lerBackup, apagar, conferir };
