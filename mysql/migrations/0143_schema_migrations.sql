-- =============================================================================
-- Migração 0143: tabela de controle de migração aplicada (issue #503)
--
-- CONTEXTO. Terceira vez documentada que uma migração fica no repositório
-- sem nunca ter sido aplicada em produção sem ninguém perceber, até um erro
-- em uso real revelar o gap (migração 0092; migrações 0123-0125; e a mais
-- recente, 0104/0136-0140 — parâmetros contábeis e rateio na conciliação,
-- ver PRs #500-#502). A causa estrutural: não existe hoje nenhuma forma de
-- saber, olhando o banco, quais migrações de mysql/migrations/ já foram
-- aplicadas em produção. O deploy da Hostinger só roda `npm run build`; a
-- aplicação da migração é sempre um passo manual via phpMyAdmin, sem
-- registro.
--
-- O QUE ESTA MIGRAÇÃO FAZ.
--
--   1. Cria `schema_migrations` (nome_arquivo, aplicado_em) — uma linha por
--      migração aplicada.
--   2. Semeia todas as migrações de 0001 até 0142 como já aplicadas — no
--      momento em que esta migração é escrita, a produção já está em dia
--      com todas elas (os gaps conhecidos, incluindo a 0104, já foram
--      fechados pelas migrações corretivas 0136-0142). `aplicado_em` para
--      este lote fica com o timestamp de quando a 0143 for rodada — é uma
--      aproximação retroativa, não a data real de cada uma; documentado
--      aqui para quem for investigar no futuro.
--
-- CONVENÇÃO A PARTIR DE AGORA. Toda migração nova (0144 em diante) deve
-- terminar com o próprio INSERT de auto-registro, assim:
--
--   INSERT INTO schema_migrations (nome_arquivo) VALUES ('0144_nome_do_arquivo.sql');
--
-- Isso faz a aplicação manual via phpMyAdmin já registrar a si mesma, sem
-- depender de lembrar de um passo à parte. Ver scripts/checar-migracoes-
-- pendentes.mjs para o script que compara o repositório com o que está
-- registrado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  nome_arquivo VARCHAR(255) NOT NULL PRIMARY KEY,
  aplicado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_migrations (nome_arquivo) VALUES
  ('0001_fundacao.sql'),
  ('0002_cadastros.sql'),
  ('0003_contabil_tesouraria.sql'),
  ('0004_correcoes_atomicidade.sql'),
  ('0005_orcamento_fechamento.sql'),
  ('0006_autenticacao.sql'),
  ('0007_terceiros_cnpj.sql'),
  ('0008_lgpd_consentimento.sql'),
  ('0009_zerar_faturas_abertas.sql'),
  ('0010_zerar_faturas_completo.sql'),
  ('0011_resetar_financeiro.sql'),
  ('0012_ativar_inativar_usuario.sql'),
  ('0013_auditoria.sql'),
  ('0014_taxas_grau_sgcab.sql'),
  ('0015_eventos_rsvp.sql'),
  ('0016_planos_ensino.sql'),
  ('0017_comunicacoes.sql'),
  ('0018_notificacoes_push.sql'),
  ('0019_sessoes_org_grau_numerico.sql'),
  ('0020_tabela_valores.sql'),
  ('0021_trocar_senha_primeiro_acesso.sql'),
  ('0022_planos_ensino_org_grau_numerico.sql'),
  ('0023_gerar_mensalidades_valor_historico.sql'),
  ('0024_baixa_faturas_juros_extra.sql'),
  ('0025_gerar_mensalidades_vencimento_padrao.sql'),
  ('0026_conciliacao_baixa_via_ofx.sql'),
  ('0027_orgs_logo.sql'),
  ('0028_contas_financeiras_pix.sql'),
  ('0029_faturas_forma_cobranca.sql'),
  ('0030_seed_cargos_institucionais.sql'),
  ('0031_comissoes.sql'),
  ('0032_sessao_responsaveis_iniciacao.sql'),
  ('0033_passkeys.sql'),
  ('0034_pecas_arquitetura.sql'),
  ('0035_totp.sql'),
  ('0036_interstico_graus.sql'),
  ('0037_backups_gerados.sql'),
  ('0038_enquetes.sql'),
  ('0039_documentos_assinaturas.sql'),
  ('0040_emissao_fatura_ultimo_dia_competencia.sql'),
  ('0041_google_login.sql'),
  ('0042_facebook_login.sql'),
  ('0043_emails_enviados.sql'),
  ('0044_conciliacao_lote.sql'),
  ('0045_fechamento_periodo.sql'),
  ('0046_desfazer_conciliacao.sql'),
  ('0047_pagamento_parcial.sql'),
  ('0048_pagamento_parcial_correcoes.sql'),
  ('0049_rateio_lancamento_ofx.sql'),
  ('0050_protecao_forca_bruta_login.sql'),
  ('0051_invalidar_sessoes_troca_senha.sql'),
  ('0052_corrigir_natureza_orgs_invalida.sql'),
  ('0053_desfazer_lancamento_ofx.sql'),
  ('0054_desfazer_conciliacao_rateio.sql'),
  ('0055_valor_mensalidade_customizado.sql'),
  ('0056_saldo_contas_valor_creditado.sql'),
  ('0057_saldo_contas_conciliacao_desfeita.sql'),
  ('0058_parcelamento_guarda_valor_pago.sql'),
  ('0059_periodo_fechado_permite_baixa_antiga.sql'),
  ('0060_desfazer_lancamento_ofx_caso_legado.sql'),
  ('0061_correcoes_revisao_pos_auditoria.sql'),
  ('0062_conta_pagar_provisao_origem_id.sql'),
  ('0063_pecas_arquitetura_grau.sql'),
  ('0064_pecas_arquitetura_aprovacao.sql'),
  ('0065_sessoes_tipo_iniciacao.sql'),
  ('0066_sessoes_eventos_local.sql'),
  ('0067_configuracoes_lgpd.sql'),
  ('0068_indice_lancamentos_pago_tipo.sql'),
  ('0069_pecas_arquitetura_atualizado_em.sql'),
  ('0070_regime_caixa_contabilidade.sql'),
  ('0071_reorganiza_plano_contas.sql'),
  ('0072_repositorio_legislacao.sql'),
  ('0073_legislacao_somente_pdf.sql'),
  ('0074_pix_copia_cola_qrcode.sql'),
  ('0075_controle_tronco_beneficencia.sql'),
  ('0076_taxas_sgcab_2026.sql'),
  ('0077_faturas_gerenciais_sgcab.sql'),
  ('0078_separa_catalogo_sgcab_da_loja.sql'),
  ('0079_resumo_extratos_ofx.sql'),
  ('0080_normaliza_conciliacoes_historicas.sql'),
  ('0081_remove_duplicidades_ofx_auditadas.sql'),
  ('0082_previsoes_despesas_recorrentes.sql'),
  ('0083_remove_reimportacoes_ofx_pendentes.sql'),
  ('0084_recorrencias_vencimento_ate_31.sql'),
  ('0085_recibos_avulsos.sql'),
  ('0086_corrige_postagem_provisao_fatura.sql'),
  ('0090_pix_automatico_faturas.sql'),
  ('0091_fila_email.sql'),
  ('0092_saas_lojas_multi_tenant.sql'),
  ('0093_loja_parametros_email.sql'),
  ('0094_super_admin.sql'),
  ('0095_convites_admin_loja.sql'),
  ('0096_rotinas_e_views_por_loja.sql'),
  ('0097_remove_defaults_loja_id.sql'),
  ('0098_conta_contabil_ausente_regime_caixa.sql'),
  ('0099_conciliado_com_lastro.sql'),
  ('0100_terceiros_lancamentos_ofx.sql'),
  ('0101_corrige_valor_pago_estorno_ofx.sql'),
  ('0102_anulacao_linhas_ofx.sql'),
  ('0103_lancar_lote_de_ofx.sql'),
  ('0104_parametros_contabeis.sql'),
  ('0105b_fix_onboarding_loja_faltante.sql'),
  ('0105_onboarding_loja.sql'),
  ('0106_has_role_escopado_por_loja.sql'),
  ('0107_sgcab_boton_tipo_sem_ano.sql'),
  ('0108_qr_code_pix_mediumtext.sql'),
  ('0109_configuracoes_plataforma.sql'),
  ('0110_chamados_suporte.sql'),
  ('0111_tokens_recuperacao_senha.sql'),
  ('0112_backups_conteudo_no_banco.sql'),
  ('0113_noticias_site.sql'),
  ('0114_agenda_publica_edicao.sql'),
  ('0115_sgcab_comprovante_mediumtext.sql'),
  ('0116_irmaos_foto_mediumtext.sql'),
  ('0117_arquivos_pdf_longtext.sql'),
  ('0118b_fix_potencias_logo_url.sql'),
  ('0118_logos_org_potencia_mediumtext.sql'),
  ('0119_paginas_site.sql'),
  ('0120_menu_site.sql'),
  ('0121_editor_aprovador_cms.sql'),
  ('0122_data_real_conciliacao_lote.sql'),
  ('0123_menu_itens_ocultos_loja.sql'),
  ('0124_usuario_menu_ocultos.sql'),
  ('0125_favoritos_menu_usuario.sql'),
  ('0126_menu_mobile_papel.sql'),
  ('0127_saldo_contas_expoe_banco_plano_conta.sql'),
  ('0128_filas_email_multiplos_anexos.sql'),
  ('0129_editar_excluir_transferencia.sql'),
  ('0130_desfazer_ofx_nao_reabre_transferencia.sql'),
  ('0131_saldo_contas_credita_destino_transferencia_conciliada.sql'),
  ('0132_saldo_transferencia_escopado_por_conta.sql'),
  ('0133_filas_email_bcc_monitoramento.sql'),
  ('0134_valida_terceiro_criar_conta_pagar.sql'),
  ('0135_rateio_fatura_de_verdade.sql'),
  ('0136_recria_funcao_conta_parametro.sql'),
  ('0137_recria_funcao_conta_parametro_opcional.sql'),
  ('0138_cria_tabela_parametros_contabeis.sql'),
  ('0139_conciliar_ofx_lote_usa_parametro_contabil.sql'),
  ('0140_corrige_serializacao_json_registrar_lancamento.sql'),
  ('0141_desfazer_ofx_nao_reabre_fatura_paga_por_outro_fluxo.sql'),
  ('0142_conciliar_ofx_existente_exige_pago.sql');

-- A partir daqui, a própria migração se auto-registra (ver convenção no
-- topo deste arquivo).
INSERT IGNORE INTO schema_migrations (nome_arquivo) VALUES ('0143_schema_migrations.sql');
