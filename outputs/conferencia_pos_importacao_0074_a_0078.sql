-- Execute apenas este arquivo se o pacote consolidado terminou com o erro
-- #1109 envolvendo tronco_beneficencia_config e information_schema.
-- O erro ocorreu na conferencia, depois das alteracoes principais.

SET NAMES utf8mb4;
USE `u630316951_ado`;

SELECT 'pix_colunas' AS verificacao, COUNT(*) AS quantidade
FROM information_schema.columns
WHERE table_schema = 'u630316951_ado'
  AND table_name = 'contas_financeiras_pix'
  AND column_name IN ('pix_copia_cola', 'qr_code_url');

SELECT 'config_tronco' AS verificacao, COUNT(*) AS quantidade
FROM `u630316951_ado`.`tronco_beneficencia_config`;

SELECT 'faturas_sgcab' AS verificacao, COUNT(*) AS quantidade
FROM `u630316951_ado`.`sgcab_faturas`;

SELECT 'itens_catalogo_sgcab_2026' AS verificacao, COUNT(*) AS quantidade
FROM `u630316951_ado`.`sgcab_valores_catalogo`
WHERE ano = 2026;

SELECT 'sgcab_ainda_na_tabela_da_loja' AS verificacao, COUNT(*) AS quantidade
FROM `u630316951_ado`.`tabela_valores`
WHERE tipo LIKE 'sgcab\_%' ESCAPE '\\';

-- Esperado:
-- pix_colunas: 2
-- config_tronco: 1
-- itens_catalogo_sgcab_2026: 15 ou mais
-- sgcab_ainda_na_tabela_da_loja: 0
-- faturas_sgcab pode ser 0 enquanto nenhuma fatura gerencial for cadastrada.
