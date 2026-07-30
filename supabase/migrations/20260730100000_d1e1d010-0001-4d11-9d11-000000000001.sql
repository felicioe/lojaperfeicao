-- =========================================
-- Recibos e baixa de faturas (multa/juros, agrupamento) — issue #10
-- =========================================

-- Contas de receita/despesa que a baixa pode precisar (só existem 4.1.01-03
-- e 5.1.01-05 até aqui — cf. issues #1/#2).
INSERT INTO public.plano_contas (codigo, nome, tipo, analitica, parent_id)
SELECT '4.1.06', 'Multas e Juros Recebidos', 'receita', true, id FROM public.plano_contas WHERE codigo = '4'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.plano_contas (codigo, nome, tipo, analitica, parent_id)
SELECT '5.1.06', 'Descontos Concedidos', 'despesa', true, id FROM public.plano_contas WHERE codigo = '5'
ON CONFLICT (codigo) DO NOTHING;

-- =========================================
-- Parâmetros financeiros (singleton) — escopo mínimo necessário para o
-- motor de multa/juros desta issue. A tela completa de "Parâmetros" do
-- sistema legado (PIX, SMS etc.) fica para uma issue futura; aqui só o
-- que a baixa de faturas precisa.
-- =========================================
CREATE TABLE public.parametros_financeiros (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  multa_ativa BOOLEAN NOT NULL DEFAULT true,
  multa_percentual NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  juros_ativo BOOLEAN NOT NULL DEFAULT true,
  juros_diario_percentual NUMERIC(6,4) NOT NULL DEFAULT 0.0330,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.parametros_financeiros (id) VALUES (true);
GRANT SELECT ON public.parametros_financeiros TO authenticated;
GRANT ALL ON public.parametros_financeiros TO service_role;
ALTER TABLE public.parametros_financeiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parametros_financeiros_select" ON public.parametros_financeiros FOR SELECT TO authenticated USING (true);
CREATE POLICY "parametros_financeiros_write" ON public.parametros_financeiros FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));

