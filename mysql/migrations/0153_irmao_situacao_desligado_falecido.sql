-- =========================================
-- Estados "desligado" e "falecido" para irmaos.situacao (issue #608 da
-- auditoria de Irmãos).
--
-- O ENUM original só tinha ativo/quite/irregular/adormecido — não havia
-- como registrar um desligamento ou falecimento definitivo sem "forçar" o
-- significado de "adormecido" (que no vocabulário maçônico é licença/
-- afastamento temporário — existe inclusive o campo booleano `licenciado`
-- separado para esse caso) ou apagar o cadastro por completo (perdendo
-- histórico financeiro/institucional).
--
-- Nenhuma rotina precisa de ajuste: toda query que filtra por situação
-- ativa já usa lista explícita de inclusão (`situacao IN ('ativo',
-- 'quite', 'irregular')`, em gerar_mensalidades, dashboard.ts,
-- tabela-valores.ts) — os dois valores novos já ficam de fora
-- automaticamente por não estarem nessas listas.
-- =========================================
ALTER TABLE irmaos
  MODIFY COLUMN situacao
    ENUM('ativo', 'quite', 'irregular', 'adormecido', 'desligado', 'falecido')
    NOT NULL DEFAULT 'ativo';
