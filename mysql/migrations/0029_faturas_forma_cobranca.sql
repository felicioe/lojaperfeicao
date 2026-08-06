-- =========================================
-- FATURAS — forma de cobrança pretendida (PIX agora, boleto no futuro) e
-- a chave PIX usada pra gerar o QR/BR Code impresso. Deliberadamente
-- separado de lancamentos.forma_pagamento (esse já existe e registra o
-- que foi REALMENTE usado na baixa — pode nem bater com o que foi
-- ofertado na fatura, ex.: cobrou por PIX mas o irmão pagou em dinheiro
-- na secretaria). "boleto" aqui é só o layout impresso (estilo boleto,
-- com QR do Pix no lugar do código de barras) — não existe emissão real
-- de boleto bancário, sem integração com banco.
-- =========================================
ALTER TABLE lancamentos
  ADD COLUMN forma_cobranca ENUM('pix', 'boleto') NULL,
  ADD COLUMN pix_chave_id CHAR(36) NULL,
  ADD CONSTRAINT fk_lancamentos_pix_chave FOREIGN KEY (pix_chave_id) REFERENCES contas_financeiras_pix(id) ON DELETE SET NULL;
