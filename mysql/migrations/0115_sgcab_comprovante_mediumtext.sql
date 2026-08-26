-- Comprovante de pagamento SGCAB (issue #371, achado colateral da auditoria
-- de autorização): uploadComprovanteSgcab gravava o arquivo em
-- public/uploads/sgcab/<cobrancaId>/ e salvava só a URL relativa na coluna
-- — mesma classe de bug do QR Code Pix (migração 0108) e do backup agendado
-- (migração 0112). A Hostinger reconstrói o projeto do zero a cada deploy
-- (git clone + build); essa pasta não é versionada no git nem gravada no
-- banco, então some no deploy seguinte e o link do comprovante quebra.
--
-- Passa a gravar o comprovante como data URL direto na coluna, igual ao QR
-- Code Pix. VARCHAR(500) não cabe imagem/PDF em base64; MEDIUMTEXT (até
-- 16 MB) cobre com folga o limite de 10 MB validado no upload
-- (uploadComprovanteSgcab, TAMANHO_MAXIMO_BYTES).
--
-- Comprovantes já existentes (path antigo em disco) ficam com a URL antiga
-- inválida — o arquivo real já não existe mais, não há o que recuperar.
ALTER TABLE sgcab_cobrancas
  MODIFY COLUMN comprovante_url MEDIUMTEXT NULL;

ALTER TABLE sgcab_faturas
  MODIFY COLUMN comprovante_url MEDIUMTEXT NULL;
