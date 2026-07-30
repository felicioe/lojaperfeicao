-- =========================================
-- Contas a pagar — issue #7
-- =========================================

-- Toda conta bancária/caixa precisa de uma conta analítica do plano de
-- contas vinculada antes de poder receber lançamento contábil — mesma
-- regra do sistema legado (_planoBancoObrigatorio no app.js), agora
-- aplicada via guarda-corpo no momento da baixa (função abaixo).
ALTER TABLE public.contas_financeiras
  ADD COLUMN IF NOT EXISTS plano_conta_id UUID REFERENCES public.plano_contas(id) ON DELETE RESTRICT;

UPDATE public.contas_financeiras cf SET plano_conta_id = pc.id
  FROM public.plano_contas pc WHERE pc.codigo = '1.1.01' AND cf.plano_conta_id IS NULL;

-- Vínculo com o fornecedor/credor (issue #6). Nulo = despesa avulsa sem
-- terceiro específico.
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS terceiro_id UUID REFERENCES public.terceiros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
CREATE INDEX IF NOT EXISTS lancamentos_terceiro_id_idx ON public.lancamentos (terceiro_id);

-- =========================================
-- RPC: cria uma conta a pagar e já posta a provisão contábil
-- (D despesa / C Contas a Pagar) na mesma transação — evita o cenário de
-- "lançamento operacional criado mas sem contrapartida contábil" que
-- aconteceria se o client fizesse as duas chamadas separadamente.
-- =========================================
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

-- =========================================
-- RPC: baixa (paga) uma conta a pagar e posta D Contas a Pagar / C conta
-- bancária escolhida. Exige que a conta bancária tenha plano_conta_id
-- vinculado (guarda-corpo herdado do sistema legado).
-- =========================================
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
