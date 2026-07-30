-- =========================================
-- Fechamento de exercício — issue #18
--
-- Achado importante ao analisar o legado: renderFechamento() no PHP é só
-- uma tela de listagem — não existe nenhuma rotina real de fechamento em
-- app.js (nem fecharAno nem equivalente). "fechamentos" era uma chave
-- persistida sem lógica de escrita por trás. Esta é, portanto, uma
-- funcionalidade construída do zero (não uma migração do legado):
--   - trava lançamentos com data <= data de corte de um exercício fechado;
--   - apura o resultado do exercício (receitas - despesas) e transporta o
--     saldo para "Lucros/Prejuízos Acumulados" (Patrimônio Líquido);
--   - permite reabertura auditada (admin), estornando o lançamento de
--     fechamento em vez de apagá-lo;
--   - mantém histórico completo (fechamentos_exercicio_eventos) mesmo
--     quando o mesmo exercício é fechado/reaberto mais de uma vez.
-- =========================================

INSERT INTO public.plano_contas (codigo, nome, tipo, analitica, parent_id)
SELECT '3.1.01', 'Lucros/Prejuízos Acumulados', 'patrimonio_liquido', true, id FROM public.plano_contas WHERE codigo = '3'
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE public.fechamentos_exercicio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercicio INTEGER NOT NULL UNIQUE CHECK (exercicio BETWEEN 2000 AND 2100),
  data_corte DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'fechado' CHECK (status IN ('fechado', 'reaberto')),
  lancamento_transporte_id UUID REFERENCES public.lancamentos_contabeis(id) ON DELETE SET NULL,
  resultado_apurado NUMERIC(14,2),
  fechado_por UUID REFERENCES auth.users(id),
  fechado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  reaberto_por UUID REFERENCES auth.users(id),
  reaberto_em TIMESTAMPTZ,
  motivo_reabertura TEXT,
  observacoes TEXT
);
GRANT SELECT ON public.fechamentos_exercicio TO authenticated;
GRANT ALL ON public.fechamentos_exercicio TO service_role;
ALTER TABLE public.fechamentos_exercicio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamentos_exercicio_select" ON public.fechamentos_exercicio FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));
-- Sem policy de INSERT/UPDATE: só as RPCs abaixo (SECURITY DEFINER) escrevem
-- aqui, mesmo padrão de orcamentos (#16).

CREATE TABLE public.fechamentos_exercicio_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id UUID NOT NULL REFERENCES public.fechamentos_exercicio(id) ON DELETE CASCADE,
  acao TEXT NOT NULL CHECK (acao IN ('fechamento', 'reabertura')),
  lancamento_id UUID REFERENCES public.lancamentos_contabeis(id) ON DELETE SET NULL,
  realizado_por UUID REFERENCES auth.users(id),
  realizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT
);
CREATE INDEX ON public.fechamentos_exercicio_eventos (fechamento_id);
GRANT SELECT ON public.fechamentos_exercicio_eventos TO authenticated;
GRANT ALL ON public.fechamentos_exercicio_eventos TO service_role;
ALTER TABLE public.fechamentos_exercicio_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamentos_exercicio_eventos_select" ON public.fechamentos_exercicio_eventos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro'));

