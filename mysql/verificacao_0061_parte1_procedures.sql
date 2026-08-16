-- =========================================
-- VERIFICAÇÃO pós-migração 0061 — PARTE 1 de 2 — não altera nada, só
-- consulta. Rode este arquivo primeiro no phpMyAdmin (aba SQL/Importar),
-- depois rode verificacao_0061_parte2_dados.sql separadamente.
--
-- Usa SHOW CREATE PROCEDURE em vez de INFORMATION_SCHEMA.ROUTINES: em
-- hospedagem compartilhada (Hostinger etc.) o usuário do phpMyAdmin
-- costuma não ter permissão pra enxergar metadados de rotinas via
-- INFORMATION_SCHEMA mesmo sendo o dono/criador delas — a consulta
-- simplesmente não retorna linha nenhuma, o que NÃO significa que a
-- procedure esteja faltando. SHOW CREATE PROCEDURE é a forma padrão e
-- confiável de inspecionar uma rotina que você mesmo criou.
--
-- Rode cada SHOW CREATE PROCEDURE abaixo separadamente (clique em cada
-- um e "Executar", ou rode um de cada vez) e confira a coluna
-- "Create Procedure" do resultado:
--   - desfazer_conciliacao: tem que conter o texto "v_criado_pelo_evento"
--     (só existe na versão 0061). Se não tiver, ainda é a versão 0054.
--   - desfazer_lancamento_ofx: NÃO pode conter o texto "valor_pago = 0"
--     (isso indica a versão antiga, 0060). Se tiver, ainda é a versão 0060.
-- =========================================

SHOW CREATE PROCEDURE desfazer_conciliacao;

SHOW CREATE PROCEDURE desfazer_lancamento_ofx;
