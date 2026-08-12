-- =========================================
-- Índice composto em lancamentos(pago, tipo, data_vencimento) — auditoria
-- técnica de 12/08/2026 apontou que a tabela mais consultada do sistema
-- não tinha índice nesses dois campos, apesar de serem os filtros mais
-- repetidos (dashboard, faturas em aberto, conciliação, relatórios de
-- inadimplência, fluxo de caixa). Só acelera leituras — não altera dado
-- nenhum.
-- =========================================
CREATE INDEX idx_lancamentos_pago_tipo ON lancamentos (pago, tipo, data_vencimento);
