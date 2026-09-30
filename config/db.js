const mysql = require('mysql2/promise');

if (process.env.NODE_ENV === 'production') {
    const faltando = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
        .filter(chave => !process.env[chave]);
    if (faltando.length) {
        throw new Error(
            `Configuração do banco incompleta em produção: faltam ${faltando.join(', ')}. ` +
            `Confira as variáveis de ambiente do serviço (veja .env.example).`
        );
    }
}

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || '127.0.0.1',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'CLOUDMIND',
    waitForConnections: true,
    connectionLimit:    4,
    maxIdle:            1,
    idleTimeout:        10000,
    queueLimit:         0,
    connectTimeout:     10000
});

pool.on('error', err => {
    console.error('❌ Erro no pool de conexões:', err.message);
});

pool.getConnection()
    .then(async conn => {
        console.log('✅ Banco de dados conectado com sucesso!');
        const [cols] = await conn.query(
            `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario' AND COLUMN_NAME = 'foto_usuario'`
        );
        if (Number(cols[0].existe) === 0) {
            await conn.query(`ALTER TABLE usuario ADD COLUMN foto_usuario VARCHAR(255) NULL DEFAULT NULL`);
            console.log('✅ Coluna foto_usuario adicionada à tabela usuario.');
        }
        const [colsCpf] = await conn.query(
            `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'criador' AND COLUMN_NAME = 'cpf'`
        );
        if (Number(colsCpf[0].existe) === 0) {
            await conn.query(`ALTER TABLE criador ADD COLUMN cpf CHAR(11) NULL`);
            console.log('✅ Coluna cpf adicionada à tabela criador.');
        }

        try {
            const [colsCpfCliente] = await conn.query(
                `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cliente' AND COLUMN_NAME = 'CPF'`
            );
            if (colsCpfCliente[0] && colsCpfCliente[0].IS_NULLABLE === 'NO') {
                await conn.query(`ALTER TABLE cliente MODIFY CPF CHAR(11) NULL`);
                console.log('✅ Coluna CPF da tabela cliente agora aceita NULL.');
            }
        } catch (err) {
            console.error('❌ Erro ao ajustar cliente.CPF:', err.message);
        }

        try {
            const colunasProduto = [
                ['resumo_produto', 'VARCHAR(150) NULL DEFAULT NULL AFTER titulo_produto'],
                ['sku_produto',    'VARCHAR(20)  NULL DEFAULT NULL AFTER resumo_produto']
            ];
            for (const [coluna, definicao] of colunasProduto) {
                const [colsProduto] = await conn.query(
                    `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'produto' AND COLUMN_NAME = ?`,
                    [coluna]
                );
                if (Number(colsProduto[0].existe) === 0) {
                    await conn.query(`ALTER TABLE produto ADD COLUMN ${coluna} ${definicao}`);
                    console.log(`✅ Coluna ${coluna} adicionada à tabela produto.`);
                }
            }

            await conn.query(
                `CREATE TABLE IF NOT EXISTS pergunta_produto (
                    id_pergunta   INT           PRIMARY KEY AUTO_INCREMENT,
                    id_produto    INT           NOT NULL,
                    id_usuario    INT           NOT NULL,
                    pergunta      VARCHAR(500)  NOT NULL,
                    resposta      VARCHAR(1000) NULL,
                    data_pergunta DATETIME      DEFAULT CURRENT_TIMESTAMP,
                    data_resposta DATETIME      NULL,
                    INDEX idx_pergunta_produto (id_produto, data_pergunta),
                    FOREIGN KEY (id_produto) REFERENCES produto(id_produto) ON DELETE CASCADE,
                    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
                )`
            );
        } catch (err) {
            console.error('❌ Erro ao aplicar migrações de produto/perguntas:', err.message);
        }

        try {
            await conn.query(
                `CREATE TABLE IF NOT EXISTS produto_imagem (
                    id_imagem  INT          PRIMARY KEY AUTO_INCREMENT,
                    id_produto INT          NOT NULL,
                    caminho    VARCHAR(255) NOT NULL,
                    ordem      INT          NOT NULL DEFAULT 1,
                    data_envio DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_produto_imagem (id_produto, ordem),
                    FOREIGN KEY (id_produto) REFERENCES produto(id_produto) ON DELETE CASCADE
                )`
            );
        } catch (err) {
            console.error('❌ Erro ao criar a tabela produto_imagem:', err.message);
        }

        try {
            const [[colStatus]] = await conn.query(
                `SELECT COLUMN_TYPE AS tipo FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'produto' AND COLUMN_NAME = 'status_produto'`
            );
            if (colStatus && !String(colStatus.tipo).includes("'excluido'")) {
                await conn.query(
                    `ALTER TABLE produto MODIFY COLUMN status_produto
                     ENUM('ativo','inativo','suspenso','excluido') DEFAULT 'ativo'`
                );
                console.log("✅ Status 'excluido' adicionado a produto.status_produto.");
            }
        } catch (err) {
            console.error("❌ Erro ao adicionar o status 'excluido' em produto:", err.message);
        }

        try {
            const [[colSlug]] = await conn.query(
                `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categoria' AND COLUMN_NAME = 'slug_categoria'`
            );
            if (Number(colSlug.existe) === 0) {
                await conn.query(`ALTER TABLE categoria ADD COLUMN slug_categoria VARCHAR(40) NULL DEFAULT NULL UNIQUE`);
                console.log('✅ Coluna slug_categoria adicionada à tabela categoria.');
            }
            // Insere só as categorias que faltam (idempotente pelo slug único)
            const { CATEGORIAS } = require('../app/helpers/tiposProduto');
            const [resultado] = await conn.query(
                `INSERT IGNORE INTO categoria (nome_categoria, slug_categoria) VALUES ?`,
                [Object.entries(CATEGORIAS).map(([slug, nome]) => [nome, slug])]
            );
            if (resultado.affectedRows) console.log(`✅ ${resultado.affectedRows} categorias por assunto adicionadas.`);

            const [[colDetalhes]] = await conn.query(
                `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'produto' AND COLUMN_NAME = 'detalhes_produto'`
            );
            if (Number(colDetalhes.existe) === 0) {
                await conn.query(`ALTER TABLE produto ADD COLUMN detalhes_produto TEXT NULL DEFAULT NULL`);
                console.log('✅ Coluna detalhes_produto adicionada à tabela produto.');
            }
        } catch (err) {
            console.error('❌ Erro ao aplicar categorias por assunto / detalhes do produto:', err.message);
        }

        try {
            await conn.query(
                `CREATE TABLE IF NOT EXISTS cupom (
                    id_cupom         INT           PRIMARY KEY AUTO_INCREMENT,
                    codigo           VARCHAR(30)   NOT NULL UNIQUE,
                    id_criador       INT           NOT NULL,
                    tipo_desconto    ENUM('percentual','fixo') NOT NULL,
                    valor_desconto   DECIMAL(10,2) NOT NULL,
                    data_inicio      DATE          NOT NULL,
                    data_fim         DATE          NOT NULL,
                    limite_usos      INT           NULL,
                    ativo            TINYINT(1)    NOT NULL DEFAULT 1,
                    criado_por       INT           NULL,
                    data_criacao     DATETIME      DEFAULT CURRENT_TIMESTAMP,
                    data_atualizacao DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_cupom_criador (id_criador),
                    FOREIGN KEY (id_criador) REFERENCES criador(id_usuario) ON DELETE CASCADE,
                    FOREIGN KEY (criado_por) REFERENCES usuario(id_usuario) ON DELETE SET NULL
                )`
            );
            await conn.query(
                `CREATE TABLE IF NOT EXISTS cupom_uso (
                    id_uso         INT           PRIMARY KEY AUTO_INCREMENT,
                    id_cupom       INT           NOT NULL,
                    id_cliente     INT           NOT NULL,
                    id_pedido      INT           NOT NULL,
                    valor_desconto DECIMAL(10,2) NOT NULL,
                    data_uso       DATETIME      DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_cupom_cliente (id_cupom, id_cliente),
                    FOREIGN KEY (id_cupom)   REFERENCES cupom(id_cupom)     ON DELETE CASCADE,
                    FOREIGN KEY (id_cliente) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
                    FOREIGN KEY (id_pedido)  REFERENCES pedido(id_pedido)   ON DELETE CASCADE
                )`
            );
            const colunasCupom = [
                ['carrinho', 'id_cupom', 'INT NULL DEFAULT NULL'],
                ['item_pedido', 'desconto', 'DECIMAL(10,2) NOT NULL DEFAULT 0']
            ];
            for (const [tabela, coluna, definicao] of colunasCupom) {
                const [[col]] = await conn.query(
                    `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                    [tabela, coluna]
                );
                if (Number(col.existe) === 0) {
                    await conn.query(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
                    console.log(`✅ Coluna ${coluna} adicionada à tabela ${tabela}.`);
                }
            }
        } catch (err) {
            console.error('❌ Erro ao criar as tabelas de cupons:', err.message);
        }

        try {
            const [[colCapa]] = await conn.query(
                `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'criador' AND COLUMN_NAME = 'capa_criador'`
            );
            if (Number(colCapa.existe) === 0) {
                await conn.query(`ALTER TABLE criador ADD COLUMN capa_criador VARCHAR(255) NULL DEFAULT NULL`);
                console.log('✅ Coluna capa_criador adicionada à tabela criador.');
            }
        } catch (err) {
            console.error('❌ Erro ao adicionar a capa da loja (criador.capa_criador):', err.message);
        }

        // Pagamentos (Mercado Pago Checkout Pro): tentativas, notificações e data do pagamento.
        try {
            const [[colDataPagamento]] = await conn.query(
                `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido' AND COLUMN_NAME = 'data_pagamento'`
            );
            if (Number(colDataPagamento.existe) === 0) {
                await conn.query(`ALTER TABLE pedido ADD COLUMN data_pagamento DATETIME NULL DEFAULT NULL`);
                // Pedidos pagos antes desta coluna: a compra e o pagamento eram simultâneos.
                await conn.query(`UPDATE pedido SET data_pagamento = data_pedido WHERE status_pedido = 'pago' AND data_pagamento IS NULL`);
                console.log('✅ Coluna data_pagamento adicionada à tabela pedido.');
            }
            const [[idxPedido]] = await conn.query(
                `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido' AND INDEX_NAME = 'idx_pedido_cliente_status'`
            );
            if (Number(idxPedido.existe) === 0) {
                await conn.query(`ALTER TABLE pedido ADD INDEX idx_pedido_cliente_status (id_cliente, status_pedido)`);
                console.log('✅ Índice idx_pedido_cliente_status criado na tabela pedido.');
            }
            await conn.query(
                `CREATE TABLE IF NOT EXISTS pagamento (
                    id_pagamento        INT          PRIMARY KEY AUTO_INCREMENT,
                    id_pedido           INT          NOT NULL,
                    tentativa           INT          NOT NULL DEFAULT 1,
                    chave_idempotencia  CHAR(36)     NOT NULL,
                    mp_order_id         VARCHAR(64)  NULL,
                    mp_payment_id       VARCHAR(64)  NULL,
                    external_reference  VARCHAR(64)  NOT NULL,
                    valor_centavos      INT          NOT NULL,
                    valor_pago_centavos INT          NULL,
                    moeda               CHAR(3)      NOT NULL DEFAULT 'BRL',
                    status_mp           VARCHAR(40)  NULL,
                    status_detail_mp    VARCHAR(60)  NULL,
                    metodo_pagamento    VARCHAR(60)  NULL,
                    checkout_url        VARCHAR(500) NULL,
                    expira_em           DATETIME     NULL,
                    live_mode           TINYINT(1)   NULL,
                    ultimo_erro         VARCHAR(255) NULL,
                    criado_em           DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    atualizado_em       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_pagamento_tentativa (id_pedido, tentativa),
                    UNIQUE KEY uq_pagamento_chave (chave_idempotencia),
                    UNIQUE KEY uq_pagamento_order (mp_order_id),
                    INDEX idx_pagamento_status (status_mp, criado_em),
                    FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido) ON DELETE CASCADE
                )`
            );
            await conn.query(
                `CREATE TABLE IF NOT EXISTS pagamento_evento (
                    id_evento      INT          PRIMARY KEY AUTO_INCREMENT,
                    x_request_id   VARCHAR(100) NULL,
                    tipo           VARCHAR(40)  NULL,
                    acao           VARCHAR(60)  NULL,
                    mp_resource_id VARCHAR(64)  NULL,
                    live_mode      TINYINT(1)   NULL,
                    recebido_em    DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    resultado      VARCHAR(30)  NOT NULL DEFAULT 'recebido',
                    detalhe        VARCHAR(255) NULL,
                    INDEX idx_evento_request (x_request_id),
                    INDEX idx_evento_recurso (mp_resource_id, recebido_em)
                )`
            );
        } catch (err) {
            console.error('❌ Erro ao aplicar as migrações de pagamento (pedido.data_pagamento, pagamento, pagamento_evento):', err.message);
        }
        conn.release();
    })
    .catch(err => {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error(
                '   → Verifique DB_HOST, DB_USER, DB_PASSWORD e DB_NAME nas variáveis de ' +
                'ambiente deste serviço. Se o usuário aparecer como "root" no erro acima, ' +
                'é sinal de que DB_USER não está definido (o código cai no valor padrão).'
            );
        }
    });

module.exports = pool;
