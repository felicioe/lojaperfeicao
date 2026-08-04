-- =========================================
-- DIAGNÓSTICO: lista todas as tabelas e procedures que o app espera
-- encontrar (extraídas de mysql/migrations/0001..0010) e mostra se cada
-- uma existe no banco atual. Rode isso no phpMyAdmin (aba SQL) do banco
-- de produção para descobrir exatamente o que falta aplicar.
-- Não altera nada — só consulta.
-- =========================================

SELECT 'TABELA' AS tipo, esperado.nome,
       IF(t.TABLE_NAME IS NULL, 'FALTANDO', 'ok') AS status
FROM (
  SELECT 'cargos' AS nome UNION ALL SELECT 'cnpj_consultas_cache' UNION ALL SELECT 'cnpj_rate_limit'
  UNION ALL SELECT 'contas_financeiras' UNION ALL SELECT 'despesas_recorrentes'
  UNION ALL SELECT 'fechamentos_exercicio' UNION ALL SELECT 'fechamentos_exercicio_eventos'
  UNION ALL SELECT 'gestao_cargos' UNION ALL SELECT 'gestoes' UNION ALL SELECT 'irmao_elevacoes'
  UNION ALL SELECT 'irmao_filhos' UNION ALL SELECT 'irmao_formacao' UNION ALL SELECT 'irmao_orgs'
  UNION ALL SELECT 'irmao_parentes' UNION ALL SELECT 'irmaos' UNION ALL SELECT 'lancamentos'
  UNION ALL SELECT 'lancamentos_contabeis' UNION ALL SELECT 'lancamentos_contabeis_itens'
  UNION ALL SELECT 'ofx_lancamentos' UNION ALL SELECT 'orcamento_itens' UNION ALL SELECT 'orcamentos'
  UNION ALL SELECT 'orgs' UNION ALL SELECT 'orgs_graus' UNION ALL SELECT 'parametros_financeiros'
  UNION ALL SELECT 'parcelamentos' UNION ALL SELECT 'plano_contas' UNION ALL SELECT 'potencias'
  UNION ALL SELECT 'presencas' UNION ALL SELECT 'recibo_itens' UNION ALL SELECT 'recibos'
  UNION ALL SELECT 'sessoes' UNION ALL SELECT 'terceiros' UNION ALL SELECT 'usuarios'
  UNION ALL SELECT 'usuarios_papeis'
) esperado
LEFT JOIN INFORMATION_SCHEMA.TABLES t
  ON t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = esperado.nome

UNION ALL

SELECT 'PROCEDURE' AS tipo, esperado.nome,
       IF(r.ROUTINE_NAME IS NULL, 'FALTANDO', 'ok') AS status
FROM (
  SELECT '_postar_provisao_fatura' AS nome UNION ALL SELECT 'aprovar_orcamento'
  UNION ALL SELECT 'ativar_gestao' UNION ALL SELECT 'baixar_conta_pagar'
  UNION ALL SELECT 'baixar_faturas' UNION ALL SELECT 'calcular_multa_juros'
  UNION ALL SELECT 'conciliar_ofx_existente' UNION ALL SELECT 'criar_conta_pagar'
  UNION ALL SELECT 'criar_fatura_avulsa' UNION ALL SELECT 'criar_lancamento_de_ofx'
  UNION ALL SELECT 'criar_orcamento' UNION ALL SELECT 'criar_parcelamento'
  UNION ALL SELECT 'criar_transferencia' UNION ALL SELECT 'criar_usuario'
  UNION ALL SELECT 'definir_valor_orcamento' UNION ALL SELECT 'efetivar_recorrentes_vencidas'
  UNION ALL SELECT 'fechar_exercicio' UNION ALL SELECT 'gerar_graus_padrao_org'
  UNION ALL SELECT 'gerar_mensalidades' UNION ALL SELECT 'reabrir_exercicio'
  UNION ALL SELECT 'reabrir_orcamento' UNION ALL SELECT 'registrar_lancamento_contabil'
  UNION ALL SELECT 'registrar_recebimento_avulso' UNION ALL SELECT 'salvar_conta'
  UNION ALL SELECT 'resetar_financeiro'
) esperado
LEFT JOIN INFORMATION_SCHEMA.ROUTINES r
  ON r.ROUTINE_SCHEMA = DATABASE() AND r.ROUTINE_NAME = esperado.nome AND r.ROUTINE_TYPE = 'PROCEDURE'

UNION ALL

SELECT 'FUNCTION' AS tipo, esperado.nome,
       IF(r.ROUTINE_NAME IS NULL, 'FALTANDO', 'ok') AS status
FROM (
  SELECT 'has_role' AS nome UNION ALL SELECT 'is_admin_or' UNION ALL SELECT 'mes_competencia'
) esperado
LEFT JOIN INFORMATION_SCHEMA.ROUTINES r
  ON r.ROUTINE_SCHEMA = DATABASE() AND r.ROUTINE_NAME = esperado.nome AND r.ROUTINE_TYPE = 'FUNCTION'

UNION ALL

SELECT 'VIEW' AS tipo, esperado.nome,
       IF(v.TABLE_NAME IS NULL, 'FALTANDO', 'ok') AS status
FROM (
  SELECT 'v_auditoria_contabil_desbalanceados' AS nome
  UNION ALL SELECT 'v_saldo_contas' UNION ALL SELECT 'v_saldo_plano_contas'
) esperado
LEFT JOIN INFORMATION_SCHEMA.VIEWS v
  ON v.TABLE_SCHEMA = DATABASE() AND v.TABLE_NAME = esperado.nome

ORDER BY (status = 'ok'), tipo, nome;
