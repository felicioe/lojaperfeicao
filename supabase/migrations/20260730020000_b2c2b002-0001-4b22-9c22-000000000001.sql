-- =========================================
-- Plano de contas — árvore hierárquica
-- Issue #2
-- =========================================
ALTER TYPE public.tipo_plano_conta ADD VALUE IF NOT EXISTS 'patrimonio_liquido';

ALTER TABLE public.plano_contas
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.plano_contas(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS plano_contas_parent_id_idx ON public.plano_contas (parent_id);
