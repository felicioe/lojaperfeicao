-- =========================================
-- Motor de contabilidade em partida dobrada — base
-- Issue #1: adiciona os tipos patrimoniais (ativo/passivo) que faltam no
-- plano de contas atual (só tinha receita/despesa) e a flag "analitica"
-- que marca quais contas podem receber lançamento (só contas-folha).
-- A árvore hierárquica completa (parent_id) é escopo da issue #2.
-- =========================================
ALTER TYPE public.tipo_plano_conta ADD VALUE IF NOT EXISTS 'ativo';
ALTER TYPE public.tipo_plano_conta ADD VALUE IF NOT EXISTS 'passivo';

ALTER TABLE public.plano_contas
  ADD COLUMN IF NOT EXISTS analitica BOOLEAN NOT NULL DEFAULT true;
