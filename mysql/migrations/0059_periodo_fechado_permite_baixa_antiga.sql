-- =========================================
-- Fechamento de período (0045) travava qualquer UPDATE em lancamentos
-- cuja EMISSÃO (data) caísse num mês/exercício fechado — inclusive uma
-- baixa (receber uma fatura antiga hoje), que só muda campos de
-- pagamento (pago/valor_pago/data_pagamento/conta_id/forma_pagamento/...),
-- nunca a emissão em si. Fechar um mês tornava impossível cobrar
-- atrasados daquele mês pra sempre, sem opção de cancelar a fatura
-- (achado #11 da auditoria financeira — decisão do usuário: fechar o mês
-- deve continuar travando NOVOS lançamentos/edições de substância
-- datados nele, mas não deve impedir receber uma fatura já existente).
--
-- Fix: o trigger de UPDATE só bloqueia por causa de OLD.data quando algum
-- campo de "substância" da fatura de fato muda (data, valor, descrição,
-- tipo, vencimento, irmão, categoria, plano de contas etc.) — uma baixa
-- que só mexe em campos de pagamento passa. A checagem da data de
-- pagamento em si (segundo IF) continua igual: se a NOVA data_pagamento
-- cair num período fechado, ainda bloqueia (não dá pra registrar um
-- recebimento HOJE datado dentro de um mês já fechado).
-- =========================================
DROP TRIGGER IF EXISTS trg_lancamentos_bloqueia_periodo_fechado_update;
DELIMITER $$
CREATE TRIGGER trg_lancamentos_bloqueia_periodo_fechado_update
BEFORE UPDATE ON lancamentos
FOR EACH ROW
BEGIN
  DECLARE v_mudou_substancia BOOLEAN;
  SET v_mudou_substancia = (
       NOT (NEW.data <=> OLD.data)
    OR NOT (NEW.data_vencimento <=> OLD.data_vencimento)
    OR NOT (NEW.descricao <=> OLD.descricao)
    OR NOT (NEW.valor <=> OLD.valor)
    OR NOT (NEW.tipo <=> OLD.tipo)
    OR NOT (NEW.plano_conta_id <=> OLD.plano_conta_id)
    OR NOT (NEW.irmao_id <=> OLD.irmao_id)
    OR NOT (NEW.terceiro_id <=> OLD.terceiro_id)
    OR NOT (NEW.is_mensalidade <=> OLD.is_mensalidade)
    OR NOT (NEW.competencia_mes <=> OLD.competencia_mes)
    OR NOT (NEW.categoria_recebimento <=> OLD.categoria_recebimento)
    OR NOT (NEW.forma_cobranca <=> OLD.forma_cobranca)
    OR NOT (NEW.pix_chave_id <=> OLD.pix_chave_id)
    OR NOT (NEW.observacoes <=> OLD.observacoes)
    OR NOT (NEW.recorrente_id <=> OLD.recorrente_id)
  );

  IF v_mudou_substancia AND periodo_esta_fechado(OLD.data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento pertence a um período/exercício contábil já encerrado';
  END IF;
  IF NEW.data_pagamento IS NOT NULL
     AND (OLD.data_pagamento IS NULL OR OLD.data_pagamento <> NEW.data_pagamento)
     AND periodo_esta_fechado(NEW.data_pagamento) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício contábil encerrado para a nova data de pagamento';
  END IF;
END$$
DELIMITER ;
