-- =========================================
-- Importação OFX e conciliação bancária — issue #13
-- =========================================
CREATE TABLE public.ofx_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_financeira_id UUID NOT NULL REFERENCES public.contas_financeiras(id) ON DELETE CASCADE,
  fitid TEXT,
  data DATE NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  tipo_ofx TEXT,
  descricao TEXT,
  chave_dedupe TEXT NOT NULL,
  conciliado BOOLEAN NOT NULL DEFAULT false,
  lancamento_id UUID REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  importado_por UUID REFERENCES auth.users(id),
  UNIQUE (conta_financeira_id, chave_dedupe)
);
CREATE INDEX ON public.ofx_lancamentos (conta_financeira_id, conciliado);
GRANT SELECT ON public.ofx_lancamentos TO authenticated;
GRANT ALL ON public.ofx_lancamentos TO service_role;
ALTER TABLE public.ofx_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ofx_lancamentos_select" ON public.ofx_lancamentos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));
-- Sem policy de escrita: a importação roda via edge function com service
-- role; a conciliação/criação de lançamento roda via RPC abaixo.

-- =========================================
-- RPC: concilia uma linha OFX contra um lançamento já existente no
-- sistema (só vincula/rastreia — não reprocessa baixa nem contabilidade;
-- isso já é responsabilidade das RPCs de baixa das issues #7/#10).
-- =========================================
CREATE OR REPLACE FUNCTION public.conciliar_ofx_existente(
  _ofx_id UUID,
  _lancamento_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ofx_lancamentos WHERE id = _ofx_id AND NOT conciliado) THEN
    RAISE EXCEPTION 'Linha OFX não encontrada ou já conciliada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE id = _lancamento_id) THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  UPDATE public.ofx_lancamentos SET conciliado = true, lancamento_id = _lancamento_id WHERE id = _ofx_id;
END; $$;

REVOKE ALL ON FUNCTION public.conciliar_ofx_existente(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conciliar_ofx_existente(UUID, UUID) TO authenticated;

-- =========================================
-- RPC: cria um lançamento avulso a partir de uma linha OFX não
-- reconciliada (crédito vira recebimento avulso, débito vira pagamento
-- avulso) e já a marca como conciliada.
-- =========================================
CREATE OR REPLACE FUNCTION public.criar_lancamento_de_ofx(
  _ofx_id UUID,
  _plano_conta_id UUID,
  _categoria public.categoria_recebimento DEFAULT 'outros',
  _irmao_id UUID DEFAULT NULL,
  _terceiro_id UUID DEFAULT NULL,
  _descricao TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ofx RECORD;
  _plano_conta_banco UUID;
  _lanc_id UUID;
  _desc TEXT;
  _valor_abs NUMERIC;
  _tipo public.tipo_lancamento;
  _itens JSONB;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO _ofx FROM public.ofx_lancamentos WHERE id = _ofx_id AND NOT conciliado;
  IF _ofx.id IS NULL THEN
    RAISE EXCEPTION 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT plano_conta_id INTO _plano_conta_banco FROM public.contas_financeiras WHERE id = _ofx.conta_financeira_id;
  IF _plano_conta_banco IS NULL THEN
    RAISE EXCEPTION 'A conta bancária do extrato não tem uma conta do plano de contas vinculada';
  END IF;

  _valor_abs := abs(_ofx.valor);
  _tipo := CASE WHEN _ofx.valor >= 0 THEN 'entrada' ELSE 'saida' END;
  _desc := COALESCE(_descricao, _ofx.descricao, 'Lançamento importado do extrato');

  INSERT INTO public.lancamentos (
    data, data_pagamento, descricao, valor, tipo, conta_id, plano_conta_id,
    irmao_id, terceiro_id, categoria_recebimento, pago, created_by
  ) VALUES (
    _ofx.data, _ofx.data, _desc, _valor_abs, _tipo, _ofx.conta_financeira_id, _plano_conta_id,
    _irmao_id, _terceiro_id, CASE WHEN _tipo = 'entrada' THEN _categoria ELSE NULL END, true, auth.uid()
  ) RETURNING id INTO _lanc_id;

  IF _tipo = 'entrada' THEN
    _itens := jsonb_build_array(
      jsonb_build_object('conta_id', _plano_conta_banco, 'tipo', 'debito', 'valor', _valor_abs),
      jsonb_build_object('conta_id', _plano_conta_id, 'tipo', 'credito', 'valor', _valor_abs)
    );
  ELSE
    _itens := jsonb_build_array(
      jsonb_build_object('conta_id', _plano_conta_id, 'tipo', 'debito', 'valor', _valor_abs),
      jsonb_build_object('conta_id', _plano_conta_banco, 'tipo', 'credito', 'valor', _valor_abs)
    );
  END IF;

  PERFORM public.registrar_lancamento_contabil(
    _ofx.data, date_trunc('month', _ofx.data)::date, _desc, _itens, 'ofx_importado', _lanc_id
  );

  UPDATE public.ofx_lancamentos SET conciliado = true, lancamento_id = _lanc_id WHERE id = _ofx_id;

  RETURN _lanc_id;
END; $$;

REVOKE ALL ON FUNCTION public.criar_lancamento_de_ofx(UUID, UUID, public.categoria_recebimento, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_lancamento_de_ofx(UUID, UUID, public.categoria_recebimento, UUID, UUID, TEXT) TO authenticated;
