-- =============================================================================
-- Migração 0094: papel `super_admin` (issue #339, parte 1)
--
-- O administrador da PLATAFORMA, distinto do administrador de cada Loja.
-- `admin` continua sendo quem manda dentro de uma Loja (usuários, parâmetros,
-- e-mail, backups daquela Loja); `super_admin` administra o SaaS em si —
-- cadastra Lojas, ativa e inativa, e (parte 2) convida o primeiro admin de
-- cada uma.
--
-- Os dois são independentes de propósito: ser dono do SaaS não dá acesso aos
-- dados internos de nenhuma Loja, e ser admin de uma Loja não dá acesso ao
-- cadastro das outras. Sem impersonação nesta fase (decisão registrada na
-- issue) — se a necessidade real aparecer, entra depois com auditoria própria.
--
-- `usuarios_papeis` tem loja_id desde a 0092, então o papel é por Loja como
-- todos os outros. Para o super-admin isso é irrelevante na prática (ele age
-- fora do escopo de qualquer Loja), mas manter a uniformidade evita um caso
-- especial no schema.
-- =============================================================================

ALTER TABLE usuarios_papeis
  MODIFY COLUMN papel ENUM('admin', 'tesoureiro', 'secretario', 'irmao', 'super_admin') NOT NULL;

-- has_role() já compara papel com uma string qualquer, então não precisa
-- mudar: has_role(@current_usuario_id, 'super_admin') passa a funcionar
-- assim que o valor existir no ENUM.

-- Concessão do papel ao primeiro super-admin: NÃO fica aqui de propósito.
-- Um INSERT com e-mail fixo em migração seria copiado para todo ambiente
-- novo e criaria um acesso de plataforma sem ninguém ter pedido. A concessão
-- é feita uma vez, à mão, no ambiente onde faz sentido:
--
--   INSERT INTO usuarios_papeis (loja_id, usuario_id, papel)
--   SELECT loja_id, id, 'super_admin' FROM usuarios WHERE email = 'SEU_EMAIL';
