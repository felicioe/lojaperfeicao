-- Logo de corpo maçônico (orgs) e de potência (issue #375, achado colateral
-- da auditoria de autorização): uploadLogoOrg/uploadLogoPotencia gravavam a
-- imagem em public/uploads/<orgs|potencias>/<id>/ e salvavam só a URL
-- relativa na coluna — mesma classe de bug do QR Code Pix (migração 0108)
-- e das demais correções desta leva (0115-0117). A Hostinger reconstrói o
-- projeto do zero a cada deploy (git clone + build); essa pasta não é
-- versionada no git nem gravada no banco, então some no deploy seguinte e
-- o logo quebra — inclusive na fatura impressa (issue #36).
--
-- Passa a gravar o logo como data URL direto na coluna, igual ao QR Code
-- Pix. VARCHAR não cabe imagem em base64; MEDIUMTEXT (até 16 MB) cobre com
-- folga o limite de 5 MB validado no upload (TAMANHO_MAXIMO_LOGO_BYTES).
--
-- Logos já existentes (path antigo em disco) ficam com a URL antiga
-- inválida — o arquivo real já não existe mais, não há o que recuperar. O
-- fallback client-side (onError, mesmo padrão do FaturaCard/QR Pix) evita
-- que isso quebre visualmente a tela ou a fatura impressa.
ALTER TABLE orgs
  MODIFY COLUMN logo_url MEDIUMTEXT NULL;

ALTER TABLE potencias
  MODIFY COLUMN logo_url MEDIUMTEXT NULL;
