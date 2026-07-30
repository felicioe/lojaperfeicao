-- =========================================
-- Job agendado: efetiva recorrências vencidas todo dia às 6h (horário do
-- servidor Postgres). Corrige a limitação do sistema legado, onde a
-- efetivação só acontecia quando um administrador abria a tela
-- (efetivarRecorrentesVencidas() rodava no client, sob demanda).
--
-- pg_cron executa a chamada como SQL direto (sem passar pelo PostgREST),
-- por isso auth.uid() é NULL nesse contexto — é exatamente o caminho
-- "sistema confiável" que registrar_lancamento_contabil e
-- efetivar_recorrentes_vencidas foram ajustados para aceitar acima.
--
-- Não foi possível testar esta parte num Postgres local — a extensão
-- pg_cron não está disponível neste ambiente de desenvolvimento (só a
-- tabela/RPC das migrations anteriores foram validadas ponta a ponta).
-- O botão "Efetivar recorrências vencidas" na tela chama a mesma RPC e
-- funciona independentemente deste agendamento — use-o como caminho
-- garantido caso o agendamento precise de ajuste manual após o deploy
-- (ex.: se pg_cron não estiver habilitado no projeto Supabase).
-- =========================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'efetivar-recorrentes-diario';
EXCEPTION WHEN OTHERS THEN
  NULL; -- pg_cron pode não estar disponível/habilitado neste projeto; sem job para remover na primeira aplicação
END $$;

SELECT cron.schedule(
  'efetivar-recorrentes-diario',
  '0 6 * * *',
  $$SELECT public.efetivar_recorrentes_vencidas();$$
);
