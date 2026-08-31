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

- `npm run checar:escopo-loja` ainda lista 8 pendências históricas:
  - `src/lib/backend/saas-super-admins.ts` — 5;
  - `src/lib/backend/saas-lojas.ts` — 2;
  - `src/lib/backend/relatorio-exportacao.ts` — 1.
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
