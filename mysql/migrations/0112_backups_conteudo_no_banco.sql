-- O backup agendado (issue #85) gravava o dump em disco, fora de public/
-- (BACKUPS_DIR = process.cwd()/backups) — a tabela só guardava metadados,
-- e o download lia o arquivo. Igual ao QR Code Pix antes da migração 0108:
-- a Hostinger reconstrói o projeto do zero a cada deploy (git clone +
-- build), e essa pasta não é parte do código versionado nem do banco, então
-- some a cada deploy — o histórico de backups na tela continuava mostrando
-- linhas "concluídas" cujo arquivo real já não existia mais, e "Baixar"
-- falhava silenciosamente pra qualquer backup anterior ao deploy mais
-- recente.
--
-- Guarda o conteúdo na própria linha a partir de agora. LONGTEXT (não
-- MEDIUMTEXT como o QR Code): um dump completo de todas as tabelas de uma
-- Loja tende a crescer mais que uma imagem, e a folga de LONGTEXT (até 4 GB)
-- custa nada extra no schema. NULL nos registros já existentes: o arquivo
-- deles já não existe em disco (mesmo motivo desta migração), então não há
-- conteúdo pra migrar — baixarBackup passa a avisar disso em vez de falhar
-- com erro técnico de arquivo não encontrado.
ALTER TABLE backups_gerados
  ADD COLUMN conteudo LONGTEXT NULL AFTER tamanho_bytes;
