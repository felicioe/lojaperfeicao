-- issue #690 — notícias restritas a Irmãos (área autenticada do site,
-- brainstorm iniciado na issue #689). Até aqui toda notícia com
-- status='publicado' ficava visível a qualquer visitante anônimo
-- (noticias-publica.ts); algumas precisam ficar visíveis só a quem está
-- logado no site.
--
-- Mesmo padrão de status: ENUM com DEFAULT explícito, nunca muda o
-- comportamento de notícia já publicada até alguém decidir isso na tela de
-- edição.
ALTER TABLE noticias
  ADD COLUMN visibilidade ENUM('publica', 'restrita') NOT NULL DEFAULT 'publica' AFTER status;
