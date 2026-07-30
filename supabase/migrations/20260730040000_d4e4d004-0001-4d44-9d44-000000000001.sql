-- =========================================
-- Gestões e Cargos — mandatos administrativos e seus ocupantes
-- Issue #4
-- =========================================

-- Catálogo de cargos (Venerável, Secretário, Tesoureiro etc.). org_id NULL
-- = cargo genérico, reutilizável por qualquer corpo; preenchido = cargo
-- específico daquele corpo (corpos de natureza diferente costumam ter
-- cargos diferentes).
CREATE TABLE public.cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.cargos (org_id);
GRANT SELECT ON public.cargos TO authenticated;
GRANT ALL ON public.cargos TO service_role;
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cargos_select" ON public.cargos FOR SELECT TO authenticated USING (true);
CREATE POLICY "cargos_write" ON public.cargos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));

-- Gestão (mandato administrativo) de um corpo, ex.: "2024-2026".
CREATE TABLE public.gestoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim >= data_inicio)
);
CREATE INDEX ON public.gestoes (org_id);
GRANT SELECT ON public.gestoes TO authenticated;
GRANT ALL ON public.gestoes TO service_role;
ALTER TABLE public.gestoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestoes_select" ON public.gestoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestoes_write" ON public.gestoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));

-- Só uma gestão ativa (corrente) por corpo.
CREATE UNIQUE INDEX gestoes_uma_ativa_por_org ON public.gestoes (org_id) WHERE ativo;

CREATE OR REPLACE FUNCTION public.desativar_outras_gestoes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ativo THEN
    UPDATE public.gestoes SET ativo = false WHERE org_id = NEW.org_id AND id <> NEW.id AND ativo;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_gestoes_uma_ativa
  BEFORE INSERT OR UPDATE OF ativo ON public.gestoes
  FOR EACH ROW WHEN (NEW.ativo) EXECUTE FUNCTION public.desativar_outras_gestoes();

-- Quem ocupa qual cargo em qual gestão.
CREATE TABLE public.gestao_cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gestao_id UUID NOT NULL REFERENCES public.gestoes(id) ON DELETE CASCADE,
  cargo_id UUID NOT NULL REFERENCES public.cargos(id) ON DELETE RESTRICT,
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE RESTRICT,
  data_inicio DATE,
  data_fim DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gestao_id, cargo_id, irmao_id)
);
CREATE INDEX ON public.gestao_cargos (gestao_id);
CREATE INDEX ON public.gestao_cargos (irmao_id);
GRANT SELECT ON public.gestao_cargos TO authenticated;
GRANT ALL ON public.gestao_cargos TO service_role;
ALTER TABLE public.gestao_cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestao_cargos_select" ON public.gestao_cargos FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestao_cargos_write" ON public.gestao_cargos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));
