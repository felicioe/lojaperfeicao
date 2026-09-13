-- =========================================
-- Achados #546/#552 da auditoria de performance: depois da retrofit de
-- multi-tenant (0092), lancamentos só ganhou loja_id como índice ISOLADO —
-- nenhum índice composto liderando por loja_id foi criado pros dois padrões
-- de consulta mais comuns do dia a dia:
--
-- 1. listarLancamentos (tesouraria-lancamentos.ts) filtra por loja_id e
--    ordena por data DESC — sem índice composto, o MySQL tem que escolher
--    entre filtrar por loja (e fazer filesort de todos os lançamentos dela)
--    ou varrer por data cruzando todas as lojas do SaaS.
-- 2. listarLancamentosParaConciliar (tesouraria-conciliacao.ts) filtra por
--    loja_id + pago + tipo — o índice idx_lancamentos_pago_tipo existente
--    não lidera por loja_id, então sofre do mesmo problema numa base
--    compartilhada entre várias lojas.
--
-- Só acelera leituras — não altera dado nenhum.
-- =========================================
CREATE INDEX idx_lancamentos_loja_data ON lancamentos (loja_id, data DESC);
CREATE INDEX idx_lancamentos_loja_pago_tipo ON lancamentos (loja_id, pago, tipo);
