-- =========================================
-- Schema MySQL — cadastros estruturais e maçônicos (issue #50, Fase 8).
-- Tradução final das tabelas hoje em Postgres (issues #3, #4, #5, #6, e a
-- base de sessões/presenças) para MySQL/MariaDB. Ver mysql/README.md para
-- as decisões gerais.
--
-- Nota sobre GRANTs: diferente do Postgres/Supabase (onde cada tabela tinha
-- GRANT SELECT para o papel "authenticated" e RLS controlava o resto),
-- hospedagem compartilhada MySQL (Hostinger inclusive) só dá um usuário de
-- banco com privilégio total sobre o próprio banco — não há papéis
-- diferenciados por GRANT no nível do banco. Por isso esta migração não
-- declara GRANT nenhum: toda checagem de "quem pode ler/escrever o quê"
-- vira responsabilidade da camada de API (issue #53), nunca mais do SGBD.
-- Cada tabela abaixo documenta em comentário qual era a policy de RLS
-- original, para servir de referência exata a essa camada.
--
-- Nem toda tabela precisa de stored procedure para escrever: no Postgres
-- original, tabelas com uma policy "FOR ALL ... has_role(...)" aceitavam
-- INSERT/UPDATE/DELETE direto do client (gated só pelo papel do usuário) —
-- essas continuam podendo ter CRUD comum na rota server-side, replicando o
-- mesmo `has_role`. Só viram procedure dedicada os casos com regra de
-- negócio real além de CRUD (ex.: `ativar_gestao`, que precisa desativar a
-- gestão anterior; `gerar_graus_padrao_org`, que gera várias linhas de uma
-- vez) — essas sim têm procedure própria abaixo.
-- =========================================

-- =========================================
-- IRMÃOS
-- RLS original: SELECT para admin/secretario/tesoureiro (tudo) ou o próprio
-- usuário (se user_id = auth.uid()); INSERT/UPDATE só admin/secretario;
-- DELETE só admin.
-- =========================================
CREATE TABLE IF NOT EXISTS irmaos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36),
  nome_civil VARCHAR(255) NOT NULL,
  nome_simbolico VARCHAR(255),
  cim VARCHAR(50),
  grau ENUM('aprendiz', 'companheiro', 'mestre') NOT NULL DEFAULT 'aprendiz',
  data_iniciacao DATE,
  data_elevacao DATE,
  data_exaltacao DATE,
  situacao ENUM('ativo', 'quite', 'irregular', 'adormecido') NOT NULL DEFAULT 'ativo',
  potencia VARCHAR(255),
  loja_origem VARCHAR(255),
  email VARCHAR(255),
  telefone VARCHAR(50),
  endereco TEXT,
  data_nascimento DATE,
  profissao VARCHAR(255),
  valor_mensalidade DECIMAL(12,2) NOT NULL DEFAULT 0,
  numero_matricula VARCHAR(50),
  estado_civil VARCHAR(50),
  cpf VARCHAR(20),
  rg VARCHAR(20),
  naturalidade VARCHAR(255),
  nacionalidade VARCHAR(255) DEFAULT 'Brasileira',
  religiao VARCHAR(100),
  foto_url TEXT,
  observacoes TEXT,
  numero_grande_oriente VARCHAR(50),
  fundador BOOLEAN NOT NULL DEFAULT FALSE,
  benemerito BOOLEAN NOT NULL DEFAULT FALSE,
  honorario BOOLEAN NOT NULL DEFAULT FALSE,
  licenciado BOOLEAN NOT NULL DEFAULT FALSE,
  empresa VARCHAR(255),
  cargo_profissional VARCHAR(255),
  area_atuacao VARCHAR(255),
  cep VARCHAR(20),
  logradouro VARCHAR(255),
  numero_endereco VARCHAR(20),
  complemento VARCHAR(255),
  bairro VARCHAR(255),
  cidade VARCHAR(255),
  estado VARCHAR(2),
  celular VARCHAR(50),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_irmaos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_irmaos_usuario ON irmaos (usuario_id);

-- =========================================
-- SESSÕES E PRESENÇAS
-- RLS original: SELECT livre para todos autenticados; escrita só
-- admin/secretario.
-- =========================================
CREATE TABLE IF NOT EXISTS sessoes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  data DATE NOT NULL,
  tipo ENUM('ordinaria', 'magna', 'branca', 'administrativa') NOT NULL DEFAULT 'ordinaria',
  grau ENUM('aprendiz', 'companheiro', 'mestre') NOT NULL DEFAULT 'aprendiz',
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS presencas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  sessao_id CHAR(36) NOT NULL,
  irmao_id CHAR(36) NOT NULL,
  presente BOOLEAN NOT NULL DEFAULT FALSE,
  justificado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY presencas_sessao_irmao_uniq (sessao_id, irmao_id),
  CONSTRAINT fk_presencas_sessao FOREIGN KEY (sessao_id) REFERENCES sessoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_presencas_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================================
-- POTÊNCIAS E CORPOS MAÇÔNICOS (ORGS)
-- RLS original: SELECT livre; escrita admin/secretario.
-- =========================================
CREATE TABLE IF NOT EXISTS potencias (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  sigla VARCHAR(50),
  jurisdicao VARCHAR(255),
  site VARCHAR(255),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orgs (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  potencia_id CHAR(36),
  nome VARCHAR(255) NOT NULL,
  sigla VARCHAR(50),
  natureza ENUM('loja', 'capitulo', 'conselho', 'areopago', 'consistorio', 'outro') NOT NULL DEFAULT 'loja',
  numero VARCHAR(50),
  rito VARCHAR(255),
  grau_min INT NOT NULL DEFAULT 1,
  grau_max INT NOT NULL DEFAULT 3,
  mensalidade_padrao DECIMAL(12,2) NOT NULL DEFAULT 0,
  cnpj VARCHAR(20),
  fundacao DATE,
  endereco TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orgs_potencia FOREIGN KEY (potencia_id) REFERENCES potencias(id) ON DELETE SET NULL,
  CONSTRAINT chk_orgs_graus CHECK (grau_max >= grau_min)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orgs_graus (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  grau INT NOT NULL,
  nome VARCHAR(255) NOT NULL,
  UNIQUE KEY orgs_graus_org_grau_uniq (org_id, grau),
  CONSTRAINT fk_orgs_graus_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CONSTRAINT chk_orgs_graus_grau CHECK (grau > 0)
) ENGINE=InnoDB;

-- RLS original: SELECT para admin/secretario/tesoureiro (tudo) ou o próprio
-- irmão vinculado; escrita admin/secretario.
CREATE TABLE IF NOT EXISTS irmao_orgs (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  org_id CHAR(36) NOT NULL,
  principal BOOLEAN NOT NULL DEFAULT FALSE,
  grau_atual INT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY irmao_orgs_irmao_org_uniq (irmao_id, org_id),
  CONSTRAINT fk_irmao_orgs_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE,
  CONSTRAINT fk_irmao_orgs_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_irmao_orgs_irmao ON irmao_orgs (irmao_id);
CREATE INDEX idx_irmao_orgs_org ON irmao_orgs (org_id);

-- =========================================
-- RPC: gerar_graus_padrao_org — equivalente exato da procedure Postgres.
-- =========================================
DROP PROCEDURE IF EXISTS gerar_graus_padrao_org;
DELIMITER $$
CREATE PROCEDURE gerar_graus_padrao_org(IN p_org_id CHAR(36), OUT p_total INT)
BEGIN
  DECLARE v_min INT;
  DECLARE v_max INT;
  DECLARE v_g INT;
  DECLARE v_nome VARCHAR(255);

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT grau_min, grau_max INTO v_min, v_max FROM orgs WHERE id = p_org_id;
  IF v_min IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Corpo não encontrado';
  END IF;

  SET v_g = v_min;
  WHILE v_g <= v_max DO
    SET v_nome = CASE v_g WHEN 1 THEN 'Aprendiz' WHEN 2 THEN 'Companheiro' WHEN 3 THEN 'Mestre' ELSE CONCAT('Grau ', v_g) END;
    INSERT IGNORE INTO orgs_graus (org_id, grau, nome) VALUES (p_org_id, v_g, v_nome);
    SET v_g = v_g + 1;
  END WHILE;

  SELECT COUNT(*) INTO p_total FROM orgs_graus WHERE org_id = p_org_id;
END$$
DELIMITER ;

-- =========================================
-- GESTÕES E CARGOS
-- RLS original: SELECT livre; escrita admin/secretario.
-- =========================================
CREATE TABLE IF NOT EXISTS cargos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36),
  nome VARCHAR(255) NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cargos_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_cargos_org ON cargos (org_id);

-- "Só uma gestão ativa por corpo" — no Postgres isso era um índice único
-- parcial (`WHERE ativo`) + trigger que desativava as demais. Em MySQL/
-- MariaDB isso precisou de DOIS ajustes em relação ao Postgres, ambos
-- testados localmente:
--   1. Um trigger não pode fazer UPDATE na própria tabela que o disparou
--      (erro 1442 "Can't update table ... because it is already used by
--      statement which invoked this trigger/function") — por isso a troca
--      de gestão ativa deixa de ser efeito colateral automático de UPDATE e
--      vira a procedure `ativar_gestao` abaixo, que faz as duas escritas
--      explicitamente.
--   2. Uma coluna GERADA (`GENERATED ALWAYS AS`) com `CASE`/`IF` não pode
--      ser usada como base de um índice no MariaDB local testado (erro 1901
--      "Function or expression ... cannot be used in the GENERATED ALWAYS
--      AS clause", mesmo em modo VIRTUAL) — diferente do Postgres, onde um
--      índice único parcial com WHERE é trivial. Por isso `org_id_se_ativo`
--      abaixo é uma coluna comum (não gerada), mantida explicitamente pela
--      própria procedure a cada troca de status — nunca calculada
--      automaticamente pelo banco.
CREATE TABLE IF NOT EXISTS gestoes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  org_id_se_ativo CHAR(36) DEFAULT NULL,
  CONSTRAINT fk_gestoes_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CONSTRAINT chk_gestoes_datas CHECK (data_fim >= data_inicio),
  UNIQUE KEY gestoes_uma_ativa_por_org (org_id_se_ativo)
) ENGINE=InnoDB;

-- Mantém org_id_se_ativo coerente também para INSERTs feitos fora da
-- procedure (ex.: criação da primeira gestão de um corpo, direto pela rota
-- server-side) — só ajusta a própria linha sendo inserida (NEW.*), não
-- dispara a restrição de "UPDATE na própria tabela do trigger".
DROP TRIGGER IF EXISTS trg_gestoes_marker_insert;
DELIMITER $$
CREATE TRIGGER trg_gestoes_marker_insert BEFORE INSERT ON gestoes
FOR EACH ROW
BEGIN
  IF NEW.ativo THEN
    SET NEW.org_id_se_ativo = NEW.org_id;
  ELSE
    SET NEW.org_id_se_ativo = NULL;
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS ativar_gestao;
DELIMITER $$
CREATE PROCEDURE ativar_gestao(IN p_gestao_id CHAR(36))
BEGIN
  DECLARE v_org_id CHAR(36);

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT org_id INTO v_org_id FROM gestoes WHERE id = p_gestao_id;
  IF v_org_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gestão não encontrada';
  END IF;

  UPDATE gestoes SET ativo = FALSE, org_id_se_ativo = NULL WHERE org_id = v_org_id AND id <> p_gestao_id AND ativo;
  UPDATE gestoes SET ativo = TRUE, org_id_se_ativo = org_id WHERE id = p_gestao_id;
END$$
DELIMITER ;

-- RLS original: SELECT livre; escrita admin/secretario.
CREATE TABLE IF NOT EXISTS gestao_cargos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  gestao_id CHAR(36) NOT NULL,
  cargo_id CHAR(36) NOT NULL,
  irmao_id CHAR(36) NOT NULL,
  data_inicio DATE,
  data_fim DATE,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY gestao_cargos_uniq (gestao_id, cargo_id, irmao_id),
  CONSTRAINT fk_gestao_cargos_gestao FOREIGN KEY (gestao_id) REFERENCES gestoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_gestao_cargos_cargo FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gestao_cargos_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_gestao_cargos_gestao ON gestao_cargos (gestao_id);
CREATE INDEX idx_gestao_cargos_irmao ON gestao_cargos (irmao_id);

-- =========================================
-- TERCEIROS (fornecedores/clientes)
-- RLS original: SELECT admin/tesoureiro/secretario; escrita admin/tesoureiro.
-- =========================================
CREATE TABLE IF NOT EXISTS terceiros (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tipo ENUM('fornecedor', 'cliente', 'ambos') NOT NULL DEFAULT 'fornecedor',
  nome VARCHAR(255) NOT NULL,
  nome_fantasia VARCHAR(255),
  cnpj VARCHAR(20),
  cpf VARCHAR(20),
  contato VARCHAR(255),
  email VARCHAR(255),
  categoria VARCHAR(100),
  cep VARCHAR(20),
  logradouro VARCHAR(255),
  numero VARCHAR(20),
  bairro VARCHAR(255),
  municipio VARCHAR(255),
  uf VARCHAR(2),
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE INDEX idx_terceiros_cnpj ON terceiros (cnpj);
CREATE INDEX idx_terceiros_nome ON terceiros (nome);

-- =========================================
-- FICHA DO IRMÃO — listas dinâmicas
-- RLS original (todas as quatro): SELECT admin/secretario/tesoureiro (tudo)
-- ou o próprio irmão vinculado; escrita só admin/secretario.
-- =========================================
CREATE TABLE IF NOT EXISTS irmao_formacao (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  curso VARCHAR(255) NOT NULL,
  instituicao VARCHAR(255),
  nivel VARCHAR(100),
  ano_conclusao INT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_irmao_formacao_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_irmao_formacao_irmao ON irmao_formacao (irmao_id);

CREATE TABLE IF NOT EXISTS irmao_filhos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  data_nascimento DATE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_irmao_filhos_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_irmao_filhos_irmao ON irmao_filhos (irmao_id);

CREATE TABLE IF NOT EXISTS irmao_parentes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  tipo ENUM('pai', 'mae', 'conjuge', 'contato_emergencia', 'outro') NOT NULL,
  nome VARCHAR(255) NOT NULL,
  data_nascimento DATE,
  telefone VARCHAR(50),
  profissao VARCHAR(255),
  data_casamento DATE,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_irmao_parentes_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_irmao_parentes_irmao ON irmao_parentes (irmao_id);

CREATE TABLE IF NOT EXISTS irmao_elevacoes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  grau INT NOT NULL,
  data DATE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY irmao_elevacoes_irmao_grau_uniq (irmao_id, grau),
  CONSTRAINT fk_irmao_elevacoes_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE,
  CONSTRAINT chk_irmao_elevacoes_grau CHECK (grau > 0)
) ENGINE=InnoDB;
CREATE INDEX idx_irmao_elevacoes_irmao ON irmao_elevacoes (irmao_id);

-- =========================================
-- Fotos de irmãos: o Postgres usava um bucket do Supabase Storage
-- ("irmao-fotos", público para leitura, escrita admin/secretario). Sem
-- Supabase Storage, o upload físico do arquivo passa a ser responsabilidade
-- da rota Node.js (disco da hospedagem ou outro storage) — fora do escopo
-- desta migração de schema. A coluna `foto_url` acima já guarda o caminho/
-- URL final, qualquer que seja o backend de armazenamento escolhido na
-- issue #53.
-- =========================================
