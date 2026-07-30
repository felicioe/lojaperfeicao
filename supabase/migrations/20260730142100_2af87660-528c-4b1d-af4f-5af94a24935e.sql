ALTER TYPE public.tipo_plano_conta ADD VALUE IF NOT EXISTS 'ativo';
ALTER TYPE public.tipo_plano_conta ADD VALUE IF NOT EXISTS 'passivo';
ALTER TABLE public.plano_contas ADD COLUMN IF NOT EXISTS analitica BOOLEAN NOT NULL DEFAULT true;