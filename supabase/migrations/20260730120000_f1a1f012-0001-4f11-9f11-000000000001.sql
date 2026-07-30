-- =========================================
-- Recebimentos unificados e transferências — issue #12
--
-- Neste projeto (diferente do sistema legado) os recebimentos sempre
-- viveram numa única tabela (lancamentos) — nunca houve a duplicação em
-- três fontes que o PHP tinha (movimentos/banco/espelhos de fatura). O
-- que faltava era: (1) uma dimensão explícita de categoria para
-- distinguir mensalidade/taxa/tronco/doação/outros sem depender só do
-- plano de contas escolhido, (2) um jeito de registrar um recebimento
-- avulso (doação, tronco) que não é uma fatura cobrada antecipadamente,
-- e (3) a transferência entre contas não postava nenhuma contrapartida
-- contábil — só criava o registro operacional.
-- =========================================
CREATE TYPE public.categoria_recebimento AS ENUM ('mensalidade', 'taxa_grau', 'tronco', 'doacao', 'outros');

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS categoria_recebimento public.categoria_recebimento;
UPDATE public.lancamentos SET categoria_recebimento = 'mensalidade' WHERE is_mensalidade AND categoria_recebimento IS NULL;
UPDATE public.lancamentos SET categoria_recebimento = 'outros' WHERE tipo = 'entrada' AND categoria_recebimento IS NULL;
CREATE INDEX IF NOT EXISTS lancamentos_categoria_recebimento_idx ON public.lancamentos (categoria_recebimento);

-- =========================================
-- RPC: recebimento avulso (doação, tronco de beneficência, taxa etc.) —
-- ao contrário de uma fatura, já nasce pago (dinheiro já recebido), sem
-- provisão prévia: D conta bancária / C conta de receita, direto.
-- =========================================
CREATE OR REPLACE FUNCTION public.registrar_recebimento_avulso(
  _valor NUMERIC,
  _categoria public.categoria_recebimento,
  _plano_conta_id UUID,
  _conta_financeira_id UUID,
  _data DATE DEFAULT CURRENT_DATE,
  _forma_pagamento TEXT DEFAULT NULL,
  _irmao_id UUID DEFAULT NULL,
  _terceiro_id UUID DEFAULT NULL,
  _descricao TEXT DEFAULT NULL,
  _observacoes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lanc_id UUID;
  _plano_conta_banco UUID;
  _desc TEXT;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _valor IS NULL OR _valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;

  SELECT plano_conta_id INTO _plano_conta_banco FROM public.contas_financeiras WHERE id = _conta_financeira_id;
  IF _plano_conta_banco IS NULL THEN
    RAISE EXCEPTION 'A conta bancária/caixa selecionada não tem uma conta do plano de contas vinculada';
  END IF;

  _desc := COALESCE(_descricao, initcap(replace(_categoria::text, '_', ' ')));

  INSERT INTO public.lancamentos (
    data, data_pagamento, descricao, valor, tipo, conta_id, plano_conta_id,
    irmao_id, terceiro_id, categoria_recebimento, pago, forma_pagamento, observacoes, created_by
  ) VALUES (
    _data, _data, _desc, _valor, 'entrada', _conta_financeira_id, _plano_conta_id,
    _irmao_id, _terceiro_id, _categoria, true, _forma_pagamento, _observacoes, auth.uid()
  ) RETURNING id INTO _lanc_id;

  PERFORM public.registrar_lancamento_contabil(
    _data, date_trunc('month', _data)::date, _desc,
    jsonb_build_array(
      jsonb_build_object('conta_id', _plano_conta_banco, 'tipo', 'debito', 'valor', _valor),
      jsonb_build_object('conta_id', _plano_conta_id, 'tipo', 'credito', 'valor', _valor)
    ),
    'recebimento_avulso', _lanc_id
  );

  RETURN _lanc_id;
END; $$;

REVOKE ALL ON FUNCTION public.registrar_recebimento_avulso(NUMERIC, public.categoria_recebimento, UUID, UUID, DATE, TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recebimento_avulso(NUMERIC, public.categoria_recebimento, UUID, UUID, DATE, TEXT, UUID, UUID, TEXT, TEXT) TO authenticated;

-- =========================================
-- RPC: transferência entre contas com contrapartida contábil (a versão
-- anterior, no client, só criava o registro operacional em lancamentos
-- sem postar nada em lancamentos_contabeis).
-- =========================================
CREATE OR REPLACE FUNCTION public.criar_transferencia(
  _conta_origem_id UUID,
  _conta_destino_id UUID,
  _valor NUMERIC,
  _data DATE DEFAULT CURRENT_DATE,
  _descricao TEXT DEFAULT 'Transferência entre contas'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lanc_id UUID;
  _plano_origem UUID;
  _plano_destino UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _valor IS NULL OR _valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;
  IF _conta_origem_id = _conta_destino_id THEN
    RAISE EXCEPTION 'Conta de origem e destino devem ser diferentes';
  END IF;

  SELECT plano_conta_id INTO _plano_origem FROM public.contas_financeiras WHERE id = _conta_origem_id;
  SELECT plano_conta_id INTO _plano_destino FROM public.contas_financeiras WHERE id = _conta_destino_id;
  IF _plano_origem IS NULL OR _plano_destino IS NULL THEN
    RAISE EXCEPTION 'Ambas as contas precisam ter uma conta do plano de contas vinculada';
  END IF;

  INSERT INTO public.lancamentos (
    data, data_pagamento, descricao, valor, tipo, conta_id, conta_destino_id, pago, created_by
  ) VALUES (
    _data, _data, _descricao, _valor, 'transferencia', _conta_origem_id, _conta_destino_id, true, auth.uid()
  ) RETURNING id INTO _lanc_id;

  PERFORM public.registrar_lancamento_contabil(
    _data, date_trunc('month', _data)::date, _descricao,
    jsonb_build_array(
      jsonb_build_object('conta_id', _plano_destino, 'tipo', 'debito', 'valor', _valor),
      jsonb_build_object('conta_id', _plano_origem, 'tipo', 'credito', 'valor', _valor)
    ),
    'transferencia', _lanc_id
  );

  RETURN _lanc_id;
END; $$;

REVOKE ALL ON FUNCTION public.criar_transferencia(UUID, UUID, NUMERIC, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_transferencia(UUID, UUID, NUMERIC, DATE, TEXT) TO authenticated;
