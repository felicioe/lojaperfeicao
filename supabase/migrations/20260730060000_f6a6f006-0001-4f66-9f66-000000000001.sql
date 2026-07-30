-- =========================================
-- Fornecedores/Clientes com consulta de CNPJ — issue #6
-- =========================================
CREATE TYPE public.tipo_terceiro AS ENUM ('fornecedor', 'cliente', 'ambos');

CREATE TABLE public.terceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.tipo_terceiro NOT NULL DEFAULT 'fornecedor',
  nome TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT,
  cpf TEXT,
  contato TEXT,
  email TEXT,
  categoria TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  bairro TEXT,
  municipio TEXT,
  uf TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.terceiros (cnpj);
CREATE INDEX ON public.terceiros (nome);
GRANT SELECT ON public.terceiros TO authenticated;
GRANT ALL ON public.terceiros TO service_role;
ALTER TABLE public.terceiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terceiros_select" ON public.terceiros FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro') OR public.has_role(auth.uid(), 'secretario'));
CREATE POLICY "terceiros_write" ON public.terceiros FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));

CREATE TRIGGER trg_terceiros_updated BEFORE UPDATE ON public.terceiros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- Cache e rate-limit da consulta de CNPJ — usados só pela edge function
-- (service_role), nunca acessados diretamente pelo client. Corrige duas
-- lacunas do endpoint equivalente no sistema legado, que não tinha nem
-- cache nem limite de chamadas.
-- =========================================
CREATE TABLE public.cnpj_consultas_cache (
  cnpj TEXT PRIMARY KEY,
  dados JSONB NOT NULL,
  consultado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cnpj_consultas_cache ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cnpj_consultas_cache TO service_role;

CREATE TABLE public.cnpj_rate_limit (
  user_id UUID PRIMARY KEY,
  tentativas INTEGER NOT NULL DEFAULT 0,
  janela_inicio TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cnpj_rate_limit ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cnpj_rate_limit TO service_role;
