-- Achado #657 — assistente de IA sobre a Biblioteca de Peças (mesma ideia
-- da #648/migração 0155, agora pra pecas_arquitetura). Cache do texto
-- extraído do PDF de cada peça, pra não reprocessar com pdf-parse a cada
-- pergunta — extração roda uma vez, sob demanda, na primeira pergunta que
-- usar aquela peça como candidata.
ALTER TABLE pecas_arquitetura
  ADD COLUMN texto_extraido MEDIUMTEXT NULL AFTER resumo;
