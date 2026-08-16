-- =========================================
-- SESSÕES — tipo "iniciação". O importador de PDF de cronograma
-- (importacao-pdf-sessoes.ts) e o rótulo em TIPO_SESSAO_LABEL
-- (src/lib/format.ts) já tratam "iniciacao" como um tipo de sessão válido
-- há tempos, mas o ENUM da coluna nunca foi estendido — toda tentativa de
-- criar uma sessão de iniciação (manual ou via importação de PDF) falhava
-- com "Data truncated for column 'tipo'".
-- =========================================
ALTER TABLE sessoes
  MODIFY COLUMN tipo ENUM('ordinaria', 'magna', 'branca', 'administrativa', 'iniciacao')
  NOT NULL DEFAULT 'ordinaria';
