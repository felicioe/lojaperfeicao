# Migração de infraestrutura: Supabase (Postgres) → MySQL na Hostinger

Este diretório é a contrapartida MySQL de `supabase/migrations` — decisão do usuário
(issue #48, dentro da Fase 8 do roadmap) de sair do Supabase e hospedar o banco de
dados no MySQL já provisionado na hospedagem compartilhada da Hostinger (que também
já publica o Node.js do projeto via GitHub).

Isso **não é uma troca de string de conexão**: Postgres/Supabase davam de graça um
conjunto de recursos que MySQL não tem — Row Level Security, RPCs `SECURITY DEFINER`
rodando sob o JWT do PostgREST, `JSONB` com operadores ricos, índices únicos parciais,
constraints adiáveis, Auth gerenciado. Este documento registra como cada um desses
recursos é substituído.

## Convenções de migração

- Arquivos numerados sequencialmente: `0001_fundacao.sql`, `0002_cadastros.sql` etc.
  (diferente do padrão de timestamp usado em `supabase/migrations` — aqui não há
  ferramenta de geração automática, então a ordem sequencial simples é mais clara).
- Cada migration é idempotente sempre que possível (`CREATE TABLE IF NOT EXISTS`,
  `INSERT ... ON DUPLICATE KEY UPDATE` ou checagem prévia), mesmo espírito do
  `ON CONFLICT DO NOTHING` usado do lado Postgres.
- Aplicar em ordem, uma vez, via `mysql -u <user> -p <banco> < mysql/migrations/000N_*.sql`.
  Não existe (ainda) uma ferramenta de migração automatizada tipo Supabase CLI — isso
  é left para quando o cliente MySQL do app (issue #53) estiver pronto; por ora, é
  aplicação manual mesmo, como o próprio projeto legado em PHP fazia.

## Decisões de arquitetura (equivalentes ao que o Postgres/Supabase dava de graça)

### 1. UUIDs
Postgres: `gen_random_uuid()`. MySQL/MariaDB (10.10+, testado em 10.11 — a mesma
versão majoritariamente usada em hospedagem compartilhada, inclusive Hostinger):
`UUID()` funciona como *default expression* em coluna `CHAR(36)`:

```sql
id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY
```

### 2. Enums
Postgres: `CREATE TYPE ... AS ENUM (...)`, reutilizável entre tabelas. MySQL: `ENUM(...)`
é declarado por coluna, não é um tipo nomeado reutilizável — repetimos a lista de
valores em cada coluna que precisa (pequena duplicação, sem solução melhor no MySQL).

### 3. Autenticação e "quem está logado" (substituindo `auth.uid()`)
Não existe Supabase Auth nem JWT verificado pelo PostgREST. A trilha escolhida:

- Tabela `usuarios` + `usuarios_papeis` (equivalentes a `auth.users`+`profiles` e
  `user_roles`), com senha em hash (bcrypt/argon2 — nunca texto plano), gerenciadas
  pela camada de aplicação (issue #49).
- Autenticação/sessão fica no Node.js (cookie assinado), fora do banco.
- **Dentro do banco**, para preservar o padrão "a função de escrita verifica a
  permissão sozinha, não só a API" (defesa em profundidade que o Supabase dava via
  RLS + RPC `SECURITY DEFINER`), a camada de aplicação define duas variáveis de
  sessão MySQL **a cada conexão retirada do pool, no início de cada requisição**:

  ```sql
  SET @current_usuario_id = ?;   -- id do usuário autenticado (ou NULL, se não houver)
  ```

  E toda stored procedure que hoje faz `IF NOT has_role(auth.uid(), 'admin') THEN RAISE`
  passa a fazer `IF NOT has_role(@current_usuario_id, 'admin') THEN SIGNAL ...`,
  usando a função `has_role()` desta migration (equivalente a `public.has_role` do
  Postgres). Validado localmente (MariaDB 10.11): `SET @current_usuario_id = ...`
  functiona corretamente escopado à conexão, e uma stored procedure lida com
  `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '...'` do mesmo jeito que
  `RAISE EXCEPTION` no Postgres — inclusive interrompe a procedure e é capturável
  pelo driver Node (`mysql2`) como erro.

  Importante: como o pool de conexões é compartilhado entre requisições, a variável
  precisa ser resetada (ou setada de novo) **toda vez** que uma conexão é retirada do
  pool para atender uma requisição — nunca reaproveitar uma conexão sem resetar
  `@current_usuario_id` primeiro. Isso é responsabilidade da camada de API (issue #53).

### 4. RLS (Row Level Security) → sem tabela com policy de SELECT direta
Sem RLS, nenhuma tabela pode ser exposta para leitura direta do MySQL a partir do
browser (nunca existiu essa possibilidade aqui de qualquer forma, já que não há
PostgREST/equivalente — toda leitura já teria que passar por uma rota do servidor
Node, issue #53). A regra do RLS ("quem pode ver o quê") deixa de viver como
`CREATE POLICY` e passa a viver como `WHERE` explícito dentro da query/rota
server-side que faz a leitura, replicando a mesma lógica de cada policy documentada
nas migrations do Postgres (issues #50, #51, #52 devem documentar, tabela a tabela,
qual era a policy original e onde a checagem equivalente foi implementada).

### 5. RPCs `SECURITY DEFINER` → stored procedures
Uma stored procedure MySQL com `DEFINER = <usuário de aplicação>` roda com os
privilégios desse usuário, análogo ao `SECURITY DEFINER` do Postgres. Nenhuma tabela
sensível recebe `GRANT INSERT/UPDATE/DELETE` para o usuário de aplicação — só
`GRANT EXECUTE` nas procedures, mesmo padrão do Postgres (onde a tabela não tinha
policy de escrita para `authenticated`, só a RPC escrevia).

### 6. Constraint adiável (balanceamento débito=crédito) → validação antes do INSERT
O Postgres usa uma `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` que checa,
no fim da transação, se soma de débito = soma de crédito por lançamento. MariaDB não
tem constraints adiáveis. Solução adotada (mais simples, e na prática mais segura:
falha *antes* de qualquer INSERT em vez de depois): a própria stored procedure
`registrar_lancamento_contabil` soma os valores de débito e crédito do array JSON
recebido **antes de inserir qualquer linha**, e recusa a operação inteira se as somas
não baterem. Validado localmente que uma stored procedure MariaDB consegue iterar um
array JSON com `WHILE` + `JSON_LENGTH`/`JSON_EXTRACT` sem problema.

Mantemos, ainda assim, uma view `v_auditoria_contabil_desbalanceados` equivalente à
do Postgres, como rede de segurança administrativa (issue #51).

### 7. Índice único parcial (`WHERE ... IS NOT NULL`) → coluna mantida explicitamente
MySQL/MariaDB não suporta índice único com predicado `WHERE`. A ideia inicial era usar
uma **coluna gerada** (`GENERATED ALWAYS AS (...) STORED`) que retorna `NULL`
exatamente nos casos em que o Postgres não aplicaria a restrição — só que, testado
localmente (MariaDB 10.11), uma coluna gerada com `CASE`/`IF` **não pode ser indexada**
(`ERROR 1901: Function or expression ... cannot be used in the GENERATED ALWAYS AS
clause`), mesmo em modo `VIRTUAL`. Uma coluna gerada simples (sem `CASE`/`IF`, só
referenciando outra coluna) pode ser indexada normalmente — a restrição é
especificamente sobre expressões condicionais.

Alternativa adotada (issue #50, tabela `gestoes`, e a repetir na issue #51 para
`lancamentos_recorrente_competencia_uniq`/dedupe do `ofx_lancamentos`): uma coluna
comum (não gerada), mantida explicitamente por quem escreve a linha — a própria
stored procedure de negócio (ex.: `ativar_gestao`) ou um trigger `BEFORE INSERT` que só
ajusta `NEW.*` (isso é permitido; a restrição de "trigger não pode fazer UPDATE na
própria tabela" só vale para instruções DML explícitas dentro do trigger, não para
atribuições a `NEW`). MySQL/MariaDB, como o Postgres, não considera múltiplos `NULL`
como duplicata em um índice único, então a garantia final é idêntica — só a forma de
manter a coluna atualizada que muda.

### 8. `updated_at` automático
Postgres precisou de uma função + trigger (`set_updated_at`) porque não tem suporte
nativo a "atualizar automaticamente no UPDATE". MySQL tem isso embutido na própria
coluna — simplificação, sem necessidade de trigger:

```sql
atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### 9. Edge Functions (Deno) → rotas Node.js
`consulta-cnpj` e `importar-ofx` deixam de ser Supabase Edge Functions e passam a
ser rotas do próprio servidor Node.js já publicado na Hostinger (issue #54). A lógica
de parsing (OFX/SGML, detecção de encoding) é JS puro e portável quase 1:1; só muda
o runtime (Deno → Node) e o cliente de banco (Postgres → MySQL).

## Variáveis de ambiente previstas (conexão fica para a issue #53)
Convenção reservada para quando a camada de aplicação existir — não commitar
valores reais, nunca em texto plano no repositório:

```
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_DATABASE=
MYSQL_USER=
MYSQL_PASSWORD=
```

## O que NÃO muda
- O desenho de domínio (quais tabelas existem, quais campos, as regras de negócio
  de cada RPC) é preservado — é uma migração de infraestrutura, não um redesenho de
  produto. Cada issue de schema (#50, #51, #52) faz a tradução tabela a tabela,
  procedure a procedure, documentando explicitamente qualquer divergência de
  comportamento.
