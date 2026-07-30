ALTER TABLE public.contas_financeiras
  ADD COLUMN IF NOT EXISTS plano_conta_id UUID REFERENCES public.plano_contas(id) ON DELETE RESTRICT;

UPDATE public.contas_financeiras cf SET plano_conta_id = pc.id
  FROM public.plano_contas pc WHERE pc.codigo = '1.1.01' AND cf.plano_conta_id IS NULL;

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS terceiro_id UUID REFERENCES public.terceiros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
CREATE INDEX IF NOT EXISTS lancamentos_terceiro_id_idx ON public.lancamentos (terceiro_id);

CREATE OR REPLACE FUNCTION public.criar_conta_pagar(
  _descricao TEXT,
  _valor NUMERIC,
  _plano_conta_id UUID,
  _data DATE DEFAULT CURRENT_DATE,
  _data_vencimento DATE DEFAULT CURRENT_DATE,
  _competencia_mes DATE DEFAULT NULL,
  _terceiro_id UUID DEFAULT NULL,
  _observacoes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lanc_id UUID;
  _conta_pagar_id UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _valor IS NULL OR _valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;

  SELECT id INTO _conta_pagar_id FROM public.plano_contas WHERE codigo = '2.1.01';
  IF _conta_pagar_id IS NULL THEN
    RAISE EXCEPTION 'Conta "Contas a Pagar" (2.1.01) não encontrada no plano de contas';
  END IF;

  INSERT INTO public.lancamentos (
    data, data_vencimento, descricao, valor, tipo, plano_conta_id,
    terceiro_id, pago, competencia_mes, observacoes, created_by
  ) VALUES (
    _data, _data_vencimento, _descricao, _valor, 'saida', _plano_conta_id,
    _terceiro_id, false, _competencia_mes, _observacoes, auth.uid()
  ) RETURNING id INTO _lanc_id;

  PERFORM public.registrar_lancamento_contabil(
    _data, COALESCE(_competencia_mes, date_trunc('month', _data)::date),
    'Provisão: ' || _descricao,
    jsonb_build_array(
      jsonb_build_object('conta_id', _plano_conta_id, 'tipo', 'debito', 'valor', _valor),
      jsonb_build_object('conta_id', _conta_pagar_id, 'tipo', 'credito', 'valor', _valor)
    ),
    'conta_pagar_provisao', _lanc_id
  );

  RETURN _lanc_id;
END; $$;

REVOKE ALL ON FUNCTION public.criar_conta_pagar(TEXT, NUMERIC, UUID, DATE, DATE, DATE, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_conta_pagar(TEXT, NUMERIC, UUID, DATE, DATE, DATE, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.baixar_conta_pagar(
  _lancamento_id UUID,
  _conta_financeira_id UUID,
  _forma_pagamento TEXT DEFAULT NULL,
  _data_pagamento DATE DEFAULT CURRENT_DATE
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _valor NUMERIC;
  _descricao TEXT;
  _pago BOOLEAN;
  _conta_pagar_id UUID;
  _plano_conta_banco UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT valor, descricao, pago INTO _valor, _descricao, _pago
  FROM public.lancamentos WHERE id = _lancamento_id AND tipo = 'saida';
  IF _valor IS NULL THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada';
  END IF;
  IF _pago THEN
    RAISE EXCEPTION 'Esta conta a pagar já foi baixada';
  END IF;

  SELECT plano_conta_id INTO _plano_conta_banco FROM public.contas_financeiras WHERE id = _conta_financeira_id;
  IF _plano_conta_banco IS NULL THEN
    RAISE EXCEPTION 'A conta bancária/caixa selecionada não tem uma conta do plano de contas vinculada';
  END IF;

  SELECT id INTO _conta_pagar_id FROM public.plano_contas WHERE codigo = '2.1.01';

  UPDATE public.lancamentos
  SET pago = true, data_pagamento = _data_pagamento, conta_id = _conta_financeira_id, forma_pagamento = _forma_pagamento
  WHERE id = _lancamento_id;

  PERFORM public.registrar_lancamento_contabil(
    _data_pagamento, date_trunc('month', _data_pagamento)::date,
    'Baixa: ' || _descricao,
    jsonb_build_array(
      jsonb_build_object('conta_id', _conta_pagar_id, 'tipo', 'debito', 'valor', _valor),
      jsonb_build_object('conta_id', _plano_conta_banco, 'tipo', 'credito', 'valor', _valor)
    ),
    'conta_pagar_baixa', _lancamento_id
  );
END; $$;

REVOKE ALL ON FUNCTION public.baixar_conta_pagar(UUID, UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.baixar_conta_pagar(UUID, UUID, TEXT, DATE) TO authenticated;

CREATE TABLE public.despesas_recorrentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  plano_conta_id UUID NOT NULL REFERENCES public.plano_contas(id) ON DELETE RESTRICT,
  terceiro_id UUID REFERENCES public.terceiros(id) ON DELETE SET NULL,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);
GRANT SELECT ON public.despesas_recorrentes TO authenticated;
GRANT ALL ON public.despesas_recorrentes TO service_role;
ALTER TABLE public.despesas_recorrentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "despesas_recorrentes_select" ON public.despesas_recorrentes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));
CREATE POLICY "despesas_recorrentes_write" ON public.despesas_recorrentes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));

