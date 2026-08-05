-- =========================================
-- GERAR_MENSALIDADES — usar o valor vigente na competência, não o valor
-- atual do irmão. Bug real: ao gerar retroativo (ex.: janeiro a agosto de
-- 2026, com reajuste de 70 para 115 em julho), toda competência saía com
-- o valor ATUAL de irmaos.valor_mensalidade (115), inclusive as
-- competências anteriores ao reajuste (que deveriam sair a 70).
--
-- Fix: para cada irmão, busca em tabela_valores (tipo='mensalidade',
-- org_id IS NULL — reajuste em massa e o cadastro manual da Tabela de
-- Valores só gravam valor global, sem distinção por corpo) a entrada mais
-- recente com vigencia_inicio <= competência. Se existir, usa esse valor;
-- senão (nenhum histórico cadastrado ainda para aquela data), cai no
-- comportamento antigo (irmaos.valor_mensalidade atual) — preserva
-- compatibilidade para instalações sem histórico e para valores
-- individuais customizados fora do fluxo de reajuste em massa.
-- =========================================
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
  DECLARE v_valor_historico DECIMAL(12,2);
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT id, valor_mensalidade FROM irmaos
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
  SET v_venc = COALESCE(p_data_vencimento, DATE_ADD(v_comp, INTERVAL 9 DAY));
  SET v_desc = CONCAT('Mensalidade ', DATE_FORMAT(p_competencia, '%m/%Y'));
  SET p_total = 0;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id, v_valor_mensalidade;
    IF v_done THEN LEAVE read_loop; END IF;

    IF NOT EXISTS (SELECT 1 FROM lancamentos WHERE is_mensalidade AND irmao_id = v_id AND competencia_mes = v_comp) THEN
      SELECT valor INTO v_valor_historico
      FROM tabela_valores
      WHERE tipo = 'mensalidade' AND org_id IS NULL AND vigencia_inicio <= v_comp
      ORDER BY vigencia_inicio DESC
      LIMIT 1;

      SET v_lanc_id = UUID();
      INSERT INTO lancamentos (
        id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
        irmao_id, pago, is_mensalidade, competencia_mes, criado_por
      ) VALUES (
        v_lanc_id, CURRENT_DATE, v_venc, v_desc, COALESCE(v_valor_historico, v_valor_mensalidade), 'entrada', v_plano,
        v_id, FALSE, TRUE, v_comp, @current_usuario_id
      );

      CALL _postar_provisao_fatura(v_lanc_id, COALESCE(v_valor_historico, v_valor_mensalidade), CURRENT_DATE, v_comp, v_desc, p_rateio);

      SET p_total = p_total + 1;
      SET v_valor_historico = NULL;
    END IF;
  END LOOP;
  CLOSE cur;
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
