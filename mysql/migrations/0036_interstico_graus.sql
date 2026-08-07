-- =========================================
-- INTERSTÍCIO — tempo mínimo (em meses) que um irmão precisa permanecer
-- num grau antes de ficar elegível para o próximo. Varia por grau
-- (decisão da issue #84), por isso fica em orgs_graus (não um valor
-- único global). NULL = sem regra definida para esse grau — não entra
-- no cálculo de elegibilidade.
-- =========================================
ALTER TABLE orgs_graus
  ADD COLUMN interstico_minimo_meses INT NULL AFTER nome;