-- =========================================
-- Trava: nenhum lançamento contábil pode ser registrado com data <= à
-- data de corte de um exercício ainda fechado. CREATE OR REPLACE em vez de
-- editar a migration original (#1/#8) — mesma técnica usada em #8 para não
-- reescrever histórico já aplicado.
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
  IF EXISTS (SELECT 1 FROM public.fechamentos_exercicio WHERE status = 'fechado' AND _data <= data_corte) THEN
    RAISE EXCEPTION 'Exercício encerrado para a data % — reabra o fechamento correspondente antes de lançar', _data;
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

-- =========================================
-- RPC: fecha o exercício. Apura o saldo de todas as contas analíticas de
-- receita/despesa (acumulado desde o início, já que um fechamento anterior
-- devidamente feito já zerou tudo antes do período atual) até a data de
-- corte, zera essas contas e transporta o resultado para "Lucros/Prejuízos
-- Acumulados". Se não houver nenhuma movimentação de receita/despesa,
-- fecha o exercício sem lançamento contábil (nada a apurar).
-- =========================================
CREATE OR REPLACE FUNCTION public.fechar_exercicio(_exercicio INTEGER, _data_corte DATE, _observacoes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _resultados_id UUID;
  _itens JSONB := '[]'::JSONB;
  _total_receita NUMERIC := 0;
  _total_despesa NUMERIC := 0;
  _resultado NUMERIC;
  _saldo NUMERIC;
  _lanc_id UUID;
  _fechamento_id UUID;
  r RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão — apenas admin fecha o exercício';
  END IF;
  IF EXTRACT(YEAR FROM _data_corte)::INTEGER <> _exercicio THEN
    RAISE EXCEPTION 'A data de corte % não pertence ao exercício %', _data_corte, _exercicio;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fechamentos_exercicio WHERE exercicio = _exercicio AND status = 'fechado') THEN
    RAISE EXCEPTION 'O exercício % já está fechado', _exercicio;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fechamentos_exercicio WHERE exercicio > _exercicio AND status = 'fechado') THEN
    RAISE EXCEPTION 'Existe um exercício mais recente já fechado — feche os exercícios em ordem cronológica';
  END IF;

  SELECT id INTO _resultados_id FROM public.plano_contas WHERE codigo = '3.1.01';
  IF _resultados_id IS NULL THEN
    RAISE EXCEPTION 'Conta "Lucros/Prejuízos Acumulados" (3.1.01) não encontrada no plano de contas';
  END IF;

  FOR r IN
    SELECT pc.id, pc.tipo,
      COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) AS debito,
      COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS credito
    FROM public.plano_contas pc
    JOIN public.lancamentos_contabeis_itens i ON i.conta_id = pc.id
    JOIN public.lancamentos_contabeis lc ON lc.id = i.lancamento_id
    WHERE pc.tipo IN ('receita', 'despesa') AND pc.analitica AND lc.data <= _data_corte
    GROUP BY pc.id, pc.tipo
  LOOP
    IF r.tipo = 'receita' THEN
      _saldo := r.credito - r.debito;
      IF _saldo > 0 THEN
        _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', r.id, 'tipo', 'debito', 'valor', _saldo));
      ELSIF _saldo < 0 THEN
        _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', r.id, 'tipo', 'credito', 'valor', -_saldo));
      END IF;
      _total_receita := _total_receita + _saldo;
    ELSE
      _saldo := r.debito - r.credito;
      IF _saldo > 0 THEN
        _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', r.id, 'tipo', 'credito', 'valor', _saldo));
      ELSIF _saldo < 0 THEN
        _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', r.id, 'tipo', 'debito', 'valor', -_saldo));
      END IF;
      _total_despesa := _total_despesa + _saldo;
    END IF;
  END LOOP;

  _resultado := _total_receita - _total_despesa;

  IF jsonb_array_length(_itens) > 0 THEN
    IF _resultado > 0 THEN
      _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _resultados_id, 'tipo', 'credito', 'valor', _resultado));
    ELSIF _resultado < 0 THEN
      _itens := _itens || jsonb_build_array(jsonb_build_object('conta_id', _resultados_id, 'tipo', 'debito', 'valor', -_resultado));
    END IF;

    SELECT public.registrar_lancamento_contabil(
      _data_corte, date_trunc('month', _data_corte)::date,
      'Apuração de resultado e fechamento do exercício ' || _exercicio,
      _itens, 'fechamento_exercicio', NULL
    ) INTO _lanc_id;
  END IF;

  INSERT INTO public.fechamentos_exercicio (exercicio, data_corte, status, lancamento_transporte_id, resultado_apurado, fechado_por, fechado_em, observacoes)
  VALUES (_exercicio, _data_corte, 'fechado', _lanc_id, _resultado, auth.uid(), now(), _observacoes)
  ON CONFLICT (exercicio) DO UPDATE SET
    data_corte = EXCLUDED.data_corte, status = 'fechado', lancamento_transporte_id = EXCLUDED.lancamento_transporte_id,
    resultado_apurado = EXCLUDED.resultado_apurado, fechado_por = auth.uid(), fechado_em = now(),
    reaberto_por = NULL, reaberto_em = NULL, motivo_reabertura = NULL, observacoes = EXCLUDED.observacoes
  RETURNING id INTO _fechamento_id;

  INSERT INTO public.fechamentos_exercicio_eventos (fechamento_id, acao, lancamento_id, realizado_por, motivo)
  VALUES (_fechamento_id, 'fechamento', _lanc_id, auth.uid(), _observacoes);

  RETURN _fechamento_id;
