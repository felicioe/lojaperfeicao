-- Editor de agenda pública do site institucional (issue #367).
--
-- Decisão registrada na issue: a agenda pública continua 100% derivada de
-- `sessoes` (sem itens avulsos nesta v1) — o que faltava era só um jeito de
-- observar/curar cada item antes dele aparecer no site, sem misturar com
-- `sessoes.observacoes` (anotação interna, hoje já usada nas telas de
-- Sessões e nunca exposta em /api/publico/agenda de propósito).
--
-- `observacao_publica` é um campo SEPARADO de `observacoes`: o texto que a
-- secretaria digita pensando em quem já é irmão (ex.: detalhe ritualístico)
-- não é o mesmo que ela escreveria pensando num visitante do site.
-- `oculto_agenda_publica` permite tirar uma sessão específica do site sem
-- apagar o registro nem mexer na agenda interna.
ALTER TABLE sessoes
  ADD COLUMN observacao_publica MEDIUMTEXT NULL AFTER observacoes,
  ADD COLUMN oculto_agenda_publica BOOLEAN NOT NULL DEFAULT FALSE AFTER observacao_publica;
