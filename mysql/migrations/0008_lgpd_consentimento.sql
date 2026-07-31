-- =========================================
-- LGPD (a) — aviso de privacidade + consentimento. Registra quando cada
-- usuário aceitou a Política de Privacidade: NULL = ainda não aceitou
-- (inclusive contas já existentes antes desta migration, e contas criadas
-- em lote pelo admin com senha padrão — ver src/lib/backend/usuarios.ts).
-- Todo usuário com consentimento_lgpd_em NULL é barrado em /aceite-termos
-- no próximo login até aceitar (ver src/routes/_authenticated/route.tsx).
-- =========================================

ALTER TABLE usuarios ADD COLUMN consentimento_lgpd_em DATETIME NULL;
