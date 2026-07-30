-- =========================================
-- Parcelamento de faturas em atraso — issue #11
-- =========================================
CREATE TABLE public.parcelamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  valor_original NUMERIC(14,2) NOT NULL,
  valor_multa NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_juros NUMERIC(14,2) NOT NULL DEFAULT 0,
  entrada NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_parcelado NUMERIC(14,2) NOT NULL,
  numero_parcelas INTEGER NOT NULL CHECK (numero_parcelas > 0),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
CREATE INDEX ON public.parcelamentos (irmao_id);
GRANT SELECT ON public.parcelamentos TO authenticated;
GRANT ALL ON public.parcelamentos TO service_role;
ALTER TABLE public.parcelamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parcelamentos_select" ON public.parcelamentos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'tesoureiro')
    OR public.has_role(auth.uid(), 'secretario')
    OR EXISTS (SELECT 1 FROM public.irmaos i WHERE i.id = parcelamentos.irmao_id AND i.user_id = auth.uid())
  );
-- Sem policy de escrita: só a RPC criar_parcelamento (SECURITY DEFINER).

-- lancamentos ganha o vínculo com o acordo. "parcelado" distingue uma
-- fatura antiga encerrada por renegociação (pago=true, parcelado=true,
-- sem recibo_id — não houve caixa) de um pagamento normal (pago=true,
-- parcelado=false, com recibo_id).
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS parcelamento_id UUID REFERENCES public.parcelamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parcelado BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS lancamentos_parcelamento_id_idx ON public.lancamentos (parcelamento_id);

