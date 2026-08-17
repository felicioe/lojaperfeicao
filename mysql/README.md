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
- Aplicar em ordem, uma vez, via
  `mysql --default-character-set=utf8mb4 -u <user> -p <banco> < mysql/migrations/000N_*.sql`.
  **A flag `--default-character-set=utf8mb4` não é opcional**: o cliente `mysql` usa
  `latin1` como charset padrão de conexão se nada for especificado — isso não afeta
  texto ASCII simples, mas qualquer literal com acento dentro do `.sql` (mensagens de
  `SIGNAL ... MESSAGE_TEXT`, nomes de conta no seed do plano de contas etc.) é
  interpretado como `latin1` na hora do `CREATE PROCEDURE`/`INSERT`, fica **gravado
  errado de forma permanente** (mojibake, ex.: "Já existe" vira "JÃ¡ existe" quando lido
  de volta) e só se percebe rodando a aplicação de verdade. Descoberto durante a
  validação da issue #49 (`criar_usuario`, veja seção 11). Banco criado (`CREATE
DATABASE`) e usuário de aplicação também devem usar `utf8mb4`
  (`CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`).
  Não existe (ainda) uma ferramenta de migração automatizada tipo Supabase CLI — isso
  é left para quando o cliente MySQL do app (issue #53) estiver pronto; por ora, é
  aplicação manual mesmo, como o próprio projeto legado em PHP fazia.

### ⚠️ Nunca aplicar migração em produção antes de implantar o código correspondente

O deploy de produção (Hostinger) só implanta a partir de `main` — uma migração
aplicada direto no banco de produção enquanto o código correspondente ainda está
numa branch de feature deixa o app rodando (código velho) contra um schema novo, o
que quebra em produção (ex.: `INSERT`/`SELECT` com coluna que virou tipo diferente).
Isso aconteceu de verdade: migrações 0019–0022 foram aplicadas em produção antes do
PR #66 (que trazia o código correspondente) ser mesclado em `main`, derrubando o
site até o merge acontecer. Ordem correta: mesclar o PR em `main` **primeiro**,
confirmar que o deploy do Hostinger pegou o código novo, **depois** aplicar a
migração — ou, se a migração precisa rodar antes por algum motivo, mesclar e
implantar o código na sequência imediatamente, sem deixar o banco "à frente" do
código implantado por mais que o tempo de um deploy.

#### A exceção: migrações que o código novo **exige** (caso da 0092)

A regra acima vale para migrações que o código velho tolera. A 0092
(multi-tenant) é do tipo oposto: o código que veio com ela **não roda** sem ela.
Toda requisição autenticada executa
`SET @current_loja_id = (SELECT loja_id FROM usuarios WHERE id = ?)` e
`comSessao`/`comPapel` recusam usuário sem loja — num banco sem a 0092 isso é
erro de SQL em toda requisição, e nenhuma tela carrega.

Isso também aconteceu de verdade: o merge `1ecc1fc` (16/08/2026) foi implantado
com o banco de produção ainda sem a 0092 e derrubou o site; `6f26753` reverteu
`main` para restabelecer o serviço. Para migrações desta categoria a ordem se
inverte — **migração primeiro, código depois** —, e é justamente por isso que os
`DEFAULT` transitórios de `loja_id` existem: com a 0092 aplicada e o código
antigo ainda no ar, tudo continua funcionando (o INSERT sem loja cai na loja
seed). A janela segura é essa; o inverso não tem janela nenhuma.

Antes de mesclar código que dependa de uma migração assim, rodar
`mysql/prontidao_multitenant.sql` **contra o banco de produção** e conferir que
toda linha voltou `OK`. É verificação de pré-deploy: roda em banco que nunca viu
a 0092 sem dar erro (a etapa 1 só lê `information_schema`), ao contrário de
`mysql/verificacao_0092.sql`, que confere a migração já aplicada.

## Decisões de arquitetura (equivalentes ao que o Postgres/Supabase dava de graça)

### 1. UUIDs

Postgres: `gen_random_uuid()`. MySQL/MariaDB (10.10+, testado em 10.11 — a mesma
versão majoritariamente usada em hospedagem compartilhada, inclusive Hostinger):
`UUID()` funciona como _default expression_ em coluna `CHAR(36)`:

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
falha _antes_ de qualquer INSERT em vez de depois): a própria stored procedure
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

### 10. Chamar uma procedure com parâmetro JSON a partir do driver (`mysql2`)

Validado com o driver real (`mysql2`) contra um MariaDB 10.11 local: **`CAST(... AS
JSON)` não é sintaxe válida no MariaDB** — `JSON` ali é só um alias de `LONGTEXT` com
uma constraint de validação, não um tipo de destino reconhecido por `CAST`
(`SELECT CAST('[{"a":1}]' AS JSON)` já falha sozinho, sem nenhum parâmetro
envolvido). Ao chamar uma procedure com parâmetro `IN ... JSON` a partir do Node
(`conn.query("CALL proc(?, ?, ...)", [..., JSON.stringify(itens), ...])`), **não**
envolva o placeholder em `CAST(? AS JSON)` — passe a string (via `JSON.stringify`)
direto como um parâmetro normal; o próprio parser aceita a string onde o parâmetro é
tipado `JSON`. Isso não afeta nada dentro das stored procedures em si (elas usam
`JSON_EXTRACT`/`JSON_LENGTH` normalmente sobre o valor recebido) — é só uma
convenção de chamada que a camada de API (issue #53) precisa seguir.

Também confirmado ponta a ponta com o driver real: o padrão de `SET
@current_usuario_id = ?` a cada conexão retirada do pool + `CALL procedure(...)` +
`SELECT @out_param` para ler o `OUT` funciona exatamente como esperado, incluindo
`has_role()` reconhecendo a variável de sessão setada pelo driver.

### 12. `mysql2` não devolve BOOLEAN/DATE no formato que o app espera — achado na revisão da issue #53

Bug real, confirmado contra MariaDB local (não hipotético): por padrão, o driver
`mysql2` devolve toda coluna `BOOLEAN`/`TINYINT(1)` como **number** (`0`/`1`), não
como `boolean` do JS (`SELECT ativo FROM potencias` devolvia `{ativo: 1}`,
`typeof 1 === "number"`) — apesar dos tipos TypeScript de `src/lib/backend/*.ts`
declararem `boolean`. O mesmo vale para colunas `DATE`/`DATETIME`/`TIMESTAMP`: por
padrão viram objeto `Date` do JS, que ao serializar (JSON, resposta de
`createServerFn`) vira uma string ISO com hora e fuso embutidos
(`"2026-01-10T00:00:00.000Z"`), não a string simples `"2026-01-10"` que o
front-end (inputs `type="date"`, `fmtDate()`) sempre esperou (mesmo formato que o
Postgres/Supabase devolvia).

Corrigido de uma vez para toda a aplicação em `src/lib/backend/db.ts`, na
configuração do pool:

```ts
mysql.createPool({
  // ...
  dateStrings: true, // DATE/DATETIME/TIMESTAMP como string 'YYYY-MM-DD[ HH:MM:SS]'
  typeCast(field, next) {
    if (field.type === "TINY" && field.length === 1) return field.string() === "1";
    return next();
  },
});
```

Validado ponta a ponta (irmão com `fundador`/`benemerito`, sessão+presença, todos
batendo `boolean`/string plana corretos após a mudança). Como é configuração do
pool, vale para toda query feita a partir de agora — não precisa (e não deve)
`!!coluna` manualmente em cada função nova.

### 13. Preset do Nitro (build) — RESOLVIDO

`vite.config.ts` não definia `nitro.preset` explicitamente, e o preset padrão do
`@lovable.dev/vite-tanstack-config` quando nenhum é informado é `cloudflare-module`
(edge/Workers) — visto no próprio pacote (`defaultPreset: "cloudflare-module"`).
Um runtime de edge desse tipo **não tem `node:fs` gravável nem suporta socket TCP
cru** (o que `mysql2` usa para falar com o MySQL) — isso faria tanto
`src/lib/backend/db.ts` (toda a camada MySQL) quanto `uploadFotoIrmao` (grava em
`public/uploads/...` via `node:fs/promises`) simplesmente não funcionarem em
produção.

Confirmado com o usuário que o deploy real é o Hostinger puxando do GitHub e
rodando o build ele mesmo (fora do sandbox do Lovable), num Node comum. Corrigido
fixando `nitro: { preset: "node-server" }` em `vite.config.ts`. Validado com
`npm run build` real (exit 0, `.output/nitro.json` confirma
`"preset": "node-server"` e `.output/server/index.mjs` gerado com `mysql2`
empacotado) e com um deploy de teste publicado com sucesso via Hostinger.

Nesta mesma validação foi encontrado e corrigido um segundo bug de build,
independente do preset: o TanStack Start proíbe, por padrão, que qualquer
arquivo dentro de uma pasta chamada literalmente `server/` (checado só pelo
caminho, `**/server/**`, não pelo conteúdo) seja importado por código que chega
ao bundle do navegador. Como nenhuma rota deste app tem code-splitting
automático habilitado, toda página importa suas server functions diretamente
no topo do arquivo — e isso derrubava o build inteiro (confirmado: parava no
primeiro arquivo da árvore de rotas, e continuava no próximo assim que o
anterior era corrigido). Resolvido renomeando `src/lib/server/` para
`src/lib/backend/` e ajustando os ~40 imports afetados em todo o projeto.

### 14. Checklist de corte de produção (issue #55)

Confirmado com o usuário: o projeto ainda não tem dado real de uso em produção
no Supabase, então **não há etapa de migração de dados** (exportar Postgres →
importar MySQL) — o corte é só de configuração e troca de fonte de verdade.

1. **Variáveis de ambiente no Node.js da Hostinger** (hPanel → seu app Node.js
   → variáveis de ambiente — nunca commitadas em `.env`, ver `.env.example` na
   raiz do repositório para a lista completa):
   - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
     — credenciais do banco MySQL já provisionado na Hostinger.
   - `SESSION_SECRET` — string aleatória de 32+ caracteres, gerada só para
     produção (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
     nunca reaproveitando a de desenvolvimento local.
   - `NODE_ENV=production` — habilita o cookie de sessão com `secure: true`
     (exige HTTPS).
   - `MYSQL_CONNECTION_LIMIT` — ver item 2 abaixo.
2. **Tamanho do pool de conexões**: `src/lib/backend/db.ts` lê
   `MYSQL_CONNECTION_LIMIT` do ambiente (default 5 se não setada). Hospedagem
   compartilhada tem um limite baixo de conexões MySQL concorrentes — confirme
   o limite real do plano em hPanel antes de aumentar esse valor. Comece
   conservador; é seguro aumentar depois de validado, não é seguro descobrir o
   limite em produção sob carga real.
3. **Teste de carga básico**: `mysql/load-test.mjs` dispara N requisições
   concorrentes contra o banco configurado nas mesmas env vars da aplicação e
   reporta sucesso/falha e latência (p50/p95/máx). Rodar **contra o MySQL real
   da Hostinger**, não só localmente, antes do corte definitivo:
   ```
   MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=... \
   MYSQL_CONNECTION_LIMIT=5 CONCURRENCY=20 REQUESTS=200 node mysql/load-test.mjs
   ```
   Se aparecer erro de limite de conexões, reduza a concorrência esperada da
   aplicação ou peça um limite maior à Hostinger — nunca configure
   `MYSQL_CONNECTION_LIMIT` acima do que o plano realmente permite.
4. **Corte do domínio**: com 1–3 validados, apontar o domínio publicado (deploy
   via GitHub já configurado e testado na Hostinger, branch `main`) para esta
   versão. Depois de confirmado que está tudo funcionando em produção real,
   desativar/arquivar o projeto Supabase.

### 15. Multi-tenant: escopo de loja (issues #336/#337)

O sistema virou SaaS: cada loja (tenant) é uma linha em `lojas`, e toda tabela
de negócio tem `loja_id` (migração 0092). A regra de ouro é que **nenhuma
query pode rodar sem escopo de loja** — esquecer um filtro é vazamento de
dados entre lojas, não um bug cosmético.

**Como o escopo chega no banco.** `withUserConnection()` (`db.ts`), no mesmo
checkout de pool onde já setava `@current_usuario_id`, também seta
`@current_loja_id` — **derivado do próprio usuário** (`usuarios.loja_id`), não
recebido por parâmetro. Duas consequências importantes:

1. a loja do contexto nunca pode divergir de quem está autenticado, porque
   ninguém "passa" a loja — ela é lida do usuário;
2. toda query escopa com `loja_id = @current_loja_id`, que é SQL puro. Não foi
   preciso mudar a assinatura de nenhuma das ~350 server functions nem
   carregar a loja por parâmetro através de dez camadas.

Para trabalho sem usuário autenticado que ainda assim pertence a uma loja
(crons, fila de e-mail, agenda pública — issue #341), existe
`withLojaConnection(lojaId, fn)`, que diz a loja explicitamente. Sem usuário e
sem loja explícita, `@current_loja_id` fica NULL e as queries escopadas não
retornam nada — falha fechada, que é o comportamento desejado.

**Onde o acesso é barrado.** `comSessao`/`comPapel` (`authz.ts`) resolvem a
loja numa única query que também checa `deve_trocar_senha` e
`senha_alterada_em` (antes eram dois SELECTs separados; agora é um só, então o
multi-tenant saiu de graça em número de idas ao banco). Usuário sem loja e
loja inativa são recusados ali. Além disso, `carregarUsuarioComPapeis()`
(`usuario-sessao.ts`) devolve `null` quando a loja está inativa — como todos
os caminhos de login (senha, passkey, 2FA, Google, Facebook) terminam nessa
função, isso barra o login e derruba sessões já abertas na próxima navegação,
com uma única checagem.

**Login e identificadores.** `email`, `google_id` e `facebook_id` passaram a
ser únicos **por loja**, então uma busca por identificador pode casar em mais
de uma linha. `usuarioUnicoParaLogin()` (`login-loja.ts`) recusa nesse caso em
vez de escolher a primeira — autenticar alguém numa loja arbitrária seria o
pior tipo de bug possível aqui. Quando a resolução por subdomínio entrar
(issue #338), a busca passa a ser filtrada pela loja do subdomínio e a
ambiguidade deixa de existir na origem.

**Como isso é garantido de verdade.** `npm run checar:escopo-loja` lê a lista
de tabelas multi-tenant direto da migração 0092 (fonte única — tabela nova com
`loja_id` é aprendida sozinha), extrai todo SQL do backend e reprova qualquer
statement que toque uma tabela multi-tenant sem se referir a `loja_id`. As
poucas exceções legítimas (buscas de login, que por definição acontecem antes
de existir loja no contexto) estão numa lista com o motivo escrito, e o
próprio script reprova exceção que ficou órfã — uma exceção que não casa mais
com nenhuma query dá falsa sensação de cobertura revisada. Rodar isso é mais
confiável que revisar ~420 statements no olho, e continua valendo para a
próxima query que alguém escrever.

### 11. Autenticação e sessão (issue #49) — implementado

`src/lib/backend/db.ts` traz o pool real (`mysql2/promise`, `charset: "utf8mb4"`
explícito — ver seção acima sobre o gotcha do charset) e `withUserConnection()`,
que encapsula exatamente o padrão validado na seção 10 (checkout do pool + `SET
@current_usuario_id` + devolução ao pool no `finally`).

`src/lib/backend/session.ts` usa o sistema de sessão **já embutido** no TanStack
Start (`getSession`/`updateSession`/`clearSession` de
`@tanstack/react-start/server`) — cookie assinado/selado automaticamente, sem
precisar de JWT nem biblioteca de cookie própria. Precisa de `SESSION_SECRET`
(mín. 32 caracteres) no ambiente.

`src/lib/backend/auth.ts` expõe `login`/`signup`/`logout`/`getSessao`/`contarUsuarios`
como `createServerFn`. Só `signup` é uma escrita de mais de uma linha
(`usuarios` + `usuarios_papeis`), então vira a stored procedure `criar_usuario`
(`mysql/migrations/0006_autenticacao.sql`), com o mesmo padrão de transação
própria das demais procedures multi-escrita. `login`/`getSessao` são só
`SELECT` — comparação de senha com `bcryptjs` acontece inteiramente na camada
de aplicação, nunca no banco.

Preservado o comportamento do trigger Postgres `handle_new_user()`: signup
nunca é bloqueado no banco; o primeiro usuário do sistema (`usuarios_papeis`
vazia) vira `admin` automaticamente, os demais viram `irmao`. Validado
ponta a ponta com `mysql2` real: primeiro signup → admin, segundo → irmao,
login certo/errado, e-mail inexistente, e-mail duplicado — todos os casos
retornam o resultado esperado.

## Variáveis de ambiente

Implementado — ver `.env.example` na raiz do repositório para a lista completa
e comentada, e a seção 14 acima para o checklist de configuração em produção.
Nunca commitar valores reais (`.env` está no `.gitignore`).

## O que NÃO muda

- O desenho de domínio (quais tabelas existem, quais campos, as regras de negócio
  de cada RPC) é preservado — é uma migração de infraestrutura, não um redesenho de
  produto. Cada issue de schema (#50, #51, #52) faz a tradução tabela a tabela,
  procedure a procedure, documentando explicitamente qualquer divergência de
  comportamento.
