-- ============================================================
--  Tabela: usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario       INT          PRIMARY KEY AUTO_INCREMENT,
    nome_usuario     VARCHAR(50)  NOT NULL,
    email_usuario    VARCHAR(100) UNIQUE NOT NULL,
    senha_usuario    VARCHAR(255) NOT NULL,
    data_cad_usuario DATE         NOT NULL DEFAULT (CURRENT_DATE),
    status_usuario   ENUM('ativo','inativo','suspenso') DEFAULT 'ativo',
    foto_usuario     VARCHAR(255) NULL DEFAULT NULL
);

-- ============================================================
--  Tabela: administrador
-- ============================================================
CREATE TABLE IF NOT EXISTS administrador (
    id_usuario INT         PRIMARY KEY,
    cargo      VARCHAR(50) NOT NULL DEFAULT 'administrador',
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

-- ============================================================
--  Tabela: criador
-- ============================================================
CREATE TABLE IF NOT EXISTS criador (
    id_usuario       INT           PRIMARY KEY,
    cpf              CHAR(11)      NULL UNIQUE,
    bio_criador      VARCHAR(1000),
    data_ultimo_ped  DATETIME,
    media_avaliacoes DECIMAL(3,2)  DEFAULT 0.0,
    qtd_avaliacoes   INT           DEFAULT 0,
    capa_criador     VARCHAR(255)  NULL DEFAULT NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

-- ============================================================
--  Tabela: cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS cliente (
    id_usuario        INT      PRIMARY KEY,
    CPF               CHAR(11) NULL UNIQUE,
    avaliacoes_feitas INT      DEFAULT 0,
    data_ultimo_ped   DATETIME,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

-- ============================================================
--  Tabela: categoria
-- ============================================================
CREATE TABLE IF NOT EXISTS categoria (
    id_categoria      INT          PRIMARY KEY AUTO_INCREMENT,
    nome_categoria    VARCHAR(100) NOT NULL,
    descricao_categoria VARCHAR(250),
    slug_categoria    VARCHAR(40)  NULL UNIQUE
);

-- ============================================================
--  Tabela: produto
-- ============================================================
CREATE TABLE IF NOT EXISTS produto (
    id_produto      INT           PRIMARY KEY AUTO_INCREMENT,
    id_criador      INT           NOT NULL,
    id_categoria    INT           NOT NULL,
    titulo_produto  VARCHAR(100)  NOT NULL,
    resumo_produto  VARCHAR(150)  NULL,
    sku_produto     VARCHAR(20)   NULL,
    descricao_produto TEXT,
    preco_produto   DECIMAL(10,2) NOT NULL,
    tipo_produto    VARCHAR(50),
    imagem          VARCHAR(255),
    arquivo         VARCHAR(255),
    data_publicacao DATETIME      DEFAULT CURRENT_TIMESTAMP,
    status_produto  ENUM('ativo','inativo','suspenso','excluido') DEFAULT 'ativo',
    detalhes_produto TEXT         NULL,
    FOREIGN KEY (id_criador)   REFERENCES criador(id_usuario),
    FOREIGN KEY (id_categoria) REFERENCES categoria(id_categoria)
);

-- ============================================================
--  Tabela: produto_imagem
-- ============================================================
CREATE TABLE IF NOT EXISTS produto_imagem (
    id_imagem  INT          PRIMARY KEY AUTO_INCREMENT,
    id_produto INT          NOT NULL,
    caminho    VARCHAR(255) NOT NULL,
    ordem      INT          NOT NULL DEFAULT 1,
    data_envio DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_produto_imagem (id_produto, ordem),
    FOREIGN KEY (id_produto) REFERENCES produto(id_produto) ON DELETE CASCADE
);

-- ============================================================
--  Tabela: tag
-- ============================================================
CREATE TABLE IF NOT EXISTS tag (
    id_tag   INT         PRIMARY KEY AUTO_INCREMENT,
    nome_tag VARCHAR(50) NOT NULL UNIQUE
);

-- ============================================================
--  Tabela: produto_tag
-- ============================================================
CREATE TABLE IF NOT EXISTS produto_tag (
    id_produto INT NOT NULL,
    id_tag     INT NOT NULL,
    PRIMARY KEY (id_produto, id_tag),
    FOREIGN KEY (id_produto) REFERENCES produto(id_produto) ON DELETE CASCADE,
    FOREIGN KEY (id_tag)     REFERENCES tag(id_tag)         ON DELETE CASCADE
);

-- ============================================================
--  Tabela: pedido
-- ============================================================
CREATE TABLE IF NOT EXISTS pedido (
    id_pedido     INT           PRIMARY KEY AUTO_INCREMENT,
    id_cliente    INT           NOT NULL,
    data_pedido   DATETIME      DEFAULT CURRENT_TIMESTAMP,
    status_pedido ENUM('pendente','pago','cancelado','reembolsado') DEFAULT 'pendente',
    comissao      DECIMAL(10,2) DEFAULT 0.0,
    data_pagamento DATETIME     NULL DEFAULT NULL,
    INDEX idx_pedido_cliente_status (id_cliente, status_pedido),
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_usuario)
);

-- ============================================================
--  Tabela: item_pedido
-- ============================================================
CREATE TABLE IF NOT EXISTS item_pedido (
    id_pedido      INT           NOT NULL,
    id_produto     INT           NOT NULL,
    quantidade     INT           DEFAULT 1,
    preco_unitario DECIMAL(10,2) NOT NULL,
    desconto       DECIMAL(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_pedido, id_produto),
    FOREIGN KEY (id_pedido)  REFERENCES pedido(id_pedido),
    FOREIGN KEY (id_produto) REFERENCES produto(id_produto)
);

-- ============================================================
--  Tabela: avaliacao_produto
-- ============================================================
CREATE TABLE IF NOT EXISTS avaliacao_produto (
    id_avaliacao   INT  PRIMARY KEY AUTO_INCREMENT,
    id_cliente     INT  NOT NULL,
    id_produto     INT  NOT NULL,
    nota           INT  CHECK (nota >= 1 AND nota <= 5),
    comentario     TEXT,
    data_avaliacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_usuario),
    FOREIGN KEY (id_produto) REFERENCES produto(id_produto)
);

-- ============================================================
--  Tabela: avaliacao_criador
-- ============================================================
CREATE TABLE IF NOT EXISTS avaliacao_criador (
    id_avaliacao   INT  PRIMARY KEY AUTO_INCREMENT,
    id_cliente     INT  NOT NULL,
    id_criador     INT  NOT NULL,
    nota           INT  CHECK (nota >= 1 AND nota <= 5),
    comentario     TEXT,
    data_avaliacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente)  REFERENCES cliente(id_usuario),
    FOREIGN KEY (id_criador)  REFERENCES criador(id_usuario)
);

