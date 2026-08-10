-- =========================================
-- MENSALIDADE INDIVIDUAL CUSTOMIZADA (achado #5 da auditoria financeira
-- geral) — decisão do usuário: valor negociado à parte de um irmão
-- específico deve sempre prevalecer sobre reajuste em massa/histórico da
-- Tabela de Valores.
--
-- Bug real: reajustarMensalidadeEmMassa tem a opção "poupar quem está em
-- valor diferenciado" (apenasComValorAtual), mas isso só afeta a UPDATE de
-- irmaos.valor_mensalidade — o INSERT em tabela_valores (histórico global)
-- acontece incondicionalmente, e gerar_mensalidades (0023/0025/0040)
-- prioriza esse histórico global sobre o valor individual pra TODO MUNDO,
-- inclusive quem acabou de ser poupado. Na competência seguinte, o
-- "poupado" recebia fatura no valor novo do reajuste em massa mesmo assim.
--
-- Fix: nova coluna irmaos.valor_mensalidade_customizado. Quando TRUE,
-- gerar_mensalidades ignora completamente o histórico da Tabela de Valores
-- e usa sempre irmaos.valor_mensalidade — e reajustarMensalidadeEmMassa
-- nunca mais toca esses irmãos, com qualquer filtro. Fica TRUE sempre que
-- o valor é editado individualmente no perfil do irmão (atualizarPerfilIrmao)
-- e volta a FALSE quando o próprio reajuste em massa inclui aquele irmão
-- (ele está "entrando" no valor padrão de propósito). Irmão novo
-- (criarIrmao) começa com FALSE — segue o padrão até alguém customizar.
-- =========================================
ALTER TABLE irmaos
  ADD COLUMN valor_mensalidade_customizado BOOLEAN NOT NULL DEFAULT FALSE;

DROP PROCEDURE IF EXISTS gerar_mensalidades;
DELIMITER $$
CREATE PROCEDURE gerar_mensalidades(
  IN p_competencia DATE,
  IN p_data_vencimento DATE,
  IN p_irmao_id CHAR(36),
  IN p_rateio JSON,
  OUT p_total INT
)
BEGIN
  DECLARE v_plano CHAR(36);
  DECLARE v_venc DATE;
  DECLARE v_comp DATE;
  DECLARE v_desc VARCHAR(500);
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_valor_mensalidade DECIMAL(12,2);
  DECLARE v_customizado BOOLEAN;
  DECLARE v_valor_historico DECIMAL(12,2);
  DECLARE v_valor_final DECIMAL(12,2);
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT id, valor_mensalidade, valor_mensalidade_customizado FROM irmaos
    WHERE situacao IN ('ativo', 'quite', 'irregular') AND valor_mensalidade > 0
      AND (p_irmao_id IS NULL OR id = p_irmao_id);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT id INTO v_plano FROM plano_contas WHERE codigo = '4.1.01';
  IF v_plano IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Mensalidades" (4.1.01) não encontrada';
  END IF;
  SET v_comp = mes_competencia(p_competencia);
  SET v_venc = COALESCE(p_data_vencimento, DATE_ADD(LAST_DAY(v_comp), INTERVAL 7 DAY));
  SET v_desc = CONCAT('Mensalidade ', DATE_FORMAT(p_competencia, '%m/%Y'));
  SET p_total = 0;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id, v_valor_mensalidade, v_customizado;
    IF v_done THEN LEAVE read_loop; END IF;

    IF NOT EXISTS (SELECT 1 FROM lancamentos WHERE is_mensalidade AND irmao_id = v_id AND competencia_mes = v_comp) THEN
      IF v_customizado THEN
        SET v_valor_final = v_valor_mensalidade;
      ELSE
        SET v_valor_historico = NULL;
        BEGIN
          DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_valor_historico = NULL;
          SELECT valor INTO v_valor_historico
          FROM tabela_valores
          WHERE tipo = 'mensalidade' AND org_id IS NULL AND vigencia_inicio <= v_comp
          ORDER BY vigencia_inicio DESC
          LIMIT 1;
        END;
        SET v_valor_final = COALESCE(v_valor_historico, v_valor_mensalidade);
      END IF;

      SET v_lanc_id = UUID();
      INSERT INTO lancamentos (
        id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
        irmao_id, pago, is_mensalidade, competencia_mes, criado_por
      ) VALUES (
        v_lanc_id, LAST_DAY(v_comp), v_venc, v_desc, v_valor_final, 'entrada', v_plano,
        v_id, FALSE, TRUE, v_comp, @current_usuario_id
      );

      CALL _postar_provisao_fatura(v_lanc_id, v_valor_final, LAST_DAY(v_comp), v_comp, v_desc, p_rateio);

      SET p_total = p_total + 1;
    END IF;
  END LOOP;
  CLOSE cur;
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
