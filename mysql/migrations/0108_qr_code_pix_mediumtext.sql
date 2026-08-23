-- O upload de QR Code PIX passou a gravar a imagem como data URL direto
-- nesta coluna, em vez de escrever um arquivo em public/uploads/ (que não
-- sobrevive a um novo deploy da Hostinger — a pasta não é versionada no
-- git, então um redeploy apaga o arquivo e deixa a URL salva apontando pro
-- nada). VARCHAR(500) não cabe uma imagem em base64; MEDIUMTEXT cobre até
-- 16 MB, folgado para o limite de 5 MB validado no upload.
ALTER TABLE contas_financeiras_pix
  MODIFY COLUMN qr_code_url MEDIUMTEXT NULL;