CREATE TRIGGER trg_parametros_financeiros_updated BEFORE UPDATE ON public.parametros_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- Função de cálculo de multa/juros — mesma fórmula do sistema legado
-- (calcMulJur): multa percentual fixa sobre o valor + juros diário simples
-- sobre os dias de atraso, ambos com toggle independente.
-- =========================================
CREATE OR REPLACE FUNCTION public.calcular_multa_juros(
  _valor NUMERIC,
  _vencimento DATE,
  _data_referencia DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (multa NUMERIC, juros NUMERIC, dias_atraso INTEGER, total NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _p RECORD;
  _dias INT;
  _multa NUMERIC := 0;
  _juros NUMERIC := 0;
BEGIN
  SELECT * INTO _p FROM public.parametros_financeiros LIMIT 1;
  _dias := GREATEST(0, (_data_referencia - _vencimento));
  IF _dias > 0 THEN
    IF _p.multa_ativa THEN _multa := round(_valor * _p.multa_percentual / 100, 2); END IF;
    IF _p.juros_ativo THEN _juros := round(_valor * _p.juros_diario_percentual / 100 * _dias, 2); END IF;
  END IF;
  RETURN QUERY SELECT _multa, _juros, _dias, _valor + _multa + _juros;
END; $$;

REVOKE ALL ON FUNCTION public.calcular_multa_juros(NUMERIC, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_multa_juros(NUMERIC, DATE, DATE) TO authenticated;

-- =========================================
-- Recibos (cabeçalho da baixa — pode agrupar várias faturas do mesmo
-- irmão) e recibo_itens (detalhamento por fatura, para auditoria).
-- =========================================
CREATE TABLE public.recibos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irmao_id UUID NOT NULL REFERENCES public.irmaos(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  valor_original NUMERIC(14,2) NOT NULL,
  valor_multa NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_juros NUMERIC(14,2) NOT NULL DEFAULT 0,
  desconto NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(14,2) NOT NULL,
  forma_pagamento TEXT,
  conta_financeira_id UUID REFERENCES public.contas_financeiras(id),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
CREATE INDEX ON public.recibos (irmao_id);
GRANT SELECT ON public.recibos TO authenticated;
GRANT ALL ON public.recibos TO service_role;
ALTER TABLE public.recibos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recibos_select" ON public.recibos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'tesoureiro')
    OR public.has_role(auth.uid(), 'secretario')
    OR EXISTS (SELECT 1 FROM public.irmaos i WHERE i.id = recibos.irmao_id AND i.user_id = auth.uid())
  );
-- Sem policy de INSERT/UPDATE/DELETE: só a RPC baixar_faturas (SECURITY
-- DEFINER) escreve aqui, igual ao padrão de lancamentos_contabeis (#1).

CREATE TABLE public.recibo_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recibo_id UUID NOT NULL REFERENCES public.recibos(id) ON DELETE CASCADE,
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos(id) ON DELETE RESTRICT,
  valor_original NUMERIC(14,2) NOT NULL,
  valor_multa NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_juros NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX ON public.recibo_itens (recibo_id);
GRANT SELECT ON public.recibo_itens TO authenticated;
GRANT ALL ON public.recibo_itens TO service_role;
ALTER TABLE public.recibo_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recibo_itens_select" ON public.recibo_itens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recibos r WHERE r.id = recibo_itens.recibo_id AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'tesoureiro')
      OR public.has_role(auth.uid(), 'secretario')
      OR EXISTS (SELECT 1 FROM public.irmaos i WHERE i.id = r.irmao_id AND i.user_id = auth.uid())
    )
  ));

ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS recibo_id UUID REFERENCES public.recibos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS lancamentos_recibo_id_idx ON public.lancamentos (recibo_id);

-- =========================================
-- RPC: baixa agrupada de faturas. Todas as faturas selecionadas precisam
-- ser do mesmo irmão e estar em aberto. Calcula multa/juros fatura a
-- fatura (vencimentos podem ser diferentes), soma tudo num único recibo,
-- e posta um único lançamento contábil balanceado:
--   D conta bancária (valor líquido recebido)
--   D Descontos Concedidos (se houve desconto)
--   C Contas a Receber (soma dos valores originais das faturas)
--   C Multas e Juros Recebidos (soma de multa+juros, se houver)
-- =========================================
CREATE OR REPLACE FUNCTION public.baixar_faturas(
  _lancamento_ids UUID[],
  _conta_financeira_id UUID,
  _forma_pagamento TEXT DEFAULT NULL,
  _data_pagamento DATE DEFAULT CURRENT_DATE,
  _desconto NUMERIC DEFAULT 0,
  _observacoes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _irmao_id UUID;
  _n_irmaos INT;
  _plano_conta_banco UUID;
  _receber_id UUID;
  _multas_juros_id UUID;
  _descontos_id UUID;
  _recibo_id UUID;
  _soma_original NUMERIC := 0;
  _soma_multa NUMERIC := 0;
  _soma_juros NUMERIC := 0;
  _total NUMERIC;
  _itens JSONB;
  r RECORD;
  _calc RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _lancamento_ids IS NULL OR array_length(_lancamento_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos uma fatura';
  END IF;

  SELECT count(DISTINCT irmao_id) INTO _n_irmaos FROM public.lancamentos WHERE id = ANY(_lancamento_ids);
  IF _n_irmaos <> 1 THEN
    RAISE EXCEPTION 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;
  SELECT irmao_id INTO _irmao_id FROM public.lancamentos WHERE id = _lancamento_ids[1];

  IF EXISTS (SELECT 1 FROM public.lancamentos WHERE id = ANY(_lancamento_ids) AND (tipo <> 'entrada' OR pago)) THEN
    RAISE EXCEPTION 'Alguma fatura selecionada já está paga ou não é uma fatura em aberto';
  END IF;

  SELECT plano_conta_id INTO _plano_conta_banco FROM public.contas_financeiras WHERE id = _conta_financeira_id;
  IF _plano_conta_banco IS NULL THEN
    RAISE EXCEPTION 'A conta bancária/caixa selecionada não tem uma conta do plano de contas vinculada';
  END IF;

  SELECT id INTO _receber_id FROM public.plano_contas WHERE codigo = '1.1.02';
  SELECT id INTO _multas_juros_id FROM public.plano_contas WHERE codigo = '4.1.06';
  SELECT id INTO _descontos_id FROM public.plano_contas WHERE codigo = '5.1.06';

  FOR r IN SELECT * FROM public.lancamentos WHERE id = ANY(_lancamento_ids) LOOP
    SELECT * INTO _calc FROM public.calcular_multa_juros(r.valor, r.data_vencimento, _data_pagamento);
    _soma_original := _soma_original + r.valor;
    _soma_multa := _soma_multa + _calc.multa;
    _soma_juros := _soma_juros + _calc.juros;
  END LOOP;

  _total := _soma_original + _soma_multa + _soma_juros - COALESCE(_desconto, 0);
  IF _total < 0 THEN
    RAISE EXCEPTION 'Desconto maior que o valor total da baixa';
  END IF;

  INSERT INTO public.recibos (
    irmao_id, data, valor_original, valor_multa, valor_juros, desconto,
    valor_total, forma_pagamento, conta_financeira_id, observacoes, created_by
  ) VALUES (
    _irmao_id, _data_pagamento, _soma_original, _soma_multa, _soma_juros, COALESCE(_desconto, 0),
    _total, _forma_pagamento, _conta_financeira_id, _observacoes, auth.uid()
  ) RETURNING id INTO _recibo_id;

  FOR r IN SELECT * FROM public.lancamentos WHERE id = ANY(_lancamento_ids) LOOP
    SELECT * INTO _calc FROM public.calcular_multa_juros(r.valor, r.data_vencimento, _data_pagamento);

    INSERT INTO public.recibo_itens (recibo_id, lancamento_id, valor_original, valor_multa, valor_juros)
    VALUES (_recibo_id, r.id, r.valor, _calc.multa, _calc.juros);

    UPDATE public.lancamentos
    SET pago = true, data_pagamento = _data_pagamento, conta_id = _conta_financeira_id,
        forma_pagamento = _forma_pagamento, recibo_id = _recibo_id
    WHERE id = r.id;
  END LOOP;

  _itens := jsonb_build_array(jsonb_build_object('conta_id', _plano_conta_banco, 'tipo', 'debito', 'valor', _total));
  IF COALESCE(_desconto, 0) > 0 THEN
    _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _descontos_id, 'tipo', 'debito', 'valor', _desconto));
  END IF;
  _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _receber_id, 'tipo', 'credito', 'valor', _soma_original));
  IF (_soma_multa + _soma_juros) > 0 THEN
    _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _multas_juros_id, 'tipo', 'credito', 'valor', _soma_multa + _soma_juros));
  END IF;

  PERFORM public.registrar_lancamento_contabil(
    _data_pagamento, date_trunc('month', _data_pagamento)::date,
    'Recibo (baixa de fatura)', _itens, 'recibo_baixa', _recibo_id
  );

  RETURN _recibo_id;
END; $$;

REVOKE ALL ON FUNCTION public.baixar_faturas(UUID[], UUID, TEXT, DATE, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.baixar_faturas(UUID[], UUID, TEXT, DATE, NUMERIC, TEXT) TO authenticated;
