# Preferências do usuário (sempre válidas, em qualquer sessão)

## Idioma

Responder e se comunicar **sempre em português do Brasil (pt-BR)**, em qualquer
interação — mensagens de chat, resumos, perguntas de esclarecimento etc.
Comentários de código e nomes de identificadores seguem o padrão já usado no
projeto (também majoritariamente em português).

## Hospedagem e deploy — só Hostinger

O sistema roda **exclusivamente na Hostinger**. O deploy é a Hostinger puxando
do GitHub e rodando o build ela mesma, num Node normal (ver `nitro.preset =
"node-server"` no `vite.config.ts`), e as variáveis de ambiente ficam no painel
Node.js da Hostinger — arquivo `.env` não é lido em produção.

**Nunca sugerir publicar, deployar ou hospedar no Lovable**, nem tratar o
Lovable como destino de nada. O pacote `@lovable.dev/vite-tanstack-config` é só
uma dependência de configuração do Vite herdada do início do projeto; a
presença dele não significa que o Lovable faça parte do fluxo de deploy.

## Forma de trabalho para conjuntos de novas funcionalidades

Quando o usuário pedir várias funcionalidades novas de uma vez (ex.: a partir
de um brainstorm, "implementa tudo isso aí"), **não implementar tudo junto**.
Em vez disso:

1. Criar uma **issue no GitHub por funcionalidade**, seguindo o padrão já
   usado no repositório: título `[Categoria] Nome curto` (categorias comuns:
   `[Programa]`, `[Infra]`, `[Segurança]`, `[Portal]`) e corpo com seções
   `## Contexto`, `## Escopo` e, quando houver algo que dependa de decisão do
   usuário antes de começar, `## Decisões em aberto`.
2. Implementar **uma issue de cada vez**, devagar, com **uma PR separada por
   issue** — nunca uma PR gigante cobrindo várias funcionalidades.
3. Antes de começar a próxima, confirmar com o usuário qual issue ele quer
   que seja a próxima (a menos que ele já tenha indicado a ordem).

## Validação obrigatória antes de considerar uma issue pronta

Sempre seguir os padrões já adotados no projeto (schema de migração
sequencial em `mysql/migrations/`, `createServerFn` + `comSessao`/`comPapel`
pra autorização, componentes shadcn/ui já usados nas telas existentes) e
sempre validar de verdade antes de dar por concluído:

1. `npx tsc --noEmit` e `npx eslint` limpos (sem regressão nos arquivos
   tocados).
2. `npx vite build` sem erros — e, quando a mudança envolver algo que possa
   vazar código server-only pro bundle do cliente (como já aconteceu com o
   passkey), inspecionar o build de produção real, não só o dev server.
3. Testar o fluxo ao vivo (Playwright contra o dev server, com
   screenshot/assert do resultado), não só confiar nos checks estáticos.

## Handoff operacional — recuperação de produção em 2026-08-30/31

### Correção do ícone PWA em 2026-08-31

- O manifesto do sistema apontava para `public/icons/icon-192.png`, que em
  produção renderizava somente um círculo branco e permitia a reutilização do
  ícone antigo do Lovable armazenado pelo aparelho.
- A marca institucional foi rasterizada corretamente em 192 px e 512 px, com
  variante `maskable`, usando nomes versionados `sglfm-app-v2-*`.
- `public/manifest.json`, o favicon, o `apple-touch-icon`, as notificações e o
  precache do service worker agora usam exclusivamente os novos arquivos.
- O cache do service worker passou de `loja-cache-v1` para `loja-cache-v2` para
  descartar os ícones antigos.
- Validação local: inspeção visual dos PNGs, ESLint limpo no arquivo alterado e
  `npm run build` concluído sem erros.

Estado confirmado após a recuperação:

