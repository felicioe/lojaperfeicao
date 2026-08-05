-- =========================================
-- GERAR_MENSALIDADES — duas correções:
--
-- 1) Vencimento padrão passa a ser o dia 07 do mês SEGUINTE à competência
-- (em vez de 9 dias após o início da própria competência). Isso importa
-- principalmente na emissão retroativa: gerar hoje a mensalidade de um mês
-- antigo com "9 dias após o início" produzia um vencimento também no
-- passado; "dia 07 do mês seguinte" é a regra que a loja realmente usa,
-- retroativo ou não. DATE_ADD(LAST_DAY(v_comp), INTERVAL 7 DAY) dá o dia
-- 07 do mês seguinte pra qualquer competência, sem se importar com
-- quantos dias o mês tem (ex.: competência 2026-01 -> LAST_DAY =
-- 2026-01-31 -> +7 = 2026-02-07). Só afeta o vencimento quando ele não é
-- informado manualmente (p_data_vencimento continua tendo prioridade).
--
-- 2) BUG CRÍTICO da migração 0023 (a que introduziu a busca de valor
-- histórico): o CONTINUE HANDLER FOR NOT FOUND declarado pro cursor
-- também pega o "sem linhas" do SELECT ... INTO v_valor_historico (o
-- handler vale pra QUALQUER "not found" dali pra frente no bloco, não só
-- pro cursor) — quando nenhuma linha de tabela_valores bate com a
-- competência (instalação sem histórico cadastrado, ou competência antes
-- da primeira vigência), esse SELECT "não encontra nada" e o handler seta
-- v_done = TRUE por engano, encerrando o loop depois de processar só o
-- PRIMEIRO irmão da lista — os outros nunca são cobrados, silenciosamente.
-- Só não apareceu antes porque os testes desta sessão sempre tinham
-- alguma linha em tabela_valores cadastrada. Fix: isola esse SELECT num
-- bloco BEGIN/END próprio com seu próprio handler local, que não
-- interfere no v_done do cursor externo.
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
  SET v_venc = COALESCE(p_data_vencimento, DATE_ADD(LAST_DAY(v_comp), INTERVAL 7 DAY));
  SET v_desc = CONCAT('Mensalidade ', DATE_FORMAT(p_competencia, '%m/%Y'));
  SET p_total = 0;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id, v_valor_mensalidade;
    IF v_done THEN LEAVE read_loop; END IF;

    IF NOT EXISTS (SELECT 1 FROM lancamentos WHERE is_mensalidade AND irmao_id = v_id AND competencia_mes = v_comp) THEN
      SET v_valor_historico = NULL;
      BEGIN
        -- Handler local: "nenhuma linha encontrada" aqui só zera
        -- v_valor_historico (comportamento já esperado), sem tocar no
        -- v_done do cursor externo — ver bloco de comentário no topo do
        -- arquivo.
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_valor_historico = NULL;
        SELECT valor INTO v_valor_historico
        FROM tabela_valores
        WHERE tipo = 'mensalidade' AND org_id IS NULL AND vigencia_inicio <= v_comp
        ORDER BY vigencia_inicio DESC
        LIMIT 1;
      END;

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
    END IF;
  END LOOP;
  CLOSE cur;
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
