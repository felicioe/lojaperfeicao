-- =========================================
-- Plano de contas — semear a árvore sintética e reparentar as contas
-- analíticas já existentes (issue #1) sob ela; guarda-corpos de
-- integridade da hierarquia.
-- Issue #2
-- =========================================

INSERT INTO public.plano_contas (codigo, nome, tipo, analitica) VALUES
  ('1',   'Ativo',               'ativo',              false),
  ('1.1', 'Ativo Circulante',    'ativo',              false),
  ('2',   'Passivo',             'passivo',            false),
  ('2.1', 'Passivo Circulante',  'passivo',            false),
  ('3',   'Patrimônio Líquido',  'patrimonio_liquido', false),
  ('4',   'Receitas',            'receita',            false),
  ('5',   'Despesas',            'despesa',            false)
ON CONFLICT (codigo) DO NOTHING;

UPDATE public.plano_contas c SET parent_id = p.id
  FROM public.plano_contas p WHERE p.codigo = '1' AND c.codigo = '1.1';
UPDATE public.plano_contas c SET parent_id = p.id
  FROM public.plano_contas p WHERE p.codigo = '1.1' AND c.codigo IN ('1.1.01', '1.1.02');
UPDATE public.plano_contas c SET parent_id = p.id
  FROM public.plano_contas p WHERE p.codigo = '2' AND c.codigo = '2.1';
UPDATE public.plano_contas c SET parent_id = p.id
  FROM public.plano_contas p WHERE p.codigo = '2.1' AND c.codigo = '2.1.01';
UPDATE public.plano_contas c SET parent_id = p.id
  FROM public.plano_contas p WHERE p.codigo = '4' AND c.codigo IN ('4.1.01', '4.1.02', '4.1.03');
UPDATE public.plano_contas c SET parent_id = p.id
  FROM public.plano_contas p WHERE p.codigo = '5' AND c.codigo IN ('5.1.01', '5.1.02', '5.1.03', '5.1.04', '5.1.05');

-- =========================================
-- Guarda-corpo 1: uma conta que ganha filha deixa automaticamente de ser
-- analítica (só contas-folha recebem lançamento — regra usada pela RPC
-- registrar_lancamento_contabil da issue #1).
-- =========================================
CREATE OR REPLACE FUNCTION public.flag_parent_nao_analitica()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE public.plano_contas SET analitica = false WHERE id = NEW.parent_id AND analitica = true;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_plano_contas_parent_nao_analitica
  AFTER INSERT OR UPDATE OF parent_id ON public.plano_contas
  FOR EACH ROW EXECUTE FUNCTION public.flag_parent_nao_analitica();

-- =========================================
-- Guarda-corpo 2: impede autorreferência e ciclos na hierarquia.
-- =========================================
CREATE OR REPLACE FUNCTION public.check_plano_contas_sem_ciclo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  _cur UUID := NEW.parent_id;
  _hops INT := 0;
BEGIN
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Uma conta não pode ser pai de si mesma';
  END IF;
  WHILE _cur IS NOT NULL AND _hops < 50 LOOP
    IF _cur = NEW.id THEN
      RAISE EXCEPTION 'Ciclo detectado na hierarquia do plano de contas';
    END IF;
    SELECT parent_id INTO _cur FROM public.plano_contas WHERE id = _cur;
    _hops := _hops + 1;
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_plano_contas_sem_ciclo
  BEFORE INSERT OR UPDATE OF parent_id ON public.plano_contas
  FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION public.check_plano_contas_sem_ciclo();
