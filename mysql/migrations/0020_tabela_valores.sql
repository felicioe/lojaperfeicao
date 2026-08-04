-- =========================================
-- TABELA DE VALORES (mensalidade, iniciação, troca de grau — parte da
-- Loja) — manutenção de valores com data de vigência.
--
-- `tipo` é texto livre (não ENUM) de propósito: começa com mensalidade/
-- iniciacao/troca_grau_loja, mas o usuário pediu mais tipos no futuro sem
-- precisar de nova migração toda vez. `org_id` nullable = valor global
-- (não específico de um corpo). Isto é só a tabela de referência/
-- histórico — NÃO dispara cobrança automática; a "reajustar mensalidade
-- em massa" (src/lib/backend/tabela-valores.ts) grava aqui E atualiza
-- irmaos.valor_mensalidade na mesma operação, deixando registrado
-- o "antes/depois" via auditoria. Lançamentos já gerados nunca são
-- tocados — só as gerações futuras de mensalidade usam o valor novo
-- (não retroativo, conforme confirmado pelo usuário).
-- =========================================
CREATE TABLE IF NOT EXISTS tabela_valores (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL,
  org_id CHAR(36) NULL,
  valor DECIMAL(12, 2) NOT NULL,
  vigencia_inicio DATE NOT NULL,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tabela_valores_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_tabela_valores_tipo ON tabela_valores (tipo, org_id, vigencia_inicio);
