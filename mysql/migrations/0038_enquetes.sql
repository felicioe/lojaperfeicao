-- =========================================
-- ENQUETES — consultas rápidas e não-sigilosas (issue #86). Cada enquete
-- escolhe, na criação, se é nominal ou anônima, e se o resultado fica
-- visível durante a votação ou só depois de encerrada (decisões
-- confirmadas na issue — não são configurações globais).
--
-- Fora de escopo, propositalmente: eleições de cargos formais e votações
-- estatutárias, que têm regras próprias (voto secreto, quórum, apuração
-- formal) que este módulo simples não tenta substituir.
-- =========================================
CREATE TABLE IF NOT EXISTS enquetes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT NULL,
  nominal BOOLEAN NOT NULL DEFAULT FALSE,
  mostrar_resultado_sempre BOOLEAN NOT NULL DEFAULT TRUE,
  data_limite DATE NULL,
  encerrada BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por CHAR(36) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_enquetes_criado_por FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS enquete_opcoes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  enquete_id CHAR(36) NOT NULL,
  texto VARCHAR(255) NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_enquete_opcoes_enquete FOREIGN KEY (enquete_id) REFERENCES enquetes(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_enquete_opcoes_enquete ON enquete_opcoes (enquete_id);

-- Um voto por irmão por enquete (troca de voto permitida até a enquete
-- encerrar — UPDATE via ON DUPLICATE KEY). Guarda irmao_id mesmo em
-- enquetes anônimas (necessário pra impedir voto duplicado); só a TELA
-- de resultado de uma enquete anônima é que nunca expõe esse vínculo.
CREATE TABLE IF NOT EXISTS enquete_votos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  enquete_id CHAR(36) NOT NULL,
  opcao_id CHAR(36) NOT NULL,
  irmao_id CHAR(36) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY enquete_votos_enquete_irmao_uniq (enquete_id, irmao_id),
  CONSTRAINT fk_enquete_votos_enquete FOREIGN KEY (enquete_id) REFERENCES enquetes(id) ON DELETE CASCADE,
  CONSTRAINT fk_enquete_votos_opcao FOREIGN KEY (opcao_id) REFERENCES enquete_opcoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_enquete_votos_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_enquete_votos_opcao ON enquete_votos (opcao_id);
