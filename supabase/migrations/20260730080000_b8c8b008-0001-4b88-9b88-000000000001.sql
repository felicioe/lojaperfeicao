-- =========================================
-- Despesas recorrentes — issue #8
-- =========================================
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

-- Liga o lançamento gerado ao template que o originou, e impede gerar duas
-- vezes para a mesma competência (defesa em profundidade além do EXISTS
-- checado na função abaixo — protege também contra corrida entre chamadas
-- concorrentes do job).
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS recorrente_id UUID REFERENCES public.despesas_recorrentes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_recorrente_competencia_uniq
  ON public.lancamentos (recorrente_id, competencia_mes) WHERE recorrente_id IS NOT NULL;

-- =========================================
-- RPC: efetiva (gera a conta a pagar de) toda recorrência ativa cujo dia
-- de vencimento do mês corrente já passou e que ainda não foi gerada para
-- esta competência. Idempotente — pode ser chamada várias vezes sem
-- duplicar. Usada tanto pelo botão manual da tela quanto pelo job
-- agendado (próxima migration).
--
-- auth.uid() só é NULL quando a chamada não passa pelo PostgREST (pg_cron
-- rodando SQL direto, ou service role) — o papel "anon" nunca alcança o
-- corpo da função, pois o EXECUTE abaixo não é concedido a anon, só a
-- authenticated. Um usuário autenticado sem papel financeiro continua
-- bloqueado normalmente.
-- =========================================
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