CREATE TRIGGER trg_despesas_recorrentes_updated BEFORE UPDATE ON public.despesas_recorrentes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS recorrente_id UUID REFERENCES public.despesas_recorrentes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_recorrente_competencia_uniq
  ON public.lancamentos (recorrente_id, competencia_mes) WHERE recorrente_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.efetivar_recorrentes_vencidas()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  _competencia DATE := date_trunc('month', CURRENT_DATE)::date;
  _venc DATE;
  _lanc_id UUID;
  _conta_pagar_id UUID;
  _count INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT id INTO _conta_pagar_id FROM public.plano_contas WHERE codigo = '2.1.01';
  IF _conta_pagar_id IS NULL THEN
    RAISE EXCEPTION 'Conta "Contas a Pagar" (2.1.01) não encontrada no plano de contas';
  END IF;

  FOR r IN
    SELECT * FROM public.despesas_recorrentes
    WHERE ativo
      AND data_inicio <= CURRENT_DATE
      AND (data_fim IS NULL OR data_fim >= CURRENT_DATE)
      AND EXTRACT(DAY FROM CURRENT_DATE)::int >= dia_vencimento
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.lancamentos WHERE recorrente_id = r.id AND competencia_mes = _competencia
    );

    _venc := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, r.dia_vencimento);

    INSERT INTO public.lancamentos (
      data, data_vencimento, descricao, valor, tipo, plano_conta_id,
      terceiro_id, recorrente_id, pago, competencia_mes, observacoes
    ) VALUES (
      CURRENT_DATE, _venc, r.descricao, r.valor, 'saida', r.plano_conta_id,
      r.terceiro_id, r.id, false, _competencia, r.observacoes
    ) RETURNING id INTO _lanc_id;

    PERFORM public.registrar_lancamento_contabil(
      CURRENT_DATE, _competencia, 'Provisão (recorrente): ' || r.descricao,
      jsonb_build_array(
        jsonb_build_object('conta_id', r.plano_conta_id, 'tipo', 'debito', 'valor', r.valor),
        jsonb_build_object('conta_id', _conta_pagar_id, 'tipo', 'credito', 'valor', r.valor)
      ),
      'conta_pagar_provisao', _lanc_id
    );

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END; $$;

REVOKE ALL ON FUNCTION public.efetivar_recorrentes_vencidas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.efetivar_recorrentes_vencidas() TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_lancamento_contabil(
  _data DATE,
  _competencia DATE,
  _descricao TEXT,
  _itens JSONB,
  _origem_tipo TEXT DEFAULT NULL,
  _origem_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lanc_id UUID;
  _item JSONB;
  _conta_id UUID;
  _analitica BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão para registrar lançamento contábil';
  END IF;
  IF jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) < 2 THEN
    RAISE EXCEPTION 'Um lançamento contábil precisa de ao menos uma linha de débito e uma de crédito';
  END IF;

  INSERT INTO public.lancamentos_contabeis (data, competencia, descricao, origem_tipo, origem_id, criado_por)
  VALUES (_data, _competencia, _descricao, _origem_tipo, _origem_id, auth.uid())
  RETURNING id INTO _lanc_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    _conta_id := (_item->>'conta_id')::UUID;
    SELECT analitica INTO _analitica FROM public.plano_contas WHERE id = _conta_id;
    IF _analitica IS NULL THEN
      RAISE EXCEPTION 'Conta % não encontrada no plano de contas', _conta_id;
    END IF;
    IF NOT _analitica THEN
      RAISE EXCEPTION 'Conta % não é analítica — apenas contas-folha recebem lançamento', _conta_id;
    END IF;
    IF (_item->>'tipo') NOT IN ('debito', 'credito') THEN
      RAISE EXCEPTION 'Tipo de linha inválido: %', _item->>'tipo';
    END IF;

    INSERT INTO public.lancamentos_contabeis_itens (lancamento_id, conta_id, tipo, valor, descricao)
    VALUES (_lanc_id, _conta_id, _item->>'tipo', (_item->>'valor')::NUMERIC, _item->>'descricao');
  END LOOP;

  RETURN _lanc_id;
END; $$;