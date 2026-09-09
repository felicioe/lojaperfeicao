-- =============================================================================
-- Migração 0133: filas_email ganha bcc_monitoramento (pedido do usuário)
--
-- CONTEXTO. No início de operação do sistema, o usuário quer receber cópia
-- oculta (BCC) de todo e-mail que chega a um irmão — fatura emitida,
-- cobrança, lembrete de vencimento, comunicado, recibo/relatório enviado
-- manualmente — pra confirmar que o conteúdo e a entrega estão corretos,
-- não importa se disparado pelo tesoureiro ou pelo próprio irmão.
--
-- Guardado como coluna na fila (não deduzido de `tipo` na hora de enviar)
-- porque `tipo='comunicado'` já é reaproveitado por dois casos bem
-- diferentes: comunicado de verdade pra irmãos (deve levar BCC) e
-- recuperação de senha self-service (NUNCA pode levar BCC — vazaria o link
-- de redefinição de senha de um irmão pra outra caixa). Guardar a decisão
-- explicitamente, no momento em que cada função sabe o que está enviando,
-- evita depender de inferir isso a partir do tipo depois.
-- =============================================================================
ALTER TABLE filas_email
  ADD COLUMN bcc_monitoramento BOOLEAN NOT NULL DEFAULT FALSE AFTER destinatarios_json;
