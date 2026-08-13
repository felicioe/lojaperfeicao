-- ================================================================
-- SEPARA O CATALOGO SGCAB DA TABELA DE VALORES DA LOJA
-- ================================================================

CREATE TABLE IF NOT EXISTS sgcab_valores_catalogo (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  ano INT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL,
  vigencia_inicio DATE NOT NULL,
  descricao TEXT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY sgcab_catalogo_tipo_ano_uniq (tipo, ano)
) ENGINE = InnoDB;

INSERT INTO sgcab_valores_catalogo
  (tipo, ano, valor, vigencia_inicio, descricao)
SELECT
  tv.tipo,
  YEAR(tv.vigencia_inicio),
  tv.valor,
  tv.vigencia_inicio,
  tv.observacoes
FROM tabela_valores tv
WHERE tv.tipo LIKE 'sgcab\_%' ESCAPE '\\'
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  vigencia_inicio = VALUES(vigencia_inicio),
  descricao = VALUES(descricao);

-- Depois de preservados no catalogo exclusivo, deixam de aparecer na
-- Tabela de Valores da Loja.
DELETE FROM tabela_valores
WHERE tipo LIKE 'sgcab\_%' ESCAPE '\\';

