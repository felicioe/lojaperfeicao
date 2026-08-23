-- =============================================================================
-- Migração 0107: tipo do Botton do catálogo SGCAB sem o ano no nome
-- (achado da auditoria geral de bugs)
--
-- sgcab_valores_catalogo já tem `ano` como coluna própria (UNIQUE KEY
-- (tipo, ano), migração 0078) exatamente pra permitir o mesmo `tipo`
-- valer por vários anos com valores diferentes. Só o Botton foi semeado
-- com o ano dentro do próprio `tipo` ('sgcab_boton_2026',
-- 'sgcab_boton_grau_13_2026' — migração 0076), e obterValoresFaturaSgcab
-- (sgcab.ts) monta esse literal com "2026" fixo no código, então em
-- qualquer ano diferente de 2026 o SELECT nunca casava linha nenhuma —
-- o item "Botton" saía da fatura SGCAB silenciosamente desativado
-- (valor 0), sem erro nenhum pro secretário. A partir de 2027 isso
-- quebraria todo ano.
--
-- Corrige o dado (renomeia o tipo, mantendo ano/valor/vigência intactos)
-- para o mesmo padrão sem ano dos demais itens do catálogo. O código que
-- lê (sgcab.ts) muda junto, nesta mesma leva de correções.
-- =============================================================================

UPDATE sgcab_valores_catalogo SET tipo = 'sgcab_boton' WHERE tipo = 'sgcab_boton_2026';
UPDATE sgcab_valores_catalogo SET tipo = 'sgcab_boton_grau_13' WHERE tipo = 'sgcab_boton_grau_13_2026';
