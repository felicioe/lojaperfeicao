
DROP VIEW IF EXISTS public.v_saldo_contas;
CREATE VIEW public.v_saldo_contas
WITH (security_invoker = true) AS
SELECT
  c.id, c.nome, c.tipo, c.saldo_inicial,
  c.saldo_inicial
    + COALESCE((SELECT SUM(valor) FROM public.lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'entrada' AND l.pago),0)
    - COALESCE((SELECT SUM(valor) FROM public.lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'saida' AND l.pago),0)
    - COALESCE((SELECT SUM(valor) FROM public.lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'transferencia' AND l.pago),0)
    + COALESCE((SELECT SUM(valor) FROM public.lancamentos l WHERE l.conta_destino_id = c.id AND l.tipo = 'transferencia' AND l.pago),0)
  AS saldo_atual
FROM public.contas_financeiras c;
GRANT SELECT ON public.v_saldo_contas TO authenticated;