-- ============================================================
--  Tabela: pergunta_produto
-- ============================================================
CREATE TABLE IF NOT EXISTS pergunta_produto (
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
);

-- ============================================================
--  Tabela: carrinho
-- ============================================================
CREATE TABLE IF NOT EXISTS carrinho (
    id_carrinho     INT      PRIMARY KEY AUTO_INCREMENT,
    id_cliente      INT      NOT NULL UNIQUE,
    data_criacao    DATETIME DEFAULT CURRENT_TIMESTAMP,
    status_carrinho ENUM('aberto','finalizado') DEFAULT 'aberto',
    id_cupom        INT      NULL DEFAULT NULL,
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_usuario) ON DELETE CASCADE
);

-- ============================================================
--  Tabela: item_carrinho
-- ============================================================
CREATE TABLE IF NOT EXISTS item_carrinho (
    id_carrinho    INT           NOT NULL,
    id_produto     INT           NOT NULL,
    quantidade     INT           DEFAULT 1,
    preco_unitario DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id_carrinho, id_produto),
    FOREIGN KEY (id_carrinho) REFERENCES carrinho(id_carrinho),
    FOREIGN KEY (id_produto)  REFERENCES produto(id_produto)
);

-- ============================================================
--  Tabela: favorito
-- ============================================================
CREATE TABLE IF NOT EXISTS favorito (
    id_cliente     INT      NOT NULL,
    id_produto     INT      NOT NULL,
    data_favorito  DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_cliente, id_produto),
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_usuario),
    FOREIGN KEY (id_produto) REFERENCES produto(id_produto)
);

