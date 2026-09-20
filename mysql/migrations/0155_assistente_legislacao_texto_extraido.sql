-- Achado #648 — assistente de IA sobre a Legislação cadastrada. Guarda o
-- texto extraído do PDF de cada documento (documentos.arquivo_url é a
-- versão binária em base64, não pesquisável) para não reprocessar o mesmo
-- PDF com pdf-parse a cada pergunta feita ao assistente — extração roda uma
-- vez, sob demanda, na primeira pergunta que usar aquele documento como
-- candidato, e o resultado fica em cache aqui.
ALTER TABLE documentos
  ADD COLUMN texto_extraido MEDIUMTEXT NULL AFTER conteudo;
