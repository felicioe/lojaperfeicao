-- Achado #662 — notícias ganham imagem de capa (exibida no site e embutida
-- no e-mail da newsletter, #663) e um anexo opcional (PDF ou imagem, sem
-- conversão automática — ver decisão registrada na issue #662: converter
-- DOCX/DOC/RTF pra PDF precisaria de LibreOffice headless, indisponível na
-- Hostinger, mesma limitação já documentada em pecas-arquitetura.ts e
-- fatura-pdf.ts).
ALTER TABLE noticias
  ADD COLUMN imagem_capa_url LONGTEXT NULL AFTER conteudo,
  ADD COLUMN imagem_capa_nome_original VARCHAR(255) NULL AFTER imagem_capa_url,
  ADD COLUMN anexo_url LONGTEXT NULL AFTER imagem_capa_nome_original,
  ADD COLUMN anexo_nome_original VARCHAR(255) NULL AFTER anexo_url,
  ADD COLUMN anexo_mime VARCHAR(100) NULL AFTER anexo_nome_original;