- `https://sistema.associacaoadonhiramita.org/` voltou a responder `200 OK`.
- `https://sistema.associacaoadonhiramita.org/api/health` voltou a responder
  `200 OK` com `{"ok":true,"service":"lojaperfeicao",...}`.
- `https://sistema.associacaoadonhiramita.org/auth` voltou a responder
  `200 OK`.
- `https://sistema.associacaoadonhiramita.org/manifest.json` voltou a responder
  `200 OK`.
- `https://associacaoadonhiramita.org/`, `www`, `/agenda`, `/publicacoes` e
  `/contato` foram testados e responderam `200 OK`.

Commits relevantes publicados em `main`:

- `c971ef6 fix: relax hostinger node build guard`
- `f2d5930 chore: clean obsolete facebook audit exceptions`
- `57f16f7 chore: trigger production redeploy`
- Base anterior vinda do Claude/GitHub: `593a4e4` (`Merge pull request #394`)

Causa operacional observada:

- O subdomínio `sistema...` estava em `504 Gateway Time-out` porque o processo
  Node da Hostinger não estava saudável e os builds disparados em 2026-08-30
  falharam/travaram antes da correção.
- Os logs/restart/upload da API Hostinger chegaram a retornar `503`, então a
  validação confiável foi feita por status de build + HTTP real em produção.
- Após relaxar o guard de Node para aceitar Node 22.x e definir
  `engine-strict=false`, o build Hostinger
  `01a05523-ed5a-72d9-9cc9-de3924eb2578` completou e produção voltou.

Validações locais executadas antes da publicação:

- `npm run build`
- `npm run verificar:cms`
- `npm run checar:escopo-loja`
- `npx tsc --noEmit`

CMS:

- O script `npm run verificar:cms` confirmou:
  - rotas administrativas localizadas;
  - loaders públicos localizados;
  - migrações do CMS localizadas;
  - endpoints públicos e healthcheck localizados.
- A migração relevante do CMS no estado atual é
  `mysql/migrations/0121_editor_aprovador_cms.sql`.

Pendências conhecidas que não foram a causa do 504:

