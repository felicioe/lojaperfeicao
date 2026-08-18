-- =============================================================================
-- Migração 0095: convite do primeiro administrador de cada Loja
-- (issue #339, parte 2)
--
-- A parte 1 entregou o cadastro de Lojas, mas uma Loja recém-cadastrada nasce
-- vazia e sem ninguém que possa entrar nela: criar o primeiro admin exigia
-- INSERT à mão no banco. Esta migração cria a tabela do convite que fecha esse
-- buraco — o super-admin convida por e-mail, e quem recebe define a própria
-- senha e vira `admin` daquela Loja.
--
-- Por que o token não é guardado em claro: `loja_convites` é a única tabela do
-- sistema cujo conteúdo, sozinho, cria um administrador de Loja. Guardamos só
-- o SHA-256 — um dump do banco (backup, phpMyAdmin, vazamento) não permite
-- aceitar convite nenhum, porque o valor que vai no link nunca é gravado.
-- Mesma razão de senha_hash existir em vez da senha.
--
-- Sobre `loja_id` aqui: a coluna NÃO tem DEFAULT, ao contrário das que a 0092
-- criou. O DEFAULT de lá é uma ponte de transição (removida na #350) para
-- código single-tenant que ainda não informa a loja; esta tabela nasce depois
-- da ponte e toda query dela nomeia a loja explicitamente. Vale notar que, por
-- não estar na 0092, ela também não entra na lista que o
-- `npm run checar:escopo-loja` conhece — o que é correto: o convite é uma ação
-- de plataforma, feita fora do escopo de qualquer Loja, e a loja de cada linha
-- é o alvo do convite, não o escopo de quem o cria.
-- =============================================================================

SET NAMES utf8mb4;

-- COLLATE explícito em toda coluna que participa de FK, e na tabela:
-- o servidor de produção é MariaDB 11, cujo padrão de charset novo é
-- `utf8mb4_uca1400_ai_ci`, enquanto as tabelas antigas (lojas, usuarios) são
-- `utf8mb4_unicode_ci`. FK entre colunas de texto exige collation IDÊNTICA nos
-- dois lados — sem isto o CREATE falha com errno 150 no servidor de produção e
-- passa no de desenvolvimento (MariaDB 10.11, cujo padrão coincide), que é a
-- pior combinação possível. Foi exatamente assim que a 0092 quebrou em
-- `sgcab_valores_catalogo`.
CREATE TABLE IF NOT EXISTS loja_convites (
  id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (UUID()) PRIMARY KEY,

  -- Loja para a qual a pessoa está sendo convidada como administradora.
  loja_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,

  -- E-mail do convidado: destinatário da mensagem e, no aceite, o login da
  -- conta criada. Não é UNIQUE aqui de propósito — o mesmo e-mail pode ser
  -- convidado de novo depois de um convite revogado ou expirado, e a
  -- unicidade que importa (uma conta por e-mail dentro da Loja) já é garantida
  -- por uq_usuarios_loja_email, na 0092.
  email VARCHAR(255) NOT NULL,
  nome_completo VARCHAR(255) NOT NULL,

  -- SHA-256 (hex) do token que viaja no link. Ver cabeçalho.
  token_hash CHAR(64) NOT NULL,

  expira_em TIMESTAMP NOT NULL,

  -- Estado do convite. Os três são mutuamente exclusivos na prática, e o
  -- "expirado" não é coluna: é `expira_em < NOW()` com os três NULL — assim
  -- não existe estado gravado que possa divergir do relógio.
  aceito_em TIMESTAMP NULL,
  revogado_em TIMESTAMP NULL,
  -- Conta criada no aceite; mantém o rastro de qual convite deu origem a qual
  -- administrador.
  usuario_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,

  criado_por CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- UNIQUE no hash, não só índice: dois convites com o mesmo token seriam um
  -- aceite ambíguo. Também é o índice usado na busca do aceite.
  UNIQUE KEY uq_loja_convites_token (token_hash),
  KEY idx_loja_convites_loja (loja_id),
  KEY idx_loja_convites_email (email),

  CONSTRAINT fk_loja_convites_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_loja_convites_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_loja_convites_criado_por FOREIGN KEY (criado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- O convite sai pela fila da #91 como qualquer outro e-mail do sistema
-- (rastro, retry, `ultimo_erro` legível) — o ENUM precisa conhecer o tipo.
ALTER TABLE filas_email
  MODIFY COLUMN tipo ENUM(
    'fatura_emitida',
    'boas_vindas',
    'comunicado',
    'cobranca_manual',
    'relatorio_manual',
    'lembrete_vencida',
    'convite_admin'
  ) NOT NULL;
