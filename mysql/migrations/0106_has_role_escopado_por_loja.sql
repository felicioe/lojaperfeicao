-- =============================================================================
-- Migração 0106: has_role() escopado por loja (achado crítico da auditoria
-- geral de bugs)
--
-- has_role(usuario_id, papel) nunca filtrava por loja_id — só conferia se
-- EXISTIA alguma linha em usuarios_papeis com aquele usuario_id e papel, em
-- QUALQUER loja. Isso não era um problema visível antes do multi-tenant
-- (só existia uma Loja), mas depois da 0092 (loja_id em usuarios_papeis)
-- virou uma escalação de privilégio entre tenants: atualizarPapeisUsuario
-- (usuarios.ts) só escopa por loja_id o SELECT/DELETE dos papéis antigos —
-- o INSERT dos novos papéis grava (loja_id = loja de quem está chamando,
-- usuario_id = QUALQUER uuid recebido do cliente, sem checar se pertence
-- àquela loja). Um admin de uma Loja X, sabendo o UUID de um usuário de
-- outra Loja Y, conseguia gravar uma linha (loja_id=X, usuario_id=<user de
-- Y>, papel='admin') — e como has_role() ignorava loja_id, quando esse
-- usuário fizesse login normalmente NA PRÓPRIA Loja Y (onde @current_loja_id
-- resolve pra Y, não pra X), a linha "estranha" ainda contava e ele virava
-- admin dentro da própria Loja Y sem que ninguém de lá tivesse concedido.
--
-- A correção é no único lugar que decide "esse usuário tem esse papel?":
-- has_role() passa a exigir também loja_id = @current_loja_id. Como TODO
-- call site de has_role() no banco (grep confirma: 100% das procedures) e
-- na aplicação (authz.ts: comPapel/comSuperAdmin) chama sempre com
-- @current_usuario_id — nunca com um usuario_id de terceiro —, e
-- @current_loja_id é sempre derivado do PRÓPRIO usuário logado (db.ts,
-- `SET ... @current_loja_id = (SELECT loja_id FROM usuarios WHERE id = ?)`),
-- filtrar por loja_id aqui não quebra nenhum uso legítimo: a checagem
-- continua "esse usuário tem esse papel na loja em que ele está logado?",
-- que é exatamente o que sempre deveria ter sido.
--
-- Não precisa de backfill: toda linha pré-existente de usuarios_papeis tem
-- loja_id igual ao loja_id do próprio usuário dono dela (confirmado —
-- ambas as colunas foram preenchidas com o mesmo DEFAULT na 0092 pra dados
-- antigos, e toda escrita legítima desde então usa a loja de quem está
-- chamando consistentemente nas duas tabelas). A única linha que ficaria
-- "órfã" por essa mudança é exatamente a que um ataque como o descrito
-- acima teria plantado — o que é o efeito pretendido.
-- =============================================================================

DROP FUNCTION IF EXISTS has_role;
DELIMITER $$
CREATE FUNCTION has_role(p_usuario_id CHAR(36), p_papel VARCHAR(20))
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  IF p_usuario_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM usuarios_papeis
    WHERE usuario_id = p_usuario_id AND papel = p_papel AND loja_id = @current_loja_id
  );
END$$
DELIMITER ;
