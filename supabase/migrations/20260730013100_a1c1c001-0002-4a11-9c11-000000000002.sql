-- =========================================
-- Motor de contabilidade em partida dobrada — lançamentos
-- Issue #1
-- =========================================

-- Contas patrimoniais mínimas necessárias para qualquer lançamento
-- (Caixa/Bancos, Contas a Receber, Contas a Pagar). A árvore completa de
-- ativo/passivo fica para a issue #2 — aqui só o necessário para o motor
-- funcionar de ponta a ponta.
INSERT INTO public.plano_contas (codigo, nome, tipo, analitica) VALUES
  ('1.1.01', 'Caixa e Bancos', 'ativo', true),
  ('1.1.02', 'Contas a Receber', 'ativo', true),
  ('2.1.01', 'Contas a Pagar', 'passivo', true)
ON CONFLICT (codigo) DO NOTHING;

-- =========================================
-- Cabeçalho do lançamento (agrupa as linhas D/C de uma mesma transação)
-- =========================================
CREATE TABLE public.lancamentos_contabeis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  competencia DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  descricao TEXT NOT NULL,
  origem_tipo TEXT,
  origem_id UUID,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.lancamentos_contabeis (data);
CREATE INDEX ON public.lancamentos_contabeis (competencia);
CREATE INDEX ON public.lancamentos_contabeis (origem_tipo, origem_id);
GRANT SELECT ON public.lancamentos_contabeis TO authenticated;
GRANT ALL ON public.lancamentos_contabeis TO service_role;
ALTER TABLE public.lancamentos_contabeis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lancamentos_contabeis_select" ON public.lancamentos_contabeis FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro') OR public.has_role(auth.uid(), 'secretario'));
-- Sem policy de INSERT/UPDATE/DELETE para authenticated: toda escrita passa
-- pela função registrar_lancamento_contabil (SECURITY DEFINER) para garantir
-- que nenhum lançamento desbalanceado chegue à tabela.

-- =========================================
-- Linhas do lançamento (débito/crédito)
-- =========================================
CREATE TABLE public.lancamentos_contabeis_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos_contabeis(id) ON DELETE CASCADE,
  conta_id UUID NOT NULL REFERENCES public.plano_contas(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('debito', 'credito')),
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  descricao TEXT
);
CREATE INDEX ON public.lancamentos_contabeis_itens (lancamento_id);
CREATE INDEX ON public.lancamentos_contabeis_itens (conta_id);
GRANT SELECT ON public.lancamentos_contabeis_itens TO authenticated;
GRANT ALL ON public.lancamentos_contabeis_itens TO service_role;
ALTER TABLE public.lancamentos_contabeis_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lancamentos_contabeis_itens_select" ON public.lancamentos_contabeis_itens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro') OR public.has_role(auth.uid(), 'secretario'));

-- =========================================
-- Guarda-corpo: nenhum lançamento pode ficar desbalanceado (soma débito =
-- soma crédito por lancamento_id). Trigger de restrição adiada para o fim
-- da transação, assim todas as linhas de um mesmo lançamento (inseridas
-- juntas pela RPC abaixo) já estão visíveis na hora da checagem.
-- =========================================
CREATE OR REPLACE FUNCTION public.check_lancamento_balanceado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  _id UUID := COALESCE(NEW.lancamento_id, OLD.lancamento_id);
  _deb NUMERIC; _cred NUMERIC;
BEGIN
  SELECT COALESCE(SUM(valor) FILTER (WHERE tipo = 'debito'), 0),
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'credito'), 0)
    INTO _deb, _cred
  FROM public.lancamentos_contabeis_itens WHERE lancamento_id = _id;
  IF _deb <> _cred THEN
    RAISE EXCEPTION 'Lançamento contábil % desbalanceado: débito % <> crédito %', _id, _deb, _cred;
  END IF;
  RETURN NULL;
END; $$;

CREATE CONSTRAINT TRIGGER trg_lancamento_balanceado
  AFTER INSERT OR UPDATE OR DELETE ON public.lancamentos_contabeis_itens
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_lancamento_balanceado();

-- =========================================
-- RPC: registra um lançamento contábil completo (cabeçalho + linhas) numa
-- única chamada. Único caminho de escrita liberado para o client.
-- _itens: jsonb array de {"conta_id": uuid, "tipo": "debito"|"credito", "valor": number, "descricao"?: text}
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
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tesoureiro')) THEN
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

REVOKE ALL ON FUNCTION public.registrar_lancamento_contabil(DATE, DATE, TEXT, JSONB, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_lancamento_contabil(DATE, DATE, TEXT, JSONB, TEXT, UUID) TO authenticated;

-- =========================================
-- Views de apoio: saldo por conta e auditoria de consistência.
-- A auditoria de "desbalanceados" deve dar sempre vazia graças ao trigger
-- acima — ela existe como rede de segurança para dados tocados fora da
-- RPC (ex.: import direto, migração futura) e é o relatório administrativo
-- pedido na issue #1.
-- =========================================
CREATE OR REPLACE VIEW public.v_saldo_plano_contas
WITH (security_invoker = true) AS
SELECT
  c.id, c.codigo, c.nome, c.tipo,
  COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'debito'), 0) AS total_debito,
  COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'credito'), 0) AS total_credito,
  COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'debito'), 0) - COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'credito'), 0) AS saldo_devedor
FROM public.plano_contas c
LEFT JOIN public.lancamentos_contabeis_itens i ON i.conta_id = c.id
WHERE c.analitica
GROUP BY c.id, c.codigo, c.nome, c.tipo;
GRANT SELECT ON public.v_saldo_plano_contas TO authenticated;

CREATE OR REPLACE VIEW public.v_auditoria_contabil_desbalanceados
WITH (security_invoker = true) AS
SELECT
  l.id AS lancamento_id, l.data, l.descricao, l.origem_tipo, l.origem_id,
  COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'debito'), 0) AS total_debito,
  COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'credito'), 0) AS total_credito,
  COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'debito'), 0) - COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'credito'), 0) AS diferenca
FROM public.lancamentos_contabeis l
JOIN public.lancamentos_contabeis_itens i ON i.lancamento_id = l.id
GROUP BY l.id, l.data, l.descricao, l.origem_tipo, l.origem_id
HAVING COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'debito'), 0) <> COALESCE(SUM(i.valor) FILTER (WHERE i.tipo = 'credito'), 0);
GRANT SELECT ON public.v_auditoria_contabil_desbalanceados TO authenticated;
