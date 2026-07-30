-- =========================================
-- Corpos maçônicos (orgs) e Potência — suporte multi-loja
-- Issue #3
-- =========================================
CREATE TYPE public.natureza_corpo AS ENUM ('loja', 'capitulo', 'conselho', 'areopago', 'consistorio', 'outro');

-- =========================================
-- Potência: órgão federativo/obediência ao qual os corpos são filiados.
-- =========================================
CREATE TABLE public.potencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  sigla TEXT,
  jurisdicao TEXT,
  site TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.potencias TO authenticated;
GRANT ALL ON public.potencias TO service_role;
ALTER TABLE public.potencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "potencias_select" ON public.potencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "potencias_write" ON public.potencias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));

-- =========================================
-- Orgs (corpos maçônicos administrados por esta instalação)
-- =========================================
CREATE TABLE public.orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  potencia_id UUID REFERENCES public.potencias(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  sigla TEXT,
  natureza public.natureza_corpo NOT NULL DEFAULT 'loja',
  numero TEXT,
  rito TEXT,
  grau_min INTEGER NOT NULL DEFAULT 1,
  grau_max INTEGER NOT NULL DEFAULT 3,
  mensalidade_padrao NUMERIC(12,2) NOT NULL DEFAULT 0,
  cnpj TEXT,
  fundacao DATE,
  endereco TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (grau_max >= grau_min)
);
GRANT SELECT ON public.orgs TO authenticated;
GRANT ALL ON public.orgs TO service_role;
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orgs_select" ON public.orgs FOR SELECT TO authenticated USING (true);
CREATE POLICY "orgs_write" ON public.orgs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));

CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON public.orgs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- Lista de graus customizada por corpo (ex.: Loja usa 1-3, Capítulo 4-18…)
-- =========================================
CREATE TABLE public.orgs_graus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  grau INTEGER NOT NULL CHECK (grau > 0),
  nome TEXT NOT NULL,
  UNIQUE (org_id, grau)
);
GRANT SELECT ON public.orgs_graus TO authenticated;
GRANT ALL ON public.orgs_graus TO service_role;
ALTER TABLE public.orgs_graus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orgs_graus_select" ON public.orgs_graus FOR SELECT TO authenticated USING (true);
CREATE POLICY "orgs_graus_write" ON public.orgs_graus FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));

-- =========================================
-- Vínculo irmão <-> corpo (substitui o array solto "corpos[]" do legado)
-- =========================================
CREATE TABLE public.irmao_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  principal BOOLEAN NOT NULL DEFAULT false,
  grau_atual INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (irmao_id, org_id)
);
CREATE INDEX ON public.irmao_orgs (irmao_id);
CREATE INDEX ON public.irmao_orgs (org_id);
GRANT SELECT ON public.irmao_orgs TO authenticated;
GRANT ALL ON public.irmao_orgs TO service_role;
ALTER TABLE public.irmao_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "irmao_orgs_select" ON public.irmao_orgs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'secretario')
    OR public.has_role(auth.uid(), 'tesoureiro')
    OR EXISTS (SELECT 1 FROM public.irmaos i WHERE i.id = irmao_orgs.irmao_id AND i.user_id = auth.uid())
  );
CREATE POLICY "irmao_orgs_write" ON public.irmao_orgs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));

-- =========================================
-- RPC: gera as linhas de grau padrão de um corpo (1-3: Aprendiz/Companheiro/
-- Mestre; demais graus da faixa: "Grau N", para o admin renomear conforme o
-- rito/potência real — não inventamos nomenclatura ritual específica aqui).
-- =========================================
CREATE OR REPLACE FUNCTION public.gerar_graus_padrao_org(_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _min INT; _max INT; _g INT; _nome TEXT; _count INT := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  SELECT grau_min, grau_max INTO _min, _max FROM public.orgs WHERE id = _org_id;
  IF _min IS NULL THEN
    RAISE EXCEPTION 'Corpo não encontrado';
  END IF;
  FOR _g IN _min.._max LOOP
    _nome := CASE _g WHEN 1 THEN 'Aprendiz' WHEN 2 THEN 'Companheiro' WHEN 3 THEN 'Mestre' ELSE 'Grau ' || _g END;
    INSERT INTO public.orgs_graus (org_id, grau, nome) VALUES (_org_id, _g, _nome)
      ON CONFLICT (org_id, grau) DO NOTHING;
    GET DIAGNOSTICS _count = ROW_COUNT;
  END LOOP;
  RETURN (SELECT count(*)::int FROM public.orgs_graus WHERE org_id = _org_id);
END; $$;

REVOKE ALL ON FUNCTION public.gerar_graus_padrao_org(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_graus_padrao_org(UUID) TO authenticated;
