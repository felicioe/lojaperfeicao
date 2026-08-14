-- Regime de caixa (migração 0070) já faz `registrar_lancamento_contabil`
-- ignorar silenciosamente qualquer lançamento com origem_tipo IN
-- ('fatura_provisao', 'conta_pagar_provisao') — a provisão de fatura não é
-- mais fato contábil, só a baixa. Mas `_postar_provisao_fatura` (que
-- `criar_fatura_avulsa` e `gerar_mensalidades` chamam ao emitir qualquer
-- fatura) ainda faz sua própria checagem da conta transitória "Contas a
-- Receber" antes de chegar lá — checagem que ficou inválida desde que a
-- migração 0071 renomeou essa conta de 1.1.02 para 1.1.91 (e a inativou).
-- Resultado: toda emissão de fatura nova (avulsa ou em lote) trava com
-- "Conta \"Contas a Receber\" (1.1.02) não encontrada" antes mesmo de
-- chegar no no-op que já existia pra esse caso.
--
-- Correção: `_postar_provisao_fatura` vira um no-op de verdade, sem
-- depender de nenhuma conta do plano — coerente com o que
-- `registrar_lancamento_contabil` já faz pra esse origem_tipo. Mantém a
-- mesma assinatura pra não exigir mudança em `criar_fatura_avulsa` nem em
-- `gerar_mensalidades`.
DROP PROCEDURE IF EXISTS _postar_provisao_fatura;
DELIMITER $$
CREATE PROCEDURE _postar_provisao_fatura(
  IN p_lancamento_id CHAR(36),
  IN p_valor DECIMAL(14,2),
  IN p_data DATE,
  IN p_competencia DATE,
  IN p_descricao VARCHAR(500),
  IN p_rateio JSON
)
BEGIN
END$$
DELIMITER ;
