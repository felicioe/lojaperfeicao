-- =========================================
-- ORGS — logo por corpo maçônico. Usado na fatura impressa: como o irmão
-- muda de corpo principal conforme sobe de grau (ex.: Loja de Perfeição
-- -> Capítulo), o logo exibido no recibo segue o corpo PRINCIPAL do
-- irmão (irmao_orgs.principal = TRUE) no momento da impressão, não um
-- corpo fixo por fatura. Upload usa o mesmo padrão de
-- uploadFotoIrmao (arquivo salvo em public/uploads/, só a URL persiste
-- aqui).
-- =========================================
ALTER TABLE orgs ADD COLUMN logo_url VARCHAR(500) NULL;
