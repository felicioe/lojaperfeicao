-- Configurações globais da plataforma (issue #362) — parâmetros que valem
-- para todas as Lojas de uma vez, não uma tabela por Loja. Chave/valor
-- livre, sem loja_id de propósito: comSuperAdmin() já não resolve Loja
-- nenhuma (issue #339), então essa tabela vive fora do escopo de qualquer
-- Loja, igual à auditoria de plataforma (auditoria.loja_id IS NULL).
--
-- Primeiro uso concreto: o banner de manutenção/aviso, guardado em 3 linhas
-- (banner_ativo, banner_mensagem, banner_tipo). Chave/valor comporta os
-- próximos parâmetros sem precisar de outra migração de schema.
CREATE TABLE IF NOT EXISTS configuracoes_plataforma (
  chave VARCHAR(100) NOT NULL PRIMARY KEY,
  valor TEXT,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  atualizado_por CHAR(36) NULL,
  CONSTRAINT fk_configuracoes_plataforma_usuario
    FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