END; $$;

REVOKE ALL ON FUNCTION public.fechar_exercicio(INTEGER, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_exercicio(INTEGER, DATE, TEXT) TO authenticated;

-- =========================================
-- RPC: reabre um exercício fechado. Primeiro destrava (muda o status, o
-- que libera a checagem em registrar_lancamento_contabil), só então posta
-- o estorno do lançamento de fechamento — nessa ordem porque, com o status
-- ainda 'fechado', o próprio estorno (datado na data de corte) seria
-- bloqueado pela trava que estamos removendo.
-- =========================================
CREATE OR REPLACE FUNCTION public.reabrir_exercicio(_exercicio INTEGER, _motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _fechamento RECORD;
  _itens JSONB := '[]'::JSONB;
  _estorno_id UUID;
  r RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão — apenas admin reabre o exercício';
  END IF;
  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'Informe o motivo da reabertura';
  END IF;

  SELECT * INTO _fechamento FROM public.fechamentos_exercicio WHERE exercicio = _exercicio AND status = 'fechado';
  IF _fechamento IS NULL THEN
    RAISE EXCEPTION 'Exercício % não encontrado ou não está fechado', _exercicio;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fechamentos_exercicio WHERE exercicio > _exercicio AND status = 'fechado') THEN
    RAISE EXCEPTION 'Existe um exercício mais recente já fechado — reabra-o primeiro';
  END IF;

  UPDATE public.fechamentos_exercicio
  SET status = 'reaberto', reaberto_por = auth.uid(), reaberto_em = now(), motivo_reabertura = _motivo
  WHERE id = _fechamento.id;

  IF _fechamento.lancamento_transporte_id IS NOT NULL THEN
    FOR r IN SELECT conta_id, tipo, valor, descricao FROM public.lancamentos_contabeis_itens WHERE lancamento_id = _fechamento.lancamento_transporte_id LOOP
      _itens := _itens || jsonb_build_array(jsonb_build_object(
        'conta_id', r.conta_id,
        'tipo', CASE WHEN r.tipo = 'debito' THEN 'credito' ELSE 'debito' END,
        'valor', r.valor,
        'descricao', r.descricao
      ));
    END LOOP;

    SELECT public.registrar_lancamento_contabil(
      _fechamento.data_corte, date_trunc('month', _fechamento.data_corte)::date,
      'Estorno do fechamento do exercício ' || _exercicio,
      _itens, 'fechamento_exercicio_reabertura', _fechamento.id
    ) INTO _estorno_id;
  END IF;

  INSERT INTO public.fechamentos_exercicio_eventos (fechamento_id, acao, lancamento_id, realizado_por, motivo)
  VALUES (_fechamento.id, 'reabertura', _estorno_id, auth.uid(), _motivo);
END; $$;

REVOKE ALL ON FUNCTION public.reabrir_exercicio(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_exercicio(INTEGER, TEXT) TO authenticated;
