-- =========================================
-- Ficha completa do Irmão — issue #5
-- Amplia irmaos com dados de identificação/maçônico/profissional/contato
-- e cria as entidades normalizadas para as listas dinâmicas da ficha
-- (formação, filhos, parentes, elevações de grau) — em vez de blobs JSON
-- soltos como no sistema legado.
-- =========================================

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

-- =========================================
-- Formação acadêmica (lista dinâmica)
-- =========================================
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

-- =========================================
-- Filhos (lista dinâmica)
-- =========================================
CREATE TABLE public.irmao_filhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_nascimento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.irmao_filhos (irmao_id);

-- =========================================
-- Pai/mãe/cônjuge/contato de emergência/outros aniversariantes
-- =========================================
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

-- =========================================
-- Histórico de elevação de grau (substitui os checkboxes fi-elev-5..33)
-- =========================================
CREATE TABLE public.irmao_elevacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE CASCADE,
  grau INTEGER NOT NULL CHECK (grau > 0),
  data DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (irmao_id, grau)
);
CREATE INDEX ON public.irmao_elevacoes (irmao_id);

-- =========================================
-- RLS: mesmo padrão de irmaos — admin/secretario/tesoureiro veem tudo,
-- o próprio irmão vê os seus; só admin/secretario escrevem (dados
-- administrativos, fora do escopo de autoedição do portal).
-- =========================================
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

-- =========================================
-- Storage: fotos de irmãos (bucket público para leitura simples via URL;
-- escrita restrita a admin/secretario).
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('irmao-fotos', 'irmao-fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "irmao_fotos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'irmao-fotos');
CREATE POLICY "irmao_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'irmao-fotos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario')));
CREATE POLICY "irmao_fotos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'irmao-fotos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario')));
CREATE POLICY "irmao_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'irmao-fotos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario')));
