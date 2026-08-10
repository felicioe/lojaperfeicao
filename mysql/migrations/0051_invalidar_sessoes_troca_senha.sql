-- =========================================
-- INVALIDAR SESSÕES ANTIGAS AO TROCAR SENHA (issue #184 — achado médio).
-- Sessão é um cookie assinado stateless (sem tabela própria), então não dá
-- pra "derrubar" um cookie específico de outro dispositivo — mas dá pra
-- fazer qualquer sessão criada ANTES da troca de senha parar de valer:
-- comSessao/comPapel (authz.ts) comparam o timestamp gravado no cookie na
-- hora do login com senha_alterada_em; se a sessão é mais velha que a
-- última troca, é tratada como inválida.
-- =========================================
ALTER TABLE usuarios ADD COLUMN senha_alterada_em TIMESTAMP NULL;
