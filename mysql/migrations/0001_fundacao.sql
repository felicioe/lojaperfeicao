-- =========================================
-- Fundação da migração Supabase -> MySQL (issue #48, Fase 8 do roadmap).
-- Ver mysql/README.md para o raciocínio completo de cada decisão abaixo.
--
-- Usuários e papéis (equivalente a auth.users+profiles e user_roles do
-- Postgres). Autenticação/hash de senha/sessão ficam na camada de aplicação
-- (issue #49) — aqui só a tabela e a função de checagem de papel que as
-- stored procedures (issues #51/#52) vão usar no lugar de has_role(auth.uid(), ...).
-- =========================================

CREATE TABLE IF NOT EXISTS usuarios (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  nome_completo VARCHAR(255),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuarios_papeis (
  usuario_id CHAR(36) NOT NULL,
  papel ENUM('admin', 'tesoureiro', 'secretario', 'irmao') NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, papel),
  CONSTRAINT fk_usuarios_papeis_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================================
-- has_role(): equivalente a public.has_role(_user_id, _role) do Postgres.
-- Chamada como has_role(@current_usuario_id, 'admin') dentro das stored
-- procedures — @current_usuario_id é setado pela camada de aplicação a cada
-- conexão retirada do pool (ver mysql/README.md, seção 3).
-- =========================================
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
    SELECT 1 FROM usuarios_papeis WHERE usuario_id = p_usuario_id AND papel = p_papel
  );
END$$
DELIMITER ;

-- =========================================
-- is_admin_or(): equivalente a public.is_admin_or(_user_id, _role).
-- =========================================
DROP FUNCTION IF EXISTS is_admin_or;
DELIMITER $$
CREATE FUNCTION is_admin_or(p_usuario_id CHAR(36), p_papel VARCHAR(20))
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  RETURN has_role(p_usuario_id, 'admin') OR has_role(p_usuario_id, p_papel);
END$$
DELIMITER ;
