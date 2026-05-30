-- ============================================================
--  CloudMind — Modelo Físico Corrigido (MySQL)
--  Baseado no modelo da Ana + correções para funcionar com o site
-- ============================================================
-- ============================================================
--  Tabela: usuario
--  Correção: VARCHAR(255) na senha para suportar hash bcrypt
-- ============================================================
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario       INT          PRIMARY KEY AUTO_INCREMENT,
    nome_usuario     VARCHAR(50)  NOT NULL,
    email_usuario    VARCHAR(100) UNIQUE NOT NULL,
    senha_usuario    VARCHAR(255) NOT NULL,             -- corrigido: era 100, bcrypt precisa de 255
    data_cad_usuario DATE         NOT NULL DEFAULT (CURRENT_DATE),
    status_usuario   ENUM('ativo','inativo','suspenso') DEFAULT 'ativo',
    foto_usuario     VARCHAR(255) NULL DEFAULT NULL
);
-- Para bancos já existentes, rode manualmente se necessário:
-- ALTER TABLE usuario ADD COLUMN IF NOT EXISTS foto_usuario VARCHAR(255) NULL DEFAULT NULL;

-- ============================================================
--  Tabela: administrador (ADICIONADA)
--  Necessária para o login do painel ADM (/paineladm)
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
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);
-- Para bancos já existentes, rode manualmente se necessário:
-- ALTER TABLE criador ADD COLUMN IF NOT EXISTS cpf CHAR(11) NOT NULL UNIQUE;

-- ============================================================
--  Tabela: cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS cliente (
    id_usuario        INT      PRIMARY KEY,
    CPF               CHAR(11) NOT NULL UNIQUE,
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
    descricao_categoria VARCHAR(250)
);

-- ============================================================
--  Tabela: produto
--  Correções:
--  - status_produto alinhado com o router ('ativo','inativo','suspenso')
--  - adicionado campo imagem (cards da /PProdutos)
--  - adicionado campo arquivo (página /meusdowloads)
-- ============================================================
CREATE TABLE IF NOT EXISTS produto (
    id_produto      INT           PRIMARY KEY AUTO_INCREMENT,
    id_criador      INT           NOT NULL,
    id_categoria    INT           NOT NULL,
    titulo_produto  VARCHAR(100)  NOT NULL,
    descricao_produto TEXT,
    preco_produto   DECIMAL(10,2) NOT NULL,
    tipo_produto    VARCHAR(50),
    imagem          VARCHAR(255),                       -- adicionado: imagem do card
    arquivo         VARCHAR(255),                       -- adicionado: link do arquivo para download
    data_publicacao DATETIME      DEFAULT CURRENT_TIMESTAMP,
    status_produto  ENUM('ativo','inativo','suspenso') DEFAULT 'ativo', -- corrigido: alinhado com o router
    FOREIGN KEY (id_criador)   REFERENCES criador(id_usuario),
    FOREIGN KEY (id_categoria) REFERENCES categoria(id_categoria)
);

-- ============================================================
--  Tabela: tag (ADICIONADA)
--  Para classificação e busca de produtos
-- ============================================================
CREATE TABLE IF NOT EXISTS tag (
    id_tag   INT         PRIMARY KEY AUTO_INCREMENT,
    nome_tag VARCHAR(50) NOT NULL UNIQUE
);

-- ============================================================
--  Tabela: produto_tag (ADICIONADA)
--  Relação N:N entre produto e tag
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
    PRIMARY KEY (id_pedido, id_produto),
    FOREIGN KEY (id_pedido)  REFERENCES pedido(id_pedido),
    FOREIGN KEY (id_produto) REFERENCES produto(id_produto)
);

-- ============================================================
--  Tabela: avaliacao_produto
--  Renomeada de 'avaliacao' para ser mais clara
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
--  Tabela: avaliacao_criador (ADICIONADA)
--  Avaliação de criadores — página /pgpublica
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
--  Tabela: carrinho
--  Correção: status_carrinho alinhado com o router ('aberto','finalizado')
-- ============================================================
CREATE TABLE IF NOT EXISTS carrinho (
    id_carrinho     INT      PRIMARY KEY AUTO_INCREMENT,
    id_cliente      INT      NOT NULL UNIQUE,
    data_criacao    DATETIME DEFAULT CURRENT_TIMESTAMP,
    status_carrinho ENUM('aberto','finalizado') DEFAULT 'aberto', -- corrigido: era 'ativo'
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
--  Correção: adicionado id_criador para denunciar criador também
-- ============================================================
CREATE TABLE IF NOT EXISTS denuncia (
    id_denuncia      INT  PRIMARY KEY AUTO_INCREMENT,
    id_cliente       INT  NOT NULL,
    id_produto       INT  DEFAULT NULL,                 -- corrigido: opcional (pode denunciar criador)
    id_criador       INT  DEFAULT NULL,                 -- adicionado: para denunciar criador
    motivo_denuncia  VARCHAR(255),
    descricao_denuncia TEXT,
    status_denuncia  ENUM('pendente','em_analise','resolvida') DEFAULT 'pendente',
    data_denuncia    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente)  REFERENCES cliente(id_usuario)  ON DELETE CASCADE,
    FOREIGN KEY (id_produto)  REFERENCES produto(id_produto)  ON DELETE CASCADE,
    FOREIGN KEY (id_criador)  REFERENCES criador(id_usuario)  ON DELETE CASCADE
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
INSERT IGNORE INTO categoria (nome_categoria, descricao_categoria) VALUES
('Ebook',     'Livros digitais em formato eletrônico'),
('Audiobook', 'Livros em formato de áudio'),
('Curso',     'Cursos online com aulas em vídeo'),
('Template',  'Modelos e templates prontos para uso'),
('Assets',    'Recursos digitais como imagens, ícones e fontes');

-- ============================================================
--  Dados iniciais — administrador do site
--  Senha atualizada via: node config/criarAdmin.js
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
(2, 1, 'Métodos de estudos para o ENEM',           'Guia completo com técnicas de estudo para o ENEM',               39.90, 'ebook',     'image/metodoenem.png'),
(2, 3, 'Curso de Programação',                      'Aprenda programação do zero com exercícios práticos e projetos', 89.00, 'curso',     'image/CursoProgm1.jpg'),
(2, 1, 'Ebook: Marketing Digital',                  'Estratégias de marketing digital para alavancar seu negócio',    29.90, 'ebook',     'image/formcresciEbook.png'),
(2, 2, 'Nutrição & Bem-estar',                      'Audiobook sobre alimentação saudável e qualidade de vida',       45.50, 'audiobook', 'image/NutriAudiobokk.png'),
(2, 5, 'Assets Gaming',                             'Pacote completo de assets para desenvolvimento de jogos',        59.90, 'assets',    'image/assets.jpg'),
(2, 2, 'Audiobook: Métodos de estudos para o ENEM', 'Versão em áudio do guia de estudos para o ENEM',                39.90, 'audiobook', 'image/metodoenem.png'),
(2, 3, 'Frontend Development',                      'Curso completo de desenvolvimento frontend com HTML, CSS e JS', 79.90, 'curso',     'image/frontend.png'),
(2, 3, 'JavaScript Avançado',                       'Domine JavaScript moderno e suas funcionalidades avançadas',     95.00, 'curso',     'image/js.png'),
(2, 4, 'Web Design Templates',                      'Coleção de templates profissionais para websites',               35.90, 'template',  'image/webdesiguini.png'),
(2, 3, 'Solução Web Completa',                      'Desenvolvimento completo de soluções web do início ao fim',     129.90, 'curso',     'image/solucaoweb.png');
