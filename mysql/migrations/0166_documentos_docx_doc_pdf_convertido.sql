-- Issue do usuário — upload de .docx/.doc em Documentos, com conversão
-- opcional pra PDF (pra ter uma prévia navegável/baixável, já que o
-- navegador não abre .docx inline como abre PDF).
--
-- `arquivo_pdf_url` guarda a versão convertida (data URL, mesma
-- convenção de `arquivo_url` desde a 0117), gerada no momento do upload
-- via LibreOffice headless quando o binário está disponível no processo
-- Node. Fica NULL quando a conversão não roda (binário ausente na
-- Hostinger, timeout, arquivo corrompido) — o upload do original nunca
-- falha por causa disso, só a prévia em PDF fica indisponível.
ALTER TABLE documentos
  ADD COLUMN arquivo_pdf_url LONGTEXT NULL AFTER arquivo_mime;
