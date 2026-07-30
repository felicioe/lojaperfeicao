
DROP POLICY IF EXISTS contas_select ON public.contas_financeiras;
CREATE POLICY contas_select ON public.contas_financeiras
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'tesoureiro')
  OR public.has_role(auth.uid(),'secretario')
);

DROP POLICY IF EXISTS presencas_select ON public.presencas;
CREATE POLICY presencas_select ON public.presencas
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'secretario')
  OR public.has_role(auth.uid(),'tesoureiro')
  OR EXISTS (SELECT 1 FROM public.irmaos i WHERE i.id = presencas.irmao_id AND i.user_id = auth.uid())
);