-- ============================================================
--  Tabela: suporte
-- ============================================================
CREATE TABLE IF NOT EXISTS suporte (
    id_chamada       INT  PRIMARY KEY AUTO_INCREMENT,
    id_usuario       INT  NOT NULL,
    tipo_chamada     VARCHAR(50)  NOT NULL,
    descricao_chamada TEXT        NOT NULL,
    data_chamada     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    data_fechamento  DATETIME,
    status_chamada   ENUM('aberto','em_andamento','fechado') DEFAULT 'aberto',
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

-- ============================================================
--  Tabela: denuncia
-- ============================================================
CREATE TABLE IF NOT EXISTS denuncia (
    id_denuncia      INT  PRIMARY KEY AUTO_INCREMENT,
    id_cliente       INT  NOT NULL,
    id_produto       INT  DEFAULT NULL,
    id_criador       INT  DEFAULT NULL,
    motivo_denuncia  VARCHAR(255),
    descricao_denuncia TEXT,
    status_denuncia  ENUM('pendente','em_analise','resolvida') DEFAULT 'pendente',
    data_denuncia    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente)  REFERENCES cliente(id_usuario)  ON DELETE CASCADE,
    FOREIGN KEY (id_produto)  REFERENCES produto(id_produto)  ON DELETE CASCADE,
    FOREIGN KEY (id_criador)  REFERENCES criador(id_usuario)  ON DELETE CASCADE
);

-- ============================================================
--  Tabela: cupom
-- ============================================================
CREATE TABLE IF NOT EXISTS cupom (
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
);

-- ============================================================
--  Tabela: cupom_uso
-- ============================================================
CREATE TABLE IF NOT EXISTS cupom_uso (
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
);

-- ============================================================
--  Tabela: pagamento (uma linha por tentativa/order no Mercado Pago)
-- ============================================================
CREATE TABLE IF NOT EXISTS pagamento (
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
);

-- ============================================================
--  Tabela: pagamento_evento (notificações recebidas e alertas; sem dados pessoais)
-- ============================================================
CREATE TABLE IF NOT EXISTS pagamento_evento (
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
);

-- ============================================================
--  Tabela: reembolso
-- ============================================================
CREATE TABLE IF NOT EXISTS reembolso (
    id_reembolso     INT           PRIMARY KEY AUTO_INCREMENT,
    id_pedido        INT           NOT NULL,
    valor_reembolso  DECIMAL(10,2) NOT NULL,
    motivo_reembolso TEXT,
    status_reembolso ENUM('solicitado','aprovado','recusado') DEFAULT 'solicitado',
    data_solicitacao DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido) ON DELETE CASCADE
);

