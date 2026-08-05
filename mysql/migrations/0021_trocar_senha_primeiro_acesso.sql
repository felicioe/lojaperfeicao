-- =========================================
-- Rotina de senha: opção de "fixar" (senha permanente) ou "obrigar troca
-- no primeiro acesso" (senha temporária) ao criar acesso ou redefinir
-- senha de um usuário. Quando TRUE, o próximo login do usuário é
-- interceptado por /trocar-senha (mesmo padrão de gate já usado pra
-- LGPD em /aceite-termos) até ele definir uma senha nova por conta
-- própria — aí a flag volta pra FALSE.
-- =========================================
ALTER TABLE usuarios ADD COLUMN deve_trocar_senha BOOLEAN NOT NULL DEFAULT FALSE;
