-- =========================================
-- PEÇAS DE ARQUITETURA — coluna atualizado_em (auditoria de 12/08/2026).
-- A notificação "peça aguardando aprovação" usa uma chave estável
-- (peca_pendente_aprovacao:ID) pra não repetir enquanto a peça continua
-- em análise — mas isso também impedia um novo aviso quando a peça
-- voltava pra "em_analise" depois de reenviada (edição de peça aprovada,
-- ver atualizarPecaArquitetura). Com atualizado_em na chave, cada
-- alteração de fato gera uma chave nova.
-- =========================================
ALTER TABLE pecas_arquitetura
  ADD COLUMN atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
