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
