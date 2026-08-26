-- Arquivo de peça de arquitetura e de documento (issues #373 e #374,
-- achados colaterais da auditoria de autorização): uploadArquivoPeca e
-- uploadArquivoDocumento gravavam o PDF em public/uploads/... e salvavam só
-- a URL relativa na coluna — mesma classe de bug do QR Code Pix (migração
-- 0108) e do backup agendado (migração 0112). A Hostinger reconstrói o
-- projeto do zero a cada deploy (git clone + build); essa pasta não é
-- versionada no git nem gravada no banco, então some no deploy seguinte e o
-- link do arquivo quebra.
--
-- Passa a gravar o PDF como data URL direto na coluna, igual ao QR Code
-- Pix. VARCHAR(500) não cabe nem de longe; MEDIUMTEXT (até 16 MB) também
-- não é suficiente aqui — o limite de upload é 15 MB binário, que em
-- base64 chega a ~20 MB, estourando o teto do MEDIUMTEXT. Por isso
-- LONGTEXT (até 4 GB), mesma escolha feita na migração 0112 do backup.
--
-- Arquivos já existentes (path antigo em disco) ficam com a URL antiga
-- inválida — o arquivo real já não existe mais, não há o que recuperar.
ALTER TABLE pecas_arquitetura
  MODIFY COLUMN arquivo_url LONGTEXT NULL;

ALTER TABLE documentos
  MODIFY COLUMN arquivo_url LONGTEXT NULL;
