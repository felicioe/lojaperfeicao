-- =========================================
-- PEÇAS DE ARQUITETURA — fluxo de aprovação (#224). Peças cadastradas a
-- partir de agora nascem "em_analise" (DEFAULT da coluna) e só ficam
-- visíveis aos demais irmãos depois de aprovadas; as já existentes até
-- aqui são dadas como aprovadas retroativamente (já estavam publicadas).
-- =========================================
ALTER TABLE pecas_arquitetura
  ADD COLUMN situacao ENUM('em_analise', 'aprovado', 'rejeitado') NOT NULL DEFAULT 'em_analise';
UPDATE pecas_arquitetura SET situacao = 'aprovado';

ALTER TABLE pecas_arquitetura ADD COLUMN aprovado_por CHAR(36) NULL;
ALTER TABLE pecas_arquitetura ADD COLUMN aprovado_em TIMESTAMP NULL;
ALTER TABLE pecas_arquitetura
  ADD CONSTRAINT fk_pecas_arquitetura_aprovado_por FOREIGN KEY (aprovado_por) REFERENCES irmaos(id) ON DELETE SET NULL;
CREATE INDEX idx_pecas_arquitetura_situacao ON pecas_arquitetura (situacao);
