-- Formas adicionais de pagamento PIX cadastradas por conta financeira.
ALTER TABLE contas_financeiras_pix
  ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT NULL AFTER chave,
  ADD COLUMN IF NOT EXISTS qr_code_url VARCHAR(500) NULL AFTER pix_copia_cola;