- ~~`npm run checar:escopo-loja` ainda lista 8 pendências históricas~~ — resolvido no
  commit `a4756b6` (2026-09-03, "documentar exceções de escopo multi-loja como
  revisadas"): as 8 ocorrências em `saas-super-admins.ts` (5), `saas-lojas.ts` (2) e
  `relatorio-exportacao.ts` (1) foram revisadas e documentadas como exceções legítimas
  (consultas sobre o próprio super-admin/comparação entre lojas, não dado de uma loja
  específica) no próprio `scripts/checar-escopo-loja.mjs`. Confirmado em 2026-09-06: o
  script reporta 0 pendentes.
- `npm run checar:defaults-loja-id` não roda neste Windows local sem o binário
  `mariadb` disponível (`spawnSync mariadb ENOENT`).

Cuidados para continuar:

- Não fazer `rebase`, `amend`, `squash` ou `force push` em commits já
  publicados; o projeto é conectado ao Lovable e o histórico publicado deve ser
  preservado.
- Preferir PRs por funcionalidade. Se for hotfix de produção autorizado pelo
  usuário, pode publicar direto em `main`, mas registrar o motivo.
- Antes de declarar produção saudável, sempre testar HTTP real no domínio, não
  apenas build local.

### Migrações 0123–0125 pendentes aplicadas em 2026-09-05

- Sintoma: `sistema.associacaoadonhiramita.org/` respondia 200 e `/api/health`
  ficava OK (por isso o handoff de 2026-08-30/31 deu como "recuperado"), mas
  depois do login o app quebrava com tela em branco. Console mostrava
  `Error: Table 'u630316951_ado.preferencias_menu_usuario' doesn't exist`.
- Causa: as migrações `0123_menu_itens_ocultos_loja.sql`,
  `0124_usuario_menu_ocultos.sql` e `0125_favoritos_menu_usuario.sql`
  (features de menu dos commits #456–#460) nunca tinham sido aplicadas no
  banco de produção `u630316951_ado`, embora o código publicado já esperasse
  a coluna `lojas.menu_itens_ocultos_json` e a tabela
  `preferencias_menu_usuario`. Mesma classe de incidente já documentada em
  `src/lib/backend/db.ts` (`BancoDesatualizadoError`) sobre a migração 0092.
- Não existe tabela de controle de migração aplicada nem migração automática
  no deploy da Hostinger — é sempre processo manual via phpMyAdmin
  (`hosting_getPhpMyAdminLinkV1` do MCP da Hostinger, banco
  `u630316951_ado`, host `srv1898.hstgr.io`).
- Correção: as 3 migrações foram aplicadas diretamente em produção via
  phpMyAdmin. Validado ao vivo: login funcionando, `/dashboard`,
  `/conta/menu` (favoritar item, salvar, recarregar, ver grupo "Favoritos" no
  menu, remover o favorito de teste) sem erros de console.
- Lição para o futuro: depois de qualquer deploy que inclua migração nova em
  `mysql/migrations/`, checar se ela foi aplicada em produção antes de dar o
  deploy por concluído — `npm run build` + HTTP 200 na home não garantem
  schema em dia, porque o erro só aparece depois do login em rotas que usam
  a tabela/coluna nova.

### Migrações 0157–0160 aplicadas em 2026-09-21 (newsletter/jornal/comentários de notícias)

- Contexto: conjunto de funcionalidades autorizado numa única sessão (issues
  #662–#665, brainstorm de comunicação por e-mail/jornal/comentários em
  notícias), implementado uma PR por issue, seguindo a forma de trabalho
  padrão deste projeto.
- Migrações aplicadas em produção via phpMyAdmin (banco `u630316951_ado`,
  host `srv1898.hstgr.io`), nesta ordem:
  1. `0157_noticias_imagem_anexo.sql` (#662, PR #667) — imagem de capa e
     anexo (PDF/imagem) em `noticias`.
  2. `0158_edicoes_jornal.sql` (#665, PR #669) — cria `edicoes_jornal`
     (snapshot imutável de cada edição do "jornalzinho").
  3. `0159_filas_email_tipo_noticia_jornal.sql` (#663/#665, PR #669) —
     amplia o ENUM `filas_email.tipo` com `noticia_publicada` e
     `edicao_jornal`; também corrige `interstico_completo`, que já estava em
     uso no código (`enviarEmailIntersticioCompleto`) sem nunca ter passado
     por uma migração de ENUM — achado durante esta mesma sessão, não um
     incidente à parte.
  4. `0160_noticias_comentarios.sql` (#664, PR #670) — cria
     `noticias_comentarios`.
- Código correspondente já estava publicado em `main` antes da aplicação das
  migrações (PRs #667/#668/#669/#670 mesclados primeiro) — mesma ordem
  seguida no handoff de 2026-08-30/31, evitando o incidente das migrações
  0123–0125 (código publicado esperando schema que ainda não existia).
- Validação local antes da publicação de cada PR: `npx tsc --noEmit`,
  `npx eslint`, `rm -rf .output && npx vite build` (com checagem manual de
  que `.output/client/` não carrega `nodemailer` nem nenhuma função
  server-only nova). Sem banco local disponível nesta sessão — nenhum dos
  fluxos foi testado ao vivo no navegador antes do merge; ver cada PR
  (#667–#670) para o roteiro de verificação manual recomendado.
- Pendente: validar ao vivo em produção depois do próximo deploy —
  publicar notícia com imagem, enviar por e-mail (prévia + confirmação),
  montar e publicar uma edição do jornal (`/jornal`, `/jornal/:numero`),
  comentar como Irmão logado e testar moderação (ocultar/reexibir) como
  editor_cms/super_admin.

### Upgrades de dependência com CVE em 2026-09-21

- `@tiptap/*` (core/starter-kit/react/pm/extension-link) `2.27.2` → `3.31.3`
  (issue #642, PR #671) — corrige poluição de protótipo em
  `mergeAttributes()`. Duas breaking changes tratadas em
  `RichTextEditor.tsx`: `setContent(html, false)` virou
  `setContent(html, { emitUpdate: false })`; o `StarterKit` da v3 passou a
  registrar `link` e `underline` por padrão (não existiam na v2) — ambos
  desativados explicitamente (`link: false`, `underline: false`) pra não
  duplicar a extensão de link própria nem introduzir uma formatação
  (sublinhado) que não está na allowlist de `sanitizarRichTextPublico`.
- `uuid` forçado para `^11.1.1` via `overrides` do npm, só dentro da árvore
  do `exceljs` (issue #643, PR #672) — `exceljs@4.4.0` é a versão mais
  recente publicada e ainda depende de `uuid@^8.3.0` (vulnerável); não há
  update do `exceljs` que resolva isso sozinho. `npm audit` confirma 0
  vulnerabilidades depois da mudança; testado com geração real de uma
  planilha `.xlsx` via `ExcelJS.Workbook`.
- Issues #649 (Pix Automático) e #650 (Open Finance), do mesmo brainstorm
  original, ficaram de fora de propósito — bloqueadas por decisão de
  negócio, não implementadas nesta sessão.

### Migrações 0161–0162 aplicadas em 2026-09-21 (área autenticada do site)

- Contexto: brainstorm "área restrita do site" (issues #689–#692) — login
  do site com redirect de volta (#689, sem migração), notícia restrita a
  Irmãos (#690), Agenda pública passa a exigir login (#691, sem migração)
  e página do CMS (a começar pela "Publicações") pode ser marcada restrita
  (#692). Uma PR por issue, seguindo a forma de trabalho padrão do
  projeto.
- Migrações aplicadas em produção via phpMyAdmin (banco `u630316951_ado`,
  host `srv1898.hstgr.io`), nesta ordem:
  1. `0161_noticias_visibilidade.sql` (#690, PR #694) — `noticias` ganha
     `visibilidade ENUM('publica','restrita')`, default `'publica'`.
  2. `0162_paginas_site_restrita.sql` (#692, PR #696) — `paginas_site`
     ganha `restrita BOOLEAN`, default `FALSE`, com `UPDATE` marcando a
     página de slug `publicacoes` como restrita (idempotente — não erra
     se essa página ainda não existisse em produção nesse momento).
- Código correspondente já estava publicado em `main` antes da aplicação
  das migrações (PRs #693–#696 mesclados primeiro), mesma ordem sempre
  seguida neste projeto pra evitar o incidente das migrações 0123–0125
  (código publicado esperando schema que ainda não existe).
- Validação local antes da publicação de cada PR: `npx tsc --noEmit`,
  `npx eslint`, `rm -rf .output && npx vite build` (com checagem manual de
  que `.output/public/assets/` não carrega `mysql2`/`withLojaConnection`/
  `SESSION_SECRET`), mais teste ao vivo contra
  `node .output/server/index.mjs` pra confirmar o comportamento de rotas
  que não dependem de banco (redirect de login, gate de sessão nas rotas
  `/agenda` e `/`). Sem banco local nesta sessão — o fluxo completo com
  dado real (criar notícia/página restrita, ver sumir/pedir login) não foi
  testado ao vivo antes do merge.
- Pendente: validar ao vivo em produção depois do próximo deploy — marcar
  uma notícia como restrita e conferir que some da listagem/link direto
  pra visitante anônimo; marcar/desmarcar a página "Publicações" e
  conferir a tela de login; conferir que `/agenda` pede login e que, ao
  entrar por `/auth?redirect=...`, o Irmão volta pra página que queria ver
  em vez de cair no dashboard.
