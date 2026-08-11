-- =========================================
-- SESSÕES e EVENTOS — campo "local" (endereço/lugar), separado do texto
-- livre de observações/descrição. A partir de agora observacoes/descricao
-- passam a ser editadas via editor rico (HTML) no front — o conteúdo já
-- existente (texto puro, vindo do importador de PDF) continua válido,
-- HTML sem tags é só texto normal.
-- =========================================
ALTER TABLE sessoes ADD COLUMN local VARCHAR(255) NULL AFTER org_id;
ALTER TABLE eventos ADD COLUMN local VARCHAR(255) NULL AFTER descricao;
