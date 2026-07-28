
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'tesoureiro', 'secretario', 'irmao');
CREATE TYPE public.grau_macom AS ENUM ('aprendiz', 'companheiro', 'mestre');
CREATE TYPE public.situacao_irmao AS ENUM ('ativo', 'quite', 'irregular', 'adormecido');
CREATE TYPE public.tipo_lancamento AS ENUM ('entrada', 'saida', 'transferencia');
CREATE TYPE public.tipo_conta AS ENUM ('caixa', 'banco', 'outro');
CREATE TYPE public.tipo_plano_conta AS ENUM ('receita', 'despesa');
CREATE TYPE public.tipo_sessao AS ENUM ('ordinaria', 'magna', 'branca', 'administrativa');

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  irmao_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================
-- USER ROLES
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, _role)
$$;

-- profiles policies
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario') OR public.has_role(auth.uid(), 'tesoureiro'));
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles policies (read-only for non-admin; managed by admin server-side)
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =========================================
-- IRMÃOS
-- =========================================
CREATE TABLE public.irmaos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome_civil TEXT NOT NULL,
  nome_simbolico TEXT,
  cim TEXT,
  grau public.grau_macom NOT NULL DEFAULT 'aprendiz',
  data_iniciacao DATE,
  data_elevacao DATE,
  data_exaltacao DATE,
  situacao public.situacao_irmao NOT NULL DEFAULT 'ativo',
  potencia TEXT,
  loja_origem TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  data_nascimento DATE,
  profissao TEXT,
  valor_mensalidade NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.irmaos TO authenticated;
GRANT ALL ON public.irmaos TO service_role;
ALTER TABLE public.irmaos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "irmaos_select" ON public.irmaos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'secretario')
    OR public.has_role(auth.uid(), 'tesoureiro')
    OR user_id = auth.uid()
  );
CREATE POLICY "irmaos_insert" ON public.irmaos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));
CREATE POLICY "irmaos_update" ON public.irmaos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));
CREATE POLICY "irmaos_delete" ON public.irmaos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- SESSÕES E PRESENÇAS
-- =========================================
CREATE TABLE public.sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  tipo public.tipo_sessao NOT NULL DEFAULT 'ordinaria',
  grau public.grau_macom NOT NULL DEFAULT 'aprendiz',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessoes TO authenticated;
GRANT ALL ON public.sessoes TO service_role;
ALTER TABLE public.sessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessoes_select" ON public.sessoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "sessoes_write_secretario" ON public.sessoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));

CREATE TABLE public.presencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id UUID NOT NULL REFERENCES public.sessoes(id) ON DELETE CASCADE,
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE CASCADE,
  presente BOOLEAN NOT NULL DEFAULT false,
  justificado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sessao_id, irmao_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presencas TO authenticated;
GRANT ALL ON public.presencas TO service_role;
ALTER TABLE public.presencas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presencas_select" ON public.presencas FOR SELECT TO authenticated USING (true);
CREATE POLICY "presencas_write" ON public.presencas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretario'));

-- =========================================
-- TESOURARIA
-- =========================================
CREATE TABLE public.plano_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo public.tipo_plano_conta NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_contas TO authenticated;
GRANT ALL ON public.plano_contas TO service_role;
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plano_contas_select" ON public.plano_contas FOR SELECT TO authenticated USING (true);
CREATE POLICY "plano_contas_write" ON public.plano_contas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));

CREATE TABLE public.contas_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo public.tipo_conta NOT NULL DEFAULT 'caixa',
  banco TEXT,
  agencia TEXT,
  numero TEXT,
  saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_financeiras TO authenticated;
GRANT ALL ON public.contas_financeiras TO service_role;
ALTER TABLE public.contas_financeiras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contas_select" ON public.contas_financeiras FOR SELECT TO authenticated USING (true);
CREATE POLICY "contas_write" ON public.contas_financeiras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));

CREATE TABLE public.lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE,
  data_pagamento DATE,
  descricao TEXT NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  tipo public.tipo_lancamento NOT NULL,
  conta_id UUID REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  conta_destino_id UUID REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  plano_conta_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  irmao_id UUID REFERENCES public.irmaos(id) ON DELETE SET NULL,
  pago BOOLEAN NOT NULL DEFAULT true,
  is_mensalidade BOOLEAN NOT NULL DEFAULT false,
  competencia_mes DATE,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.lancamentos (data);