-- =========================================
-- RPC: renegocia N faturas em aberto do mesmo irmão em um acordo de
-- parcelamento. Um único lançamento contábil reclassifica a dívida:
--   D Contas a Receber (valor_parcelado — a nova dívida, já líquida da
--     entrada)
--   D conta bancária (entrada, se houver)
--   C Contas a Receber (soma dos valores originais das faturas antigas)
--   C Multas e Juros Recebidos (se optar por incorporar multa/juros)
-- As parcelas geradas e a fatura de entrada são registros informativos
-- (não postam provisão própria — já cobertos pela reclassificação
-- acima); a fatura de entrada nasce já paga, e as parcelas nascem em
-- aberto e seguem o fluxo normal de baixa da issue #10.
-- =========================================
CREATE OR REPLACE FUNCTION public.criar_parcelamento(
  _lancamento_ids UUID[],
  _numero_parcelas INTEGER,
  _entrada NUMERIC DEFAULT 0,
  _conta_financeira_id UUID DEFAULT NULL,
  _data DATE DEFAULT CURRENT_DATE,
  _incluir_multa_juros BOOLEAN DEFAULT true,
  _observacoes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _irmao_id UUID;
  _n_irmaos INT;
  _plano_conta_banco UUID;
  _receber_id UUID;
  _multas_juros_id UUID;
  _parcelamento_id UUID;
  _soma_original NUMERIC := 0;
  _soma_multa NUMERIC := 0;
  _soma_juros NUMERIC := 0;
  _valor_parcelado NUMERIC;
  _itens JSONB;
  _valor_parcela NUMERIC;
  _acumulado NUMERIC := 0;
  _desc TEXT;
  r RECORD;
  _calc RECORD;
  i INT;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _lancamento_ids IS NULL OR array_length(_lancamento_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos uma fatura';
  END IF;
  IF _numero_parcelas IS NULL OR _numero_parcelas <= 0 THEN
    RAISE EXCEPTION 'Número de parcelas deve ser maior que zero';
  END IF;

  SELECT count(DISTINCT irmao_id) INTO _n_irmaos FROM public.lancamentos WHERE id = ANY(_lancamento_ids);
  IF _n_irmaos <> 1 THEN
    RAISE EXCEPTION 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;
  SELECT irmao_id INTO _irmao_id FROM public.lancamentos WHERE id = _lancamento_ids[1];

  IF EXISTS (SELECT 1 FROM public.lancamentos WHERE id = ANY(_lancamento_ids) AND (tipo <> 'entrada' OR pago)) THEN
    RAISE EXCEPTION 'Alguma fatura selecionada já está paga ou não é uma fatura em aberto';
  END IF;

  IF COALESCE(_entrada, 0) > 0 THEN
    IF _conta_financeira_id IS NULL THEN
      RAISE EXCEPTION 'Informe a conta que recebeu a entrada';
    END IF;
    SELECT plano_conta_id INTO _plano_conta_banco FROM public.contas_financeiras WHERE id = _conta_financeira_id;
    IF _plano_conta_banco IS NULL THEN
      RAISE EXCEPTION 'A conta bancária/caixa selecionada não tem uma conta do plano de contas vinculada';
    END IF;
  END IF;

  SELECT id INTO _receber_id FROM public.plano_contas WHERE codigo = '1.1.02';
  SELECT id INTO _multas_juros_id FROM public.plano_contas WHERE codigo = '4.1.06';

  FOR r IN SELECT * FROM public.lancamentos WHERE id = ANY(_lancamento_ids) LOOP
    SELECT * INTO _calc FROM public.calcular_multa_juros(r.valor, r.data_vencimento, _data);
    _soma_original := _soma_original + r.valor;
    IF _incluir_multa_juros THEN
      _soma_multa := _soma_multa + _calc.multa;
      _soma_juros := _soma_juros + _calc.juros;
    END IF;
  END LOOP;

  _valor_parcelado := _soma_original + _soma_multa + _soma_juros - COALESCE(_entrada, 0);
  IF _valor_parcelado < 0 THEN
    RAISE EXCEPTION 'Entrada maior que o valor total a parcelar';
  END IF;

  INSERT INTO public.parcelamentos (
    irmao_id, data, valor_original, valor_multa, valor_juros, entrada,
    valor_parcelado, numero_parcelas, observacoes, created_by
  ) VALUES (
    _irmao_id, _data, _soma_original, _soma_multa, _soma_juros, COALESCE(_entrada, 0),
    _valor_parcelado, _numero_parcelas, _observacoes, auth.uid()
  ) RETURNING id INTO _parcelamento_id;

  -- encerra as faturas antigas (sem gerar recibo — não houve caixa nelas)
  UPDATE public.lancamentos
  SET pago = true, parcelado = true, parcelamento_id = _parcelamento_id, data_pagamento = _data
  WHERE id = ANY(_lancamento_ids);

  -- fatura de entrada, já paga
  IF COALESCE(_entrada, 0) > 0 THEN
    INSERT INTO public.lancamentos (
      data, data_vencimento, descricao, valor, tipo, irmao_id,
      pago, data_pagamento, conta_id, forma_pagamento, parcelamento_id, is_mensalidade
    ) VALUES (
      _data, _data, 'Entrada — acordo de parcelamento', _entrada, 'entrada', _irmao_id,
      true, _data, _conta_financeira_id, 'entrada_parcelamento', _parcelamento_id, false
    );
  END IF;

  -- parcelas, a última absorve o resíduo de arredondamento
  FOR i IN 1.._numero_parcelas LOOP
    IF i = _numero_parcelas THEN
      _valor_parcela := _valor_parcelado - _acumulado;
    ELSE
      _valor_parcela := round(_valor_parcelado / _numero_parcelas, 2);
      _acumulado := _acumulado + _valor_parcela;
    END IF;
    _desc := 'Parcela ' || i || '/' || _numero_parcelas || ' — Acordo ' || to_char(_data, 'DD/MM/YYYY');

    INSERT INTO public.lancamentos (
      data, data_vencimento, descricao, valor, tipo, irmao_id,
      pago, parcelamento_id, is_mensalidade
    ) VALUES (
      _data, (_data + (i || ' months')::interval)::date, _desc, _valor_parcela, 'entrada', _irmao_id,
      false, _parcelamento_id, false
    );
  END LOOP;

  -- reclassificação contábil única
  _itens := jsonb_build_array(jsonb_build_object('conta_id', _receber_id, 'tipo', 'debito', 'valor', _valor_parcelado));
  IF COALESCE(_entrada, 0) > 0 THEN
    _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _plano_conta_banco, 'tipo', 'debito', 'valor', _entrada));
  END IF;
  _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _receber_id, 'tipo', 'credito', 'valor', _soma_original));
  IF (_soma_multa + _soma_juros) > 0 THEN
    _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _multas_juros_id, 'tipo', 'credito', 'valor', _soma_multa + _soma_juros));
  END IF;

  PERFORM public.registrar_lancamento_contabil(
    _data, date_trunc('month', _data)::date,
    'Parcelamento de faturas em atraso', _itens, 'parcelamento', _parcelamento_id
  );

  RETURN _parcelamento_id;
END; $$;

REVOKE ALL ON FUNCTION public.criar_parcelamento(UUID[], INTEGER, NUMERIC, UUID, DATE, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_parcelamento(UUID[], INTEGER, NUMERIC, UUID, DATE, BOOLEAN, TEXT) TO authenticated;
