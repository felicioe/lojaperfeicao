-- Foto de perfil do irmão (issue #372, achado colateral da auditoria de
-- autorização): uploadFotoIrmao gravava o arquivo em
-- public/uploads/irmaos/<irmaoId>/ e salvava só a URL relativa na coluna —
-- mesma classe de bug do QR Code Pix (migração 0108) e do backup agendado
-- (migração 0112). A Hostinger reconstrói o projeto do zero a cada deploy
-- (git clone + build); essa pasta não é versionada no git nem gravada no
-- banco, então some no deploy seguinte e a foto quebra.
--
-- Passa a gravar a foto como data URL direto na coluna, igual ao QR Code
-- Pix. TEXT (64 KB) não cabe nem uma foto pequena em base64; MEDIUMTEXT (até
-- 16 MB) cobre com folga o limite de 5 MB agora validado no upload
-- (uploadFotoIrmao, TAMANHO_MAXIMO_BYTES — o upload não tinha nenhum limite
-- de tamanho antes desta correção).
--
-- Fotos já existentes (path antigo em disco) ficam com a URL antiga
-- inválida — o arquivo real já não existe mais, não há o que recuperar. O
-- fallback client-side (onError, mesmo padrão do FaturaCard/QR Pix) evita
-- que isso quebre visualmente a tela.
ALTER TABLE irmaos
  MODIFY COLUMN foto_url MEDIUMTEXT NULL;
