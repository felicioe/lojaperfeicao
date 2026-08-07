# Preferências do usuário (sempre válidas, em qualquer sessão)

## Idioma

Responder e se comunicar **sempre em português do Brasil (pt-BR)**, em qualquer
interação — mensagens de chat, resumos, perguntas de esclarecimento etc.
Comentários de código e nomes de identificadores seguem o padrão já usado no
projeto (também majoritariamente em português).

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