CREATE INDEX ON public.lancamentos (data_vencimento);
CREATE INDEX ON public.lancamentos (irmao_id);
CREATE INDEX ON public.lancamentos (is_mensalidade, competencia_mes);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO authenticated;
GRANT ALL ON public.lancamentos TO service_role;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lancamentos_select" ON public.lancamentos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'tesoureiro')
    OR public.has_role(auth.uid(), 'secretario')
    OR EXISTS (SELECT 1 FROM public.irmaos i WHERE i.id = lancamentos.irmao_id AND i.user_id = auth.uid())
  );
CREATE POLICY "lancamentos_write" ON public.lancamentos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));

-- =========================================
-- TRIGGERS updated_at
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_irmaos_updated BEFORE UPDATE ON public.irmaos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lancamentos_updated BEFORE UPDATE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- AUTO-CRIAR PROFILE + PRIMEIRO ADMIN
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) = 0 INTO is_first FROM public.user_roles;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'irmao');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- SEED plano de contas
-- =========================================
INSERT INTO public.plano_contas (codigo, nome, tipo) VALUES
  ('4.1.01', 'Mensalidades', 'receita'),
  ('4.1.02', 'Doações', 'receita'),
  ('4.1.03', 'Eventos', 'receita'),
  ('5.1.01', 'Aluguel', 'despesa'),
  ('5.1.02', 'Água/Luz/Internet', 'despesa'),
  ('5.1.03', 'Manutenção', 'despesa'),
  ('5.1.04', 'Material de expediente', 'despesa'),
  ('5.1.05', 'Beneficência', 'despesa');

-- Conta caixa inicial
INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial) VALUES
  ('Caixa Geral', 'caixa', 0);

-- =========================================
-- RPC: gerar mensalidades do mês
-- =========================================
CREATE OR REPLACE FUNCTION public.gerar_mensalidades(_competencia DATE)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plano UUID;
  _conta UUID;
  _venc DATE;
  _count INTEGER := 0;
  r RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  SELECT id INTO _plano FROM public.plano_contas WHERE codigo = '4.1.01' LIMIT 1;
  SELECT id INTO _conta FROM public.contas_financeiras WHERE ativo = true ORDER BY created_at LIMIT 1;
  _venc := (date_trunc('month', _competencia) + INTERVAL '9 days')::date;

  FOR r IN SELECT id, valor_mensalidade FROM public.irmaos
           WHERE situacao IN ('ativo','quite','irregular') AND valor_mensalidade > 0 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.lancamentos
      WHERE is_mensalidade AND irmao_id = r.id
        AND competencia_mes = date_trunc('month', _competencia)::date
    ) THEN
      INSERT INTO public.lancamentos (data, data_vencimento, descricao, valor, tipo,
        conta_id, plano_conta_id, irmao_id, pago, is_mensalidade, competencia_mes, created_by)
      VALUES (CURRENT_DATE, _venc,
        'Mensalidade ' || to_char(_competencia,'MM/YYYY'), r.valor_mensalidade, 'entrada',
        _conta, _plano, r.id, false, true, date_trunc('month', _competencia)::date, auth.uid());
      _count := _count + 1;
    END IF;
  END LOOP;
  RETURN _count;
END; $$;

GRANT EXECUTE ON FUNCTION public.gerar_mensalidades(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

-- =========================================
-- View de saldos
-- =========================================
CREATE OR REPLACE VIEW public.v_saldo_contas AS
SELECT
  c.id,
  c.nome,
  c.tipo,
  c.saldo_inicial
    + COALESCE((SELECT SUM(valor) FROM public.lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'entrada' AND l.pago),0)
    - COALESCE((SELECT SUM(valor) FROM public.lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'saida' AND l.pago),0)
    - COALESCE((SELECT SUM(valor) FROM public.lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'transferencia' AND l.pago),0)
    + COALESCE((SELECT SUM(valor) FROM public.lancamentos l WHERE l.conta_destino_id = c.id AND l.tipo = 'transferencia' AND l.pago),0)
  AS saldo_atual
FROM public.contas_financeiras c;

GRANT SELECT ON public.v_saldo_contas TO authenticated;
