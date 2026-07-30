-- =========================================
-- Ajuste em registrar_lancamento_contabil (issue #1) para suportar o job
-- de recorrências (issue #8): permite contexto de sistema (pg_cron
-- rodando SQL direto, sem passar pelo PostgREST) além de admin/tesoureiro
-- autenticado. Seguro porque EXECUTE nunca foi concedido a "anon" — só a
-- "authenticated" — então auth.uid() só é NULL aqui quando a chamada não
-- veio de uma requisição pública via API (é pg_cron ou service role).
-- Descoberto testando localmente: sem este ajuste, efetivar_recorrentes_
-- vencidas() falhava ao rodar em contexto de sistema porque esta função
-- (chamada por ela) ainda exigia auth.uid() válido incondicionalmente.
-- =========================================
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
