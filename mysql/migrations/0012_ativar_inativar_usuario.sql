-- =========================================
-- ATIVAR/INATIVAR USUÁRIO (issue #24, gap identificado na revisão) —
-- desabilitar um login sem precisar excluir o usuário (perde o vínculo
-- com o irmão, o histórico de criado_por em lançamentos etc.). Bloqueia
-- login (mensagem clara) e também derruba qualquer sessão já aberta
-- (checado a cada carregamento de sessão, não só no login) — ver
-- src/lib/backend/auth.ts.
-- =========================================
ALTER TABLE usuarios ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE;