-- ============================================================
--  Dados iniciais — categorias
-- ============================================================
INSERT IGNORE INTO categoria (nome_categoria, slug_categoria) VALUES
('Programação', 'programacao'),
('Tecnologia', 'tecnologia'),
('Marketing', 'marketing'),
('Negócios', 'negocios'),
('Finanças', 'financas'),
('Desenvolvimento pessoal', 'desenvolvimento_pessoal'),
('Educação', 'educacao'),
('Design', 'design'),
('Saúde e bem-estar', 'saude'),
('Literatura', 'literatura'),
('Psicologia', 'psicologia'),
('Ficção', 'ficcao'),
('Não ficção', 'nao_ficcao'),
('Biografias', 'biografias'),
('Apresentações', 'apresentacoes'),
('Planilhas', 'planilhas'),
('Documentos e currículos', 'documentos'),
('Redes sociais', 'redes_sociais'),
('Sites e landing pages', 'sites'),
('Produtividade e organização', 'produtividade'),
('Identidade visual', 'identidade_visual'),
('Idiomas', 'idiomas'),
('Fotografia e vídeo', 'fotografia'),
('Ícones', 'icones'),
('Ilustrações', 'ilustracoes'),
('Imagens', 'imagens'),
('Vídeos', 'videos'),
('Áudios e efeitos sonoros', 'audios'),
('Fontes', 'fontes'),
('3D', 'modelos_3d'),
('UI kits e mockups', 'ui_kits'),
('Games', 'games'),
('Outros', 'outros');

-- ============================================================
--  Dados iniciais — administrador do site
-- ============================================================
INSERT IGNORE INTO usuario (nome_usuario, email_usuario, senha_usuario)
VALUES ('CloudMind Admin', 'admin@cloudmind.com', 'rodar_criarAdmin.js');

INSERT IGNORE INTO administrador (id_usuario, cargo)
VALUES (1, 'administrador');

-- ============================================================
--  Dados iniciais — criador padrão dos produtos de exemplo
-- ============================================================
INSERT IGNORE INTO usuario (nome_usuario, email_usuario, senha_usuario)
VALUES ('CloudMind Conteúdo', 'conteudo@cloudmind.com', 'rodar_criarAdmin.js');

INSERT IGNORE INTO criador (id_usuario, bio_criador)
VALUES (2, 'Perfil oficial de conteúdo do CloudMind');

-- ============================================================
--  Dados iniciais — produtos do catálogo
-- ============================================================
INSERT IGNORE INTO produto (id_criador, id_categoria, titulo_produto, descricao_produto, preco_produto, tipo_produto, imagem) VALUES
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'educacao'), 'Métodos de estudos para o ENEM',           'Guia completo com técnicas de estudo para o ENEM',               39.90, 'ebook',     'image/metodoenem.png'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'programacao'), 'Curso de Programação',                      'Aprenda programação do zero com exercícios práticos e projetos', 89.00, 'curso',     'image/CursoProgm1.jpg'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'marketing'), 'Ebook: Marketing Digital',                  'Estratégias de marketing digital para alavancar seu negócio',    29.90, 'ebook',     'image/formcresciEbook.png'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'saude'), 'Nutrição & Bem-estar',                      'Audiobook sobre alimentação saudável e qualidade de vida',       45.50, 'audiobook', 'image/NutriAudiobokk.png'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'games'), 'Assets Gaming',                             'Pacote completo de assets para desenvolvimento de jogos',        59.90, 'assets',    'image/assets.jpg'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'educacao'), 'Audiobook: Métodos de estudos para o ENEM', 'Versão em áudio do guia de estudos para o ENEM',                39.90, 'audiobook', 'image/metodoenem.png'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'programacao'), 'Frontend Development',                      'Curso completo de desenvolvimento frontend com HTML, CSS e JS', 79.90, 'curso',     'image/frontend.png'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'programacao'), 'JavaScript Avançado',                       'Domine JavaScript moderno e suas funcionalidades avançadas',     95.00, 'curso',     'image/js.png'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'sites'), 'Web Design Templates',                      'Coleção de templates profissionais para websites',               35.90, 'template',  'image/webdesiguini.png'),
(2, (SELECT id_categoria FROM categoria WHERE slug_categoria = 'programacao'), 'Solução Web Completa',                      'Desenvolvimento completo de soluções web do início ao fim',     129.90, 'curso',     'image/solucaoweb.png');
