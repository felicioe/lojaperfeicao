ALTER TABLE public.irmaos
  ADD COLUMN IF NOT EXISTS numero_matricula TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS naturalidade TEXT,
  ADD COLUMN IF NOT EXISTS nacionalidade TEXT DEFAULT 'Brasileira',
  ADD COLUMN IF NOT EXISTS religiao TEXT,
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS numero_grande_oriente TEXT,
  ADD COLUMN IF NOT EXISTS fundador BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS benemerito BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS honorario BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS licenciado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS empresa TEXT,
  ADD COLUMN IF NOT EXISTS cargo_profissional TEXT,
  ADD COLUMN IF NOT EXISTS area_atuacao TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS logradouro TEXT,
  ADD COLUMN IF NOT EXISTS numero_endereco TEXT,
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT,
  ADD COLUMN IF NOT EXISTS celular TEXT;

CREATE TYPE public.tipo_parente_irmao AS ENUM ('pai', 'mae', 'conjuge', 'contato_emergencia', 'outro');

CREATE TABLE public.irmao_formacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE CASCADE,
  curso TEXT NOT NULL,
  instituicao TEXT,
  nivel TEXT,
  ano_conclusao INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.irmao_formacao (irmao_id);

CREATE TABLE public.irmao_filhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_nascimento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.irmao_filhos (irmao_id);

CREATE TABLE public.irmao_parentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE CASCADE,
  tipo public.tipo_parente_irmao NOT NULL,
  nome TEXT NOT NULL,
  data_nascimento DATE,
  telefone TEXT,
  profissao TEXT,
  data_casamento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.irmao_parentes (irmao_id);

CREATE TABLE public.irmao_elevacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE CASCADE,
  grau INTEGER NOT NULL CHECK (grau > 0),
  data DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (irmao_id, grau)
);
CREATE INDEX ON public.irmao_elevacoes (irmao_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['irmao_formacao', 'irmao_filhos', 'irmao_parentes', 'irmao_elevacoes'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_select" ON public.%1$I FOR SELECT TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'secretario')
        OR public.has_role(auth.uid(), 'tesoureiro')
        OR EXISTS (SELECT 1 FROM public.irmaos i WHERE i.id = %1$I.irmao_id AND i.user_id = auth.uid())
      )
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_write" ON public.%1$I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
      WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
    $f$, t);
  END LOOP;
END $$;

CREATE POLICY "irmao_fotos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'irmao-fotos');
CREATE POLICY "irmao_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'irmao-fotos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario')));
CREATE POLICY "irmao_fotos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'irmao-fotos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario')));
CREATE POLICY "irmao_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'irmao-fotos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario')));

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