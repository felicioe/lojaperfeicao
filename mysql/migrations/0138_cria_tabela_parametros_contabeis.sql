-- =============================================================================
-- Migração 0138: cria a tabela parametros_contabeis + seed (terceira parte
-- do gap descoberto ao testar o rateio ao vivo — ver 0136, 0137)
--
-- CONTEXTO. Depois de recriar conta_parametro (0136) e conta_parametro_
-- opcional (0137), criarFaturaAvulsa voltou a falhar mais um nível abaixo:
-- "Table 'u630316951_ado.parametros_contabeis' doesn't exist". A migração
-- 0104 inteira (tabela + seed + funções + procedures) nunca foi aplicada de
-- verdade em produção — só a tabela e o seed faltavam agora, já que as
-- funções foram cobertas pelas duas migrações anteriores.
--
-- CORREÇÃO. Recria a tabela e roda o mesmo seed idempotente da 0104: casa
-- cada papel contábil pelo código do plano de contas já existente nesta
-- loja. Se algum papel não encontrar o código esperado (plano de contas
-- customizado), fica sem seed — o admin configura manualmente em
-- Contabilidade > Parâmetros Contábeis, mesmo comportamento já previsto
-- desde a 0104.
-- =============================================================================

CREATE TABLE IF NOT EXISTS parametros_contabeis (
  loja_id CHAR(36) NOT NULL,
  papel VARCHAR(40) NOT NULL,
  plano_conta_id CHAR(36) NOT NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (loja_id, papel),
  CONSTRAINT fk_parametros_contabeis_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_parametros_contabeis_conta FOREIGN KEY (plano_conta_id) REFERENCES plano_contas(id)
) ENGINE=InnoDB;

-- 'contas_a_receber' tenta '1.1.02' primeiro (instalação que nunca rodou a
-- 0071) e só então '1.1.91' (o caso comum hoje — legado, inativa).
INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'contas_a_receber', id FROM plano_contas WHERE codigo = '1.1.02';
INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT pc.loja_id, 'contas_a_receber', pc.id FROM plano_contas pc
 WHERE pc.codigo = '1.1.91'
   AND NOT EXISTS (
     SELECT 1 FROM parametros_contabeis p
      WHERE p.loja_id = pc.loja_id AND p.papel = 'contas_a_receber'
   );

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'fornecedores', id FROM plano_contas WHERE codigo = '2.1.01';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'mensalidades', id FROM plano_contas WHERE codigo = '4.1.01';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'multas_juros', id FROM plano_contas WHERE codigo = '4.1.06';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'descontos_concedidos', id FROM plano_contas WHERE codigo = '5.1.06';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'resultado_receita_padrao', id FROM plano_contas WHERE codigo = '4.9.01';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'resultado_despesa_padrao', id FROM plano_contas WHERE codigo = '5.9.01';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'resultado_acumulado', id FROM plano_contas WHERE codigo = '3.1.01';
