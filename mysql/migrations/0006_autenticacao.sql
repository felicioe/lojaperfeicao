-- =========================================
-- Issue #49 — Autenticação e sessão própria.
--
-- Criação de usuário é a única escrita de mais de uma linha nesta issue
-- (usuarios + usuarios_papeis), então segue o mesmo padrão de atomicidade
-- documentado em mysql/README.md e aplicado em 0003/0004/0005: transação
-- própria só quando não há uma em andamento, com ROLLBACK + RESIGNAL em
-- caso de erro. Sem isso, uma falha entre os dois INSERTs deixaria um
-- usuário sem nenhum papel (não consegue logar em lugar nenhum do app).
--
-- Preserva o comportamento original do trigger Postgres
-- `handle_new_user()` (supabase/migrations/..._24243c44...sql): a conta é
-- sempre criada — não existe bloqueio de "signup fechado" no banco — e
-- recebe o papel 'admin' automaticamente se for a primeira conta do
-- sistema (usuarios_papeis vazia), senão recebe 'irmao'. A tela de login
-- (issue #53) decide se mostra a aba de "criar 1º admin" com base na
-- mesma contagem, só por conveniência visual.
--
-- Login e leitura da sessão não precisam de stored procedure: são apenas
-- SELECT (comparação de senha com bcrypt acontece na camada de aplicação,
-- nunca no banco), e toda leitura já passa por uma rota do servidor Node
-- (README, seção 4) — não há necessidade de proteção extra aqui.
-- =========================================

DROP PROCEDURE IF EXISTS criar_usuario;
DELIMITER $$
CREATE PROCEDURE criar_usuario(
  IN p_email VARCHAR(255),
  IN p_senha_hash VARCHAR(255),
  IN p_nome_completo VARCHAR(255),
  OUT p_usuario_id CHAR(36)
)
BEGIN
  DECLARE v_total_papeis INT;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF EXISTS (SELECT 1 FROM usuarios WHERE email = p_email) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Já existe uma conta com este e-mail.';
  END IF;

  SET p_usuario_id = UUID();
  INSERT INTO usuarios (id, email, senha_hash, nome_completo)
  VALUES (p_usuario_id, p_email, p_senha_hash, p_nome_completo);

  SELECT COUNT(*) INTO v_total_papeis FROM usuarios_papeis;
  INSERT INTO usuarios_papeis (usuario_id, papel)
  VALUES (p_usuario_id, IF(v_total_papeis = 0, 'admin', 'irmao'));

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
