-- =========================================
-- Orçamento anual e DRE orçado — issue #16
--
-- Cadastro de orçamento anual por conta analítica (receita/despesa),
-- com valor mês a mês, e fluxo de aprovação (rascunho -> aprovado),
-- equivalente a renderOrcamentoEdit/orc-aprovar-btn do sistema legado.
-- Acompanhamento orçado x realizado e o DRE orçado são só leitura,
-- cruzando esta tabela com lancamentos_contabeis_itens — sem tabela
-- ou RPC própria, no mesmo padrão de razao.tsx/dre.tsx.
-- =========================================
CREATE TABLE public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL UNIQUE CHECK (ano BETWEEN 2000 AND 2100),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado')),
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id),
  aprovado_por UUID REFERENCES auth.users(id),
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orcamentos TO authenticated;
GRANT ALL ON public.orcamentos TO service_role;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orcamentos_select" ON public.orcamentos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));
-- Sem policy de INSERT/UPDATE: só as RPCs abaixo (SECURITY DEFINER) escrevem
-- aqui, para garantir a transição de status rascunho -> aprovado controlada.

CREATE TABLE public.orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  conta_id UUID NOT NULL REFERENCES public.plano_contas(id) ON DELETE RESTRICT,
  mes SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  UNIQUE (orcamento_id, conta_id, mes)
);
CREATE INDEX ON public.orcamento_itens (orcamento_id);
CREATE INDEX ON public.orcamento_itens (conta_id);
GRANT SELECT ON public.orcamento_itens TO authenticated;
GRANT ALL ON public.orcamento_itens TO service_role;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orcamento_itens_select" ON public.orcamento_itens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));

-- =========================================
-- RPC: cria o orçamento (rascunho) de um ano. Um único orçamento por ano
-- (UNIQUE em orcamentos.ano).
-- =========================================
CREATE OR REPLACE FUNCTION public.criar_orcamento(_ano INTEGER, _observacoes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orcamentos WHERE ano = _ano) THEN
    RAISE EXCEPTION 'Já existe um orçamento cadastrado para o ano %', _ano;
  END IF;

  INSERT INTO public.orcamentos (ano, observacoes, created_by)
  VALUES (_ano, _observacoes, auth.uid())
  RETURNING id INTO _id;

  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.criar_orcamento(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_orcamento(INTEGER, TEXT) TO authenticated;

-- =========================================
-- RPC: define (upsert) o valor orçado de uma conta analítica em um mês.
-- Só permitido enquanto o orçamento está em rascunho — depois de aprovado,
-- é preciso reabrir antes de editar.
-- =========================================
CREATE OR REPLACE FUNCTION public.definir_valor_orcamento(_orcamento_id UUID, _conta_id UUID, _mes INTEGER, _valor NUMERIC)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _status TEXT;
  _conta RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT status INTO _status FROM public.orcamentos WHERE id = _orcamento_id;
  IF _status IS NULL THEN
    RAISE EXCEPTION 'Orçamento não encontrado';
  END IF;
  IF _status <> 'rascunho' THEN
    RAISE EXCEPTION 'Orçamento aprovado não pode ser editado — reabra antes de editar';
  END IF;

  SELECT * INTO _conta FROM public.plano_contas WHERE id = _conta_id;
  IF _conta IS NULL OR NOT _conta.analitica OR _conta.tipo NOT IN ('receita', 'despesa') THEN
    RAISE EXCEPTION 'Conta inválida para orçamento — selecione uma conta analítica de receita ou despesa';
  END IF;

  INSERT INTO public.orcamento_itens (orcamento_id, conta_id, mes, valor)
  VALUES (_orcamento_id, _conta_id, _mes, _valor)
  ON CONFLICT (orcamento_id, conta_id, mes) DO UPDATE SET valor = EXCLUDED.valor;
END; $$;

REVOKE ALL ON FUNCTION public.definir_valor_orcamento(UUID, UUID, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_valor_orcamento(UUID, UUID, INTEGER, NUMERIC) TO authenticated;

-- =========================================
-- RPC: aprova o orçamento (rascunho -> aprovado), travando os valores.
-- Só admin aprova, equivalente ao orc-aprovar-btn do legado.
-- =========================================
CREATE OR REPLACE FUNCTION public.aprovar_orcamento(_orcamento_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão — apenas admin aprova o orçamento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orcamentos WHERE id = _orcamento_id AND status = 'rascunho') THEN
    RAISE EXCEPTION 'Orçamento não encontrado ou já aprovado';
  END IF;

  UPDATE public.orcamentos
  SET status = 'aprovado', aprovado_por = auth.uid(), aprovado_em = now()
  WHERE id = _orcamento_id;
END; $$;

REVOKE ALL ON FUNCTION public.aprovar_orcamento(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_orcamento(UUID) TO authenticated;

-- =========================================
-- RPC: reabre um orçamento aprovado (volta para rascunho), para permitir
-- correções antes de reaprovar.
-- =========================================
CREATE OR REPLACE FUNCTION public.reabrir_orcamento(_orcamento_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão — apenas admin reabre o orçamento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orcamentos WHERE id = _orcamento_id AND status = 'aprovado') THEN
    RAISE EXCEPTION 'Orçamento não encontrado ou não está aprovado';
  END IF;

  UPDATE public.orcamentos
  SET status = 'rascunho', aprovado_por = NULL, aprovado_em = NULL
  WHERE id = _orcamento_id;
END; $$;

REVOKE ALL ON FUNCTION public.reabrir_orcamento(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_orcamento(UUID) TO authenticated;
