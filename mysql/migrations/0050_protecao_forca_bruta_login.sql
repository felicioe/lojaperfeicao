-- =========================================
-- PROTEÇÃO CONTRA FORÇA BRUTA NO LOGIN (issue #183 — achado médio da
-- revisão de segurança). Sem contador de tentativas nenhum antes disso, no
-- login por senha nem na confirmação de 2FA — agravado pelo login
-- previsível nome.sobrenome combinado com a senha padrão conhecida.
--
-- Tabela simples de contador por chave (e-mail/login normalizado, ou
-- usuario_id pra 2FA já autenticado por senha): acumula tentativas
-- falhas e bloqueia temporariamente depois de N seguidas. Sem FK pra
-- usuarios porque a chave pode ser um e-mail que nem existe no sistema
-- (não vale a pena vazar "esse e-mail não existe" só pra não contar a
-- tentativa). Ver src/lib/backend/rate-limit.ts para os helpers.
-- =========================================
CREATE TABLE IF NOT EXISTS tentativas_login (
  chave VARCHAR(255) NOT NULL PRIMARY KEY,
  tentativas INT NOT NULL DEFAULT 0,
  bloqueado_ate DATETIME NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
