-- =========================================
-- Faturas/mensalidades — issue #9
-- =========================================

-- Helper interno (não exposto ao client): monta e posta a provisão
-- contábil de uma fatura — D Contas a Receber (1.1.02) / C receita, com
-- suporte a rateio percentual entre contas de receita. A última linha do
-- rateio absorve o resíduo de arredondamento, garantindo que a soma das
-- linhas de crédito bata exatamente com o débito (senão o trigger de
-- balanceamento da issue #1 rejeitaria o lançamento).
CREATE OR REPLACE FUNCTION public._postar_provisao_fatura(
  _lancamento_id UUID,
  _valor NUMERIC,
  _data DATE,
  _competencia DATE,
  _descricao TEXT,
  _rateio JSONB
) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _receber_id UUID;
  _mensalidades_id UUID;
  _itens JSONB;
  _item JSONB;
  _soma_pct NUMERIC := 0;
  _acumulado NUMERIC := 0;
  _valor_linha NUMERIC;
  _n INT;
  _i INT := 0;
BEGIN
  SELECT id INTO _receber_id FROM public.plano_contas WHERE codigo = '1.1.02';
  IF _receber_id IS NULL THEN
    RAISE EXCEPTION 'Conta "Contas a Receber" (1.1.02) não encontrada no plano de contas';
  END IF;
  _itens := jsonb_build_array(jsonb_build_object('conta_id', _receber_id, 'tipo', 'debito', 'valor', _valor));

  IF _rateio IS NOT NULL AND jsonb_array_length(_rateio) > 0 THEN
    _n := jsonb_array_length(_rateio);
    FOR _item IN SELECT * FROM jsonb_array_elements(_rateio) LOOP
      _i := _i + 1;
      _soma_pct := _soma_pct + (_item->>'percentual')::numeric;
      IF _i = _n THEN
        _valor_linha := _valor - _acumulado;
      ELSE
        _valor_linha := round(_valor * (_item->>'percentual')::numeric / 100, 2);
        _acumulado := _acumulado + _valor_linha;
      END IF;
      _itens := _itens || jsonb_build_array(jsonb_build_object(
        'conta_id', (_item->>'conta_id')::uuid, 'tipo', 'credito', 'valor', _valor_linha
      ));
    END LOOP;
    IF abs(_soma_pct - 100) > 0.01 THEN
      RAISE EXCEPTION 'Rateio deve somar 100%%, soma informada: %', _soma_pct;
    END IF;
  ELSE
    SELECT id INTO _mensalidades_id FROM public.plano_contas WHERE codigo = '4.1.01';
    _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _mensalidades_id, 'tipo', 'credito', 'valor', _valor));
  END IF;

  PERFORM public.registrar_lancamento_contabil(_data, _competencia, _descricao, _itens, 'fatura_provisao', _lancamento_id);
END; $$;

REVOKE ALL ON FUNCTION public._postar_provisao_fatura(UUID, NUMERIC, DATE, DATE, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- =========================================
-- RPC: fatura avulsa individual (valor/descrição arbitrários — ex.: taxa
-- extra, evento cobrado à parte da mensalidade padrão do irmão).
-- =========================================
CREATE OR REPLACE FUNCTION public.criar_fatura_avulsa(
  _irmao_id UUID,
  _valor NUMERIC,
  _competencia_mes DATE,
  _data_vencimento DATE,
  _descricao TEXT DEFAULT NULL,
  _rateio JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lanc_id UUID;
  _desc TEXT;
  _comp DATE := date_trunc('month', _competencia_mes)::date;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _valor IS NULL OR _valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;
  _desc := COALESCE(_descricao, 'Fatura ' || to_char(_competencia_mes, 'MM/YYYY'));

  INSERT INTO public.lancamentos (
    data, data_vencimento, descricao, valor, tipo, irmao_id, plano_conta_id,
    pago, is_mensalidade, competencia_mes, created_by
  ) VALUES (
    CURRENT_DATE, _data_vencimento, _desc, _valor, 'entrada', _irmao_id,
    (SELECT id FROM public.plano_contas WHERE codigo = '4.1.01'),
    false, true, _comp, auth.uid()
  ) RETURNING id INTO _lanc_id;

  PERFORM public._postar_provisao_fatura(_lanc_id, _valor, CURRENT_DATE, _comp, _desc, _rateio);

  RETURN _lanc_id;
END; $$;

REVOKE ALL ON FUNCTION public.criar_fatura_avulsa(UUID, NUMERIC, DATE, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_fatura_avulsa(UUID, NUMERIC, DATE, DATE, TEXT, JSONB) TO authenticated;

-- =========================================
-- RPC: gerar_mensalidades em lote — evoluída para aceitar vencimento
-- customizado, escopo de um único irmão (emissão "individual" reusando a
-- mesma regra de geração) e rateio, e para postar a provisão contábil
-- (a versão original, da migration inicial do projeto, criava só o
-- lançamento operacional, sem contrapartida contábil — não existia motor
-- de dupla entrada ainda). Precisa de DROP porque muda a assinatura (não
-- dá para usar CREATE OR REPLACE com mais parâmetros sem ambiguidade de
-- overload quando chamada só com _competencia).
--
-- Removido também o preenchimento antecipado de conta_id (conta bancária)
-- que a versão original fazia na criação da fatura — não faz sentido
-- atribuir qual conta recebeu algo que ainda não foi pago; isso passa a
-- ser definido na baixa (issue #10), no mesmo padrão já usado em
-- baixar_conta_pagar (issue #7).
-- =========================================
DROP FUNCTION IF EXISTS public.gerar_mensalidades(DATE);

CREATE FUNCTION public.gerar_mensalidades(
  _competencia DATE,
  _data_vencimento DATE DEFAULT NULL,
  _irmao_id UUID DEFAULT NULL,
  _rateio JSONB DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plano UUID;
  _venc DATE;
  _comp DATE := date_trunc('month', _competencia)::date;
  _desc TEXT := 'Mensalidade ' || to_char(_competencia, 'MM/YYYY');
  _count INTEGER := 0;
  _lanc_id UUID;
  r RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT id INTO _plano FROM public.plano_contas WHERE codigo = '4.1.01';
  IF _plano IS NULL THEN
    RAISE EXCEPTION 'Conta "Mensalidades" (4.1.01) não encontrada no plano de contas';
  END IF;
  _venc := COALESCE(_data_vencimento, (_comp + INTERVAL '9 days')::date);

  FOR r IN
    SELECT id, valor_mensalidade FROM public.irmaos
    WHERE situacao IN ('ativo', 'quite', 'irregular') AND valor_mensalidade > 0
      AND (_irmao_id IS NULL OR id = _irmao_id)
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.lancamentos WHERE is_mensalidade AND irmao_id = r.id AND competencia_mes = _comp
    );

    INSERT INTO public.lancamentos (
      data, data_vencimento, descricao, valor, tipo, plano_conta_id,
      irmao_id, pago, is_mensalidade, competencia_mes, created_by
    ) VALUES (
      CURRENT_DATE, _venc, _desc, r.valor_mensalidade, 'entrada', _plano,
      r.id, false, true, _comp, auth.uid()
    ) RETURNING id INTO _lanc_id;

    PERFORM public._postar_provisao_fatura(_lanc_id, r.valor_mensalidade, CURRENT_DATE, _comp, _desc, _rateio);

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END; $$;

REVOKE ALL ON FUNCTION public.gerar_mensalidades(DATE, DATE, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_mensalidades(DATE, DATE, UUID, JSONB) TO authenticated;
