-- =========================================
-- Proteção contra reuso do mesmo código TOTP dentro da janela válida
-- (achado #614 da auditoria de autenticação).
--
-- totp.validate({ window: 1 }) aceita o passo atual e um adjacente de cada
-- lado (~90s) — razoável para tolerar relógio dessincronizado, mas nada
-- impedia o MESMO código de 6 dígitos, ainda dentro da janela, ser aceito
-- duas vezes (uso em paralelo, ou reuso depois de capturado/observado). Os
-- códigos de backup já eram de uso único (usado_em); o código do app não
-- tinha nenhum registro equivalente.
--
-- Guarda o "step" (contador de 30s desde a época Unix) do último código
-- aceito por usuário — validarCodigoTotpOuBackup passa a recusar um código
-- cujo step já foi usado antes, mesmo que matematicamente ainda válido.
-- =========================================
ALTER TABLE usuario_totp
  ADD COLUMN IF NOT EXISTS ultimo_step_usado BIGINT NULL AFTER secret;
