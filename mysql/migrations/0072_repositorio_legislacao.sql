-- Reestrutura Documentos como repositorio de Legislacao, sem assinaturas.
ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(80) NOT NULL DEFAULT 'documentos_loja' AFTER titulo;

DROP TRIGGER IF EXISTS trg_documento_assinaturas_no_update;
DROP TRIGGER IF EXISTS trg_documento_assinaturas_no_delete;
DROP TABLE IF EXISTS documento_assinaturas;

SET @importador_id := COALESCE(
  (SELECT u.id FROM usuarios u INNER JOIN usuarios_papeis up ON up.usuario_id = u.id WHERE up.papel = 'admin' ORDER BY u.criado_em LIMIT 1),
  (SELECT id FROM usuarios ORDER BY criado_em LIMIT 1)
);

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000001', 'Administração e Planejamento 2024 - L. Perfeição Adonhiram e Capitulo Ayres Gevaerd', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Administração e Planejamento 2024 - L. Perfeição Adonhiram e Capitulo Ayres Gevaerd', '/uploads/legislacao/acervo-0001.pdf'), 256), '/uploads/legislacao/acervo-0001.pdf', 'Administração e Planejamento 2024 - L. Perfeição Adonhiram e Capitulo Ayres Gevaerd.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0001.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000002', 'Administração_e_Planejamento_2024_-_L._Perfeição_Adonhiram_e_Capitulo_Ayres_Gevaerd[1]', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Administração_e_Planejamento_2024_-_L._Perfeição_Adonhiram_e_Capitulo_Ayres_Gevaerd[1]', '/uploads/legislacao/acervo-0002.pdf'), 256), '/uploads/legislacao/acervo-0002.pdf', 'Administração_e_Planejamento_2024_-_L._Perfeição_Adonhiram_e_Capitulo_Ayres_Gevaerd[1].pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0002.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000003', 'Cadastro para o SGCAB 2024', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Cadastro para o SGCAB 2024', '/uploads/legislacao/acervo-0003.pdf'), 256), '/uploads/legislacao/acervo-0003.pdf', 'Cadastro para o SGCAB 2024.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0003.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000004', 'Concepcao Ensino Capitulo Carlos Castilho', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Concepcao Ensino Capitulo Carlos Castilho', '/uploads/legislacao/acervo-0004.pdf'), 256), '/uploads/legislacao/acervo-0004.pdf', 'Concepcao Ensino Capitulo Carlos Castilho.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0004.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000005', 'CONCEPÇÃO ENSINO GRAUS FILOSOFICOS', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('CONCEPÇÃO ENSINO GRAUS FILOSOFICOS', '/uploads/legislacao/acervo-0005.pdf'), 256), '/uploads/legislacao/acervo-0005.pdf', 'CONCEPÇÃO ENSINO GRAUS FILOSOFICOS.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0005.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000006', 'Elevação 4º Grau (1) - Formulário', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Elevação 4º Grau (1) - Formulário', '/uploads/legislacao/acervo-0006.pdf'), 256), '/uploads/legislacao/acervo-0006.pdf', 'Elevação 4º Grau (1) - Formulário.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0006.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000007', 'Instruções Grau Aprendiz', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Instruções Grau Aprendiz', '/uploads/legislacao/acervo-0007.pdf'), 256), '/uploads/legislacao/acervo-0007.pdf', 'Instruções Grau Aprendiz.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0007.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000008', 'Instruções Grau Companheiro', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Instruções Grau Companheiro', '/uploads/legislacao/acervo-0008.pdf'), 256), '/uploads/legislacao/acervo-0008.pdf', 'Instruções Grau Companheiro.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0008.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000009', 'Instrucoes -Grau de Mestre Adonhiramita OS14249 ok', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Instrucoes -Grau de Mestre Adonhiramita OS14249 ok', '/uploads/legislacao/acervo-0009.pdf'), 256), '/uploads/legislacao/acervo-0009.pdf', 'Instrucoes -Grau de Mestre Adonhiramita OS14249 ok.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0009.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000010', 'ATO Nº001_2022 Tabela de Taxas', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº001_2022 Tabela de Taxas', '/uploads/legislacao/acervo-0010.pdf'), 256), '/uploads/legislacao/acervo-0010.pdf', 'ATO Nº001_2022 Tabela de Taxas.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0010.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000011', 'ATO Nº001_2023 - Normativa pagamento das notas de débitos', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº001_2023 - Normativa pagamento das notas de débitos', '/uploads/legislacao/acervo-0011.pdf'), 256), '/uploads/legislacao/acervo-0011.pdf', 'ATO Nº001_2023 - Normativa pagamento das notas de débitos.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0011.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000012', 'ATO Nº001_2024 -Taxas e emolumentos de 2024', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº001_2024 -Taxas e emolumentos de 2024', '/uploads/legislacao/acervo-0012.pdf'), 256), '/uploads/legislacao/acervo-0012.pdf', 'ATO Nº001_2024 -Taxas e emolumentos de 2024.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0012.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000013', 'ATO Nº001_2025 -Taxas e emolumentos de 2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº001_2025 -Taxas e emolumentos de 2025', '/uploads/legislacao/acervo-0013.pdf'), 256), '/uploads/legislacao/acervo-0013.pdf', 'ATO Nº001_2025 -Taxas e emolumentos de 2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0013.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000014', 'ATO Nº001_2026 -Taxas e emolumentos de 2026', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº001_2026 -Taxas e emolumentos de 2026', '/uploads/legislacao/acervo-0014.pdf'), 256), '/uploads/legislacao/acervo-0014.pdf', 'ATO Nº001_2026 -Taxas e emolumentos de 2026.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0014.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000015', 'ATO Nº002_2022 - equivalência do grau 5_CARLOS ALBERTO DE MORAES', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº002_2022 - equivalência do grau 5_CARLOS ALBERTO DE MORAES', '/uploads/legislacao/acervo-0015.pdf'), 256), '/uploads/legislacao/acervo-0015.pdf', 'ATO Nº002_2022 - equivalência do grau 5_CARLOS ALBERTO DE MORAES.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0015.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000016', 'ATO Nº002_2023 - Homologa e reconhece administracão da Loja de Perfeição  Arca da Sabedoria', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº002_2023 - Homologa e reconhece administracão da Loja de Perfeição  Arca da Sabedoria', '/uploads/legislacao/acervo-0016.pdf'), 256), '/uploads/legislacao/acervo-0016.pdf', 'ATO Nº002_2023 - Homologa e reconhece administracão da Loja de Perfeição  Arca da Sabedoria.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0016.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000017', 'ATO Nº002_2024 -Encaminhamento ao REAA de José Abel da SIlva', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº002_2024 -Encaminhamento ao REAA de José Abel da SIlva', '/uploads/legislacao/acervo-0017.pdf'), 256), '/uploads/legislacao/acervo-0017.pdf', 'ATO Nº002_2024 -Encaminhamento ao REAA de José Abel da SIlva.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0017.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000018', 'ATO Nº002_2025 - dispensa delegado do patriarca_Luiz César Homen', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº002_2025 - dispensa delegado do patriarca_Luiz César Homen', '/uploads/legislacao/acervo-0018.pdf'), 256), '/uploads/legislacao/acervo-0018.pdf', 'ATO Nº002_2025 - dispensa delegado do patriarca_Luiz César Homen.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0018.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000019', 'ATO Nº003_2022 -  delegação de poderes_MARCO VIDAL', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº003_2022 -  delegação de poderes_MARCO VIDAL', '/uploads/legislacao/acervo-0019.pdf'), 256), '/uploads/legislacao/acervo-0019.pdf', 'ATO Nº003_2022 -  delegação de poderes_MARCO VIDAL.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0019.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000020', 'ATO Nº003_2023 - Homologa e reconhece administracão da Loja Capitular São Francisco de Assis', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº003_2023 - Homologa e reconhece administracão da Loja Capitular São Francisco de Assis', '/uploads/legislacao/acervo-0020.pdf'), 256), '/uploads/legislacao/acervo-0020.pdf', 'ATO Nº003_2023 - Homologa e reconhece administracão da Loja Capitular São Francisco de Assis.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0020.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000021', 'ATO Nº003_2024 - Homologa ritual do grau 4_2024', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº003_2024 - Homologa ritual do grau 4_2024', '/uploads/legislacao/acervo-0021.pdf'), 256), '/uploads/legislacao/acervo-0021.pdf', 'ATO Nº003_2024 - Homologa ritual do grau 4_2024.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0021.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000022', 'ATO Nº003_2025 - dispensa delegado do patriarca_RODRIGO MARCELO SAPIAGINSKI', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº003_2025 - dispensa delegado do patriarca_RODRIGO MARCELO SAPIAGINSKI', '/uploads/legislacao/acervo-0022.pdf'), 256), '/uploads/legislacao/acervo-0022.pdf', 'ATO Nº003_2025 - dispensa delegado do patriarca_RODRIGO MARCELO SAPIAGINSKI.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0022.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000023', 'ATO Nº004_2023 - Nomeia delegado Adjunto David Facury', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº004_2023 - Nomeia delegado Adjunto David Facury', '/uploads/legislacao/acervo-0023.pdf'), 256), '/uploads/legislacao/acervo-0023.pdf', 'ATO Nº004_2023 - Nomeia delegado Adjunto David Facury.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0023.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000024', 'ATO Nº004_2024 - Homologa ritual do grau 5_2024', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº004_2024 - Homologa ritual do grau 5_2024', '/uploads/legislacao/acervo-0024.pdf'), 256), '/uploads/legislacao/acervo-0024.pdf', 'ATO Nº004_2024 - Homologa ritual do grau 5_2024.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0024.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000025', 'ATO Nº004_2025 - nomeia delegado SCA ao Vale de Criciúma_Amarildo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº004_2025 - nomeia delegado SCA ao Vale de Criciúma_Amarildo', '/uploads/legislacao/acervo-0025.pdf'), 256), '/uploads/legislacao/acervo-0025.pdf', 'ATO Nº004_2025 - nomeia delegado SCA ao Vale de Criciúma_Amarildo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0025.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000026', 'ATO Nº005_2022 - ENCAMINHAMENTO_REAA_Luiz Carlos Aguiar da Silva', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº005_2022 - ENCAMINHAMENTO_REAA_Luiz Carlos Aguiar da Silva', '/uploads/legislacao/acervo-0026.pdf'), 256), '/uploads/legislacao/acervo-0026.pdf', 'ATO Nº005_2022 - ENCAMINHAMENTO_REAA_Luiz Carlos Aguiar da Silva.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0026.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000027', 'ATO Nº005_2023 - Nomeia delegado Adjunto Inácio de Loyola Campos Cavalcanti', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº005_2023 - Nomeia delegado Adjunto Inácio de Loyola Campos Cavalcanti', '/uploads/legislacao/acervo-0027.pdf'), 256), '/uploads/legislacao/acervo-0027.pdf', 'ATO Nº005_2023 - Nomeia delegado Adjunto Inácio de Loyola Campos Cavalcanti.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0027.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000028', 'ATO Nº005_2024 - Homologa ritual do grau 6_2024', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº005_2024 - Homologa ritual do grau 6_2024', '/uploads/legislacao/acervo-0028.pdf'), 256), '/uploads/legislacao/acervo-0028.pdf', 'ATO Nº005_2024 - Homologa ritual do grau 6_2024.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0028.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000029', 'ATO Nº005_2025 - nomeia delegado SCA ao Vale de Sorriso_MT_Euller', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº005_2025 - nomeia delegado SCA ao Vale de Sorriso_MT_Euller', '/uploads/legislacao/acervo-0029.pdf'), 256), '/uploads/legislacao/acervo-0029.pdf', 'ATO Nº005_2025 - nomeia delegado SCA ao Vale de Sorriso_MT_Euller.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0029.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000030', 'ATO Nº006_2022 - Nomeia diretor administrativo Mario Edson', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº006_2022 - Nomeia diretor administrativo Mario Edson', '/uploads/legislacao/acervo-0030.pdf'), 256), '/uploads/legislacao/acervo-0030.pdf', 'ATO Nº006_2022 - Nomeia diretor administrativo Mario Edson.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0030.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000031', 'ATO Nº006_2023 - equivalência de grau_Rodrigo Steil', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº006_2023 - equivalência de grau_Rodrigo Steil', '/uploads/legislacao/acervo-0031.pdf'), 256), '/uploads/legislacao/acervo-0031.pdf', 'ATO Nº006_2023 - equivalência de grau_Rodrigo Steil.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0031.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000032', 'ATO Nº006_2024 - abertura e encerramento do ano maçônico das corporações filosóficas', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº006_2024 - abertura e encerramento do ano maçônico das corporações filosóficas', '/uploads/legislacao/acervo-0032.pdf'), 256), '/uploads/legislacao/acervo-0032.pdf', 'ATO Nº006_2024 - abertura e encerramento do ano maçônico das corporações filosóficas.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0032.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000033', 'ATO Nº006_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DA LP Arno Gebler e SCA Carlos Cartilho', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº006_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DA LP Arno Gebler e SCA Carlos Cartilho', '/uploads/legislacao/acervo-0033.pdf'), 256), '/uploads/legislacao/acervo-0033.pdf', 'ATO Nº006_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DA LP Arno Gebler e SCA Carlos Cartilho.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0033.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000034', 'ATO Nº007_2022 - OFICIALIZA AS FORMAS DE TRATAMENTO do SGCADB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº007_2022 - OFICIALIZA AS FORMAS DE TRATAMENTO do SGCADB', '/uploads/legislacao/acervo-0034.pdf'), 256), '/uploads/legislacao/acervo-0034.pdf', 'ATO Nº007_2022 - OFICIALIZA AS FORMAS DE TRATAMENTO do SGCADB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0034.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000035', 'ATO Nº007_2023 - equivalência de grau_José Bernardo Cunha', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº007_2023 - equivalência de grau_José Bernardo Cunha', '/uploads/legislacao/acervo-0035.pdf'), 256), '/uploads/legislacao/acervo-0035.pdf', 'ATO Nº007_2023 - equivalência de grau_José Bernardo Cunha.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0035.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000036', 'ATO Nº007_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO SOCIEDADE LITERÁRIA CAMPINA DO GREGÓRIO', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº007_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO SOCIEDADE LITERÁRIA CAMPINA DO GREGÓRIO', '/uploads/legislacao/acervo-0036.pdf'), 256), '/uploads/legislacao/acervo-0036.pdf', 'ATO Nº007_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO SOCIEDADE LITERÁRIA CAMPINA DO GREGÓRIO.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0036.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000037', 'ATO Nº007_2025 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA União Adonhiramita do ABC_Santo André', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº007_2025 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA União Adonhiramita do ABC_Santo André', '/uploads/legislacao/acervo-0037.pdf'), 256), '/uploads/legislacao/acervo-0037.pdf', 'ATO Nº007_2025 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA União Adonhiramita do ABC_Santo André.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0037.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000038', 'ATO Nº008_2022 - OFICIALIZA equivalência de graus', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº008_2022 - OFICIALIZA equivalência de graus', '/uploads/legislacao/acervo-0038.pdf'), 256), '/uploads/legislacao/acervo-0038.pdf', 'ATO Nº008_2022 - OFICIALIZA equivalência de graus.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0038.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000039', 'ATO Nº008_2023 -  delegação de poderes_Giovani Rodrigues Mariot', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº008_2023 -  delegação de poderes_Giovani Rodrigues Mariot', '/uploads/legislacao/acervo-0039.pdf'), 256), '/uploads/legislacao/acervo-0039.pdf', 'ATO Nº008_2023 -  delegação de poderes_Giovani Rodrigues Mariot.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0039.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000040', 'ATO Nº008_2024 - dispensa delegado do patriarca_Guilherme Wallner', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº008_2024 - dispensa delegado do patriarca_Guilherme Wallner', '/uploads/legislacao/acervo-0040.pdf'), 256), '/uploads/legislacao/acervo-0040.pdf', 'ATO Nº008_2024 - dispensa delegado do patriarca_Guilherme Wallner.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0040.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000041', 'ATO Nº008_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO União Adonhiramita do ABC_Santo André', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº008_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO União Adonhiramita do ABC_Santo André', '/uploads/legislacao/acervo-0041.pdf'), 256), '/uploads/legislacao/acervo-0041.pdf', 'ATO Nº008_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO União Adonhiramita do ABC_Santo André.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0041.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000042', 'ATO Nº009_2022 - Normativa encaminhamento ao REAA', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº009_2022 - Normativa encaminhamento ao REAA', '/uploads/legislacao/acervo-0042.pdf'), 256), '/uploads/legislacao/acervo-0042.pdf', 'ATO Nº009_2022 - Normativa encaminhamento ao REAA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0042.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000043', 'ATO Nº009_2023 - Nomeação da SOGEF', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº009_2023 - Nomeação da SOGEF', '/uploads/legislacao/acervo-0043.pdf'), 256), '/uploads/legislacao/acervo-0043.pdf', 'ATO Nº009_2023 - Nomeação da SOGEF.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0043.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000044', 'ATO Nº009_2024 - nomeia delegado Chapecó Sergio wallner', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº009_2024 - nomeia delegado Chapecó Sergio wallner', '/uploads/legislacao/acervo-0044.pdf'), 256), '/uploads/legislacao/acervo-0044.pdf', 'ATO Nº009_2024 - nomeia delegado Chapecó Sergio wallner.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0044.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000045', 'ATO Nº009_2025 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO União Adonhiramita do ABC_Santo André', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº009_2025 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO União Adonhiramita do ABC_Santo André', '/uploads/legislacao/acervo-0045.pdf'), 256), '/uploads/legislacao/acervo-0045.pdf', 'ATO Nº009_2025 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO União Adonhiramita do ABC_Santo André.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0045.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000046', 'ATO Nº010_2022 - equivalência do grau 4_HELENO NASCIMENTO MELO', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº010_2022 - equivalência do grau 4_HELENO NASCIMENTO MELO', '/uploads/legislacao/acervo-0046.pdf'), 256), '/uploads/legislacao/acervo-0046.pdf', 'ATO Nº010_2022 - equivalência do grau 4_HELENO NASCIMENTO MELO.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0046.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000047', 'ATO Nº010_2023 - Nomeia delegado_adnilson_arruda_Alta_floresta', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº010_2023 - Nomeia delegado_adnilson_arruda_Alta_floresta', '/uploads/legislacao/acervo-0047.pdf'), 256), '/uploads/legislacao/acervo-0047.pdf', 'ATO Nº010_2023 - Nomeia delegado_adnilson_arruda_Alta_floresta.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0047.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000048', 'ATO Nº010_2024 - nomeia sapientíssimo Rosanio', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº010_2024 - nomeia sapientíssimo Rosanio', '/uploads/legislacao/acervo-0048.pdf'), 256), '/uploads/legislacao/acervo-0048.pdf', 'ATO Nº010_2024 - nomeia sapientíssimo Rosanio.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0048.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000049', 'ATO Nº010_2025 - nomeia delegado SCA União Adonhiramita do ABC_Santo André', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº010_2025 - nomeia delegado SCA União Adonhiramita do ABC_Santo André', '/uploads/legislacao/acervo-0049.pdf'), 256), '/uploads/legislacao/acervo-0049.pdf', 'ATO Nº010_2025 - nomeia delegado SCA União Adonhiramita do ABC_Santo André.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0049.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000050', 'ATO Nº011_2022 - equivalência do grau 6_Rodolfo Feuser gruner', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº011_2022 - equivalência do grau 6_Rodolfo Feuser gruner', '/uploads/legislacao/acervo-0050.pdf'), 256), '/uploads/legislacao/acervo-0050.pdf', 'ATO Nº011_2022 - equivalência do grau 6_Rodolfo Feuser gruner.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0050.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000051', 'ATO Nº011_2023 - Homologa e reconhece administracão do Capítulo Alta Floresta_MT', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº011_2023 - Homologa e reconhece administracão do Capítulo Alta Floresta_MT', '/uploads/legislacao/acervo-0051.pdf'), 256), '/uploads/legislacao/acervo-0051.pdf', 'ATO Nº011_2023 - Homologa e reconhece administracão do Capítulo Alta Floresta_MT.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0051.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000052', 'ATO Nº011_2024 - Homologa ritual do grau 7_2024', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº011_2024 - Homologa ritual do grau 7_2024', '/uploads/legislacao/acervo-0052.pdf'), 256), '/uploads/legislacao/acervo-0052.pdf', 'ATO Nº011_2024 - Homologa ritual do grau 7_2024.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0052.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000053', 'ATO Nº011_2025 - nomeia sapientíssimo SCA União Adonhiramita do ABC_Santo André', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº011_2025 - nomeia sapientíssimo SCA União Adonhiramita do ABC_Santo André', '/uploads/legislacao/acervo-0053.pdf'), 256), '/uploads/legislacao/acervo-0053.pdf', 'ATO Nº011_2025 - nomeia sapientíssimo SCA União Adonhiramita do ABC_Santo André.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0053.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000054', 'ATO Nº012_2022 - equivalência do grau 12_JULIO CESAR DA SILVA', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº012_2022 - equivalência do grau 12_JULIO CESAR DA SILVA', '/uploads/legislacao/acervo-0054.pdf'), 256), '/uploads/legislacao/acervo-0054.pdf', 'ATO Nº012_2022 - equivalência do grau 12_JULIO CESAR DA SILVA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0054.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000055', 'ATO Nº012_2023 - carta constitutiva a Loja Capitula_Alta Floresta_MT', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº012_2023 - carta constitutiva a Loja Capitula_Alta Floresta_MT', '/uploads/legislacao/acervo-0055.pdf'), 256), '/uploads/legislacao/acervo-0055.pdf', 'ATO Nº012_2023 - carta constitutiva a Loja Capitula_Alta Floresta_MT.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0055.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000056', 'ATO Nº012_2024 - Ratifica criação medalha mérito à dedicação_emérito_ben_granBen', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº012_2024 - Ratifica criação medalha mérito à dedicação_emérito_ben_granBen', '/uploads/legislacao/acervo-0056.pdf'), 256), '/uploads/legislacao/acervo-0056.pdf', 'ATO Nº012_2024 - Ratifica criação medalha mérito à dedicação_emérito_ben_granBen.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0056.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000057', 'ATO Nº012_2025 - medalha do mérito a dedicação_Cesar Homen', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº012_2025 - medalha do mérito a dedicação_Cesar Homen', '/uploads/legislacao/acervo-0057.pdf'), 256), '/uploads/legislacao/acervo-0057.pdf', 'ATO Nº012_2025 - medalha do mérito a dedicação_Cesar Homen.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0057.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000058', 'ATO Nº013_2022 - equivalência do grau 12_WELLINGTON TASSO FREIRE NUNES', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº013_2022 - equivalência do grau 12_WELLINGTON TASSO FREIRE NUNES', '/uploads/legislacao/acervo-0058.pdf'), 256), '/uploads/legislacao/acervo-0058.pdf', 'ATO Nº013_2022 - equivalência do grau 12_WELLINGTON TASSO FREIRE NUNES.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0058.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000059', 'ATO Nº013_2023 - ENCAMINHAMENTO_REAA_Luiz Cesar Homen', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº013_2023 - ENCAMINHAMENTO_REAA_Luiz Cesar Homen', '/uploads/legislacao/acervo-0059.pdf'), 256), '/uploads/legislacao/acervo-0059.pdf', 'ATO Nº013_2023 - ENCAMINHAMENTO_REAA_Luiz Cesar Homen.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0059.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000060', 'ATO Nº013_2024 - Institui a Medalha Lúcio Nelson Martins', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº013_2024 - Institui a Medalha Lúcio Nelson Martins', '/uploads/legislacao/acervo-0060.pdf'), 256), '/uploads/legislacao/acervo-0060.pdf', 'ATO Nº013_2024 - Institui a Medalha Lúcio Nelson Martins.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0060.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000061', 'ATO Nº013_2025 - Compra_troca de Rituais do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº013_2025 - Compra_troca de Rituais do SGCAB', '/uploads/legislacao/acervo-0061.pdf'), 256), '/uploads/legislacao/acervo-0061.pdf', 'ATO Nº013_2025 - Compra_troca de Rituais do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0061.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000062', 'ATO Nº014_2022 - Normativad de Suspensão anuidade SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº014_2022 - Normativad de Suspensão anuidade SGCAB', '/uploads/legislacao/acervo-0062.pdf'), 256), '/uploads/legislacao/acervo-0062.pdf', 'ATO Nº014_2022 - Normativad de Suspensão anuidade SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0062.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000063', 'ATO Nº014_2023 - Homologa o novo estatuto do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº014_2023 - Homologa o novo estatuto do SGCAB', '/uploads/legislacao/acervo-0063.pdf'), 256), '/uploads/legislacao/acervo-0063.pdf', 'ATO Nº014_2023 - Homologa o novo estatuto do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0063.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000064', 'ATO Nº014_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA LUCIO NELSON MARTINS', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº014_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA LUCIO NELSON MARTINS', '/uploads/legislacao/acervo-0064.pdf'), 256), '/uploads/legislacao/acervo-0064.pdf', 'ATO Nº014_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA LUCIO NELSON MARTINS.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0064.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000065', 'ATO Nº014_2025 - Disciplina requisitos para ser Investido no Grau 13 - Cavaleiro Noaquita ou Prussiano', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº014_2025 - Disciplina requisitos para ser Investido no Grau 13 - Cavaleiro Noaquita ou Prussiano', '/uploads/legislacao/acervo-0065.pdf'), 256), '/uploads/legislacao/acervo-0065.pdf', 'ATO Nº014_2025 - Disciplina requisitos para ser Investido no Grau 13 - Cavaleiro Noaquita ou Prussiano.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0065.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000066', 'ATO Nº015_2022 - dispensa delegado Rui Emanuel Bartella', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº015_2022 - dispensa delegado Rui Emanuel Bartella', '/uploads/legislacao/acervo-0066.pdf'), 256), '/uploads/legislacao/acervo-0066.pdf', 'ATO Nº015_2022 - dispensa delegado Rui Emanuel Bartella.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0066.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000067', 'ATO Nº015_2023 - ENCAMINHAMENTO_REAA_walmir djalma Gomes filho', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº015_2023 - ENCAMINHAMENTO_REAA_walmir djalma Gomes filho', '/uploads/legislacao/acervo-0067.pdf'), 256), '/uploads/legislacao/acervo-0067.pdf', 'ATO Nº015_2023 - ENCAMINHAMENTO_REAA_walmir djalma Gomes filho.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0067.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000068', 'ATO Nº015_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO LUCIO NELSON MARTINS, AO VALE DE CAMPINA GRANDE', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº015_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO LUCIO NELSON MARTINS, AO VALE DE CAMPINA GRANDE', '/uploads/legislacao/acervo-0068.pdf'), 256), '/uploads/legislacao/acervo-0068.pdf', 'ATO Nº015_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO LUCIO NELSON MARTINS, AO VALE DE CAMPINA GRANDE.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0068.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000069', 'ATO Nº015_2025 - nomeia delegado Adjunto_vale_Criciúma', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº015_2025 - nomeia delegado Adjunto_vale_Criciúma', '/uploads/legislacao/acervo-0069.pdf'), 256), '/uploads/legislacao/acervo-0069.pdf', 'ATO Nº015_2025 - nomeia delegado Adjunto_vale_Criciúma.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0069.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000070', 'ATO Nº016_2022 - Nomeia delegado_Luiz FRancisco Marcondes Neto', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº016_2022 - Nomeia delegado_Luiz FRancisco Marcondes Neto', '/uploads/legislacao/acervo-0070.pdf'), 256), '/uploads/legislacao/acervo-0070.pdf', 'ATO Nº016_2022 - Nomeia delegado_Luiz FRancisco Marcondes Neto.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0070.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000071', 'ATO Nº016_2023 - nomeação de membro efetivo Adauto Sambaquy', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº016_2023 - nomeação de membro efetivo Adauto Sambaquy', '/uploads/legislacao/acervo-0071.pdf'), 256), '/uploads/legislacao/acervo-0071.pdf', 'ATO Nº016_2023 - nomeação de membro efetivo Adauto Sambaquy.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0071.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000072', 'ATO Nº016_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO LUCIO NELSON MARTINS AO VALE DE CAMPINA GRANDE', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº016_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO LUCIO NELSON MARTINS AO VALE DE CAMPINA GRANDE', '/uploads/legislacao/acervo-0072.pdf'), 256), '/uploads/legislacao/acervo-0072.pdf', 'ATO Nº016_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO LUCIO NELSON MARTINS AO VALE DE CAMPINA GRANDE.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0072.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000073', 'ATO Nº016_2025 - BH_NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO SCA BH', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº016_2025 - BH_NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO SCA BH', '/uploads/legislacao/acervo-0073.pdf'), 256), '/uploads/legislacao/acervo-0073.pdf', 'ATO Nº016_2025 - BH_NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO SCA BH.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0073.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000074', 'ATO Nº017_2022 - Nomeação da Comissão de Ritualística e liturgia', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº017_2022 - Nomeação da Comissão de Ritualística e liturgia', '/uploads/legislacao/acervo-0074.pdf'), 256), '/uploads/legislacao/acervo-0074.pdf', 'ATO Nº017_2022 - Nomeação da Comissão de Ritualística e liturgia.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0074.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000075', 'ATO Nº017_2023 -  delegação de poderes_Rogério bach', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº017_2023 -  delegação de poderes_Rogério bach', '/uploads/legislacao/acervo-0075.pdf'), 256), '/uploads/legislacao/acervo-0075.pdf', 'ATO Nº017_2023 -  delegação de poderes_Rogério bach.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0075.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000076', 'ATO Nº017_2024 - nomeia sapientíssimo LNM_Campina_PB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº017_2024 - nomeia sapientíssimo LNM_Campina_PB', '/uploads/legislacao/acervo-0076.pdf'), 256), '/uploads/legislacao/acervo-0076.pdf', 'ATO Nº017_2024 - nomeia sapientíssimo LNM_Campina_PB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0076.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000077', 'ATO Nº017_2025 - BH_NOMEIA COMISSÃO DE INST REG SCA Belo Horizonte', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº017_2025 - BH_NOMEIA COMISSÃO DE INST REG SCA Belo Horizonte', '/uploads/legislacao/acervo-0077.pdf'), 256), '/uploads/legislacao/acervo-0077.pdf', 'ATO Nº017_2025 - BH_NOMEIA COMISSÃO DE INST REG SCA Belo Horizonte.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0077.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000078', 'ATO Nº018_2022 - Nomeação de Comissão chancelaria', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº018_2022 - Nomeação de Comissão chancelaria', '/uploads/legislacao/acervo-0078.pdf'), 256), '/uploads/legislacao/acervo-0078.pdf', 'ATO Nº018_2022 - Nomeação de Comissão chancelaria.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0078.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000079', 'ATO Nº018_2023 -  delegação de poderes_Lúcio Nelson Martins', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº018_2023 -  delegação de poderes_Lúcio Nelson Martins', '/uploads/legislacao/acervo-0079.pdf'), 256), '/uploads/legislacao/acervo-0079.pdf', 'ATO Nº018_2023 -  delegação de poderes_Lúcio Nelson Martins.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0079.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000080', 'ATO Nº018_2024 -nomeia membro emérito miranda', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº018_2024 -nomeia membro emérito miranda', '/uploads/legislacao/acervo-0080.pdf'), 256), '/uploads/legislacao/acervo-0080.pdf', 'ATO Nº018_2024 -nomeia membro emérito miranda.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0080.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000081', 'ATO Nº018_2025 - BH_CONFERE CARTA CONSTITUTIVA AO SCA BH', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº018_2025 - BH_CONFERE CARTA CONSTITUTIVA AO SCA BH', '/uploads/legislacao/acervo-0081.pdf'), 256), '/uploads/legislacao/acervo-0081.pdf', 'ATO Nº018_2025 - BH_CONFERE CARTA CONSTITUTIVA AO SCA BH.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0081.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000082', 'ATO Nº019_2022 - Nomeação de Comissão finanças', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº019_2022 - Nomeação de Comissão finanças', '/uploads/legislacao/acervo-0082.pdf'), 256), '/uploads/legislacao/acervo-0082.pdf', 'ATO Nº019_2022 - Nomeação de Comissão finanças.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0082.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000083', 'ATO Nº019_2023 - equivalência de grau_CARLOS ROBERTO BARBOSA', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº019_2023 - equivalência de grau_CARLOS ROBERTO BARBOSA', '/uploads/legislacao/acervo-0083.pdf'), 256), '/uploads/legislacao/acervo-0083.pdf', 'ATO Nº019_2023 - equivalência de grau_CARLOS ROBERTO BARBOSA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0083.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000084', 'ATO Nº019_2024 -nomeia membro emérito loiola', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº019_2024 -nomeia membro emérito loiola', '/uploads/legislacao/acervo-0084.pdf'), 256), '/uploads/legislacao/acervo-0084.pdf', 'ATO Nº019_2024 -nomeia membro emérito loiola.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0084.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000085', 'ATO Nº019_2025 - BH_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SCA BH', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº019_2025 - BH_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SCA BH', '/uploads/legislacao/acervo-0085.pdf'), 256), '/uploads/legislacao/acervo-0085.pdf', 'ATO Nº019_2025 - BH_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SCA BH.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0085.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000086', 'ATO Nº020_2022 - Nomeação da Comissão de Revisão do Regimento e Estatuto', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº020_2022 - Nomeação da Comissão de Revisão do Regimento e Estatuto', '/uploads/legislacao/acervo-0086.pdf'), 256), '/uploads/legislacao/acervo-0086.pdf', 'ATO Nº020_2022 - Nomeação da Comissão de Revisão do Regimento e Estatuto.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0086.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000087', 'ATO Nº020_2023 - ENCAMINHAMENTO_REAA_Edson Lopes', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº020_2023 - ENCAMINHAMENTO_REAA_Edson Lopes', '/uploads/legislacao/acervo-0087.pdf'), 256), '/uploads/legislacao/acervo-0087.pdf', 'ATO Nº020_2023 - ENCAMINHAMENTO_REAA_Edson Lopes.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0087.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000088', 'ATO Nº020_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA CARLOS CASTILHO (4)', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº020_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA CARLOS CASTILHO (4)', '/uploads/legislacao/acervo-0088.pdf'), 256), '/uploads/legislacao/acervo-0088.pdf', 'ATO Nº020_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA CARLOS CASTILHO (4).pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0088.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000089', 'ATO Nº020_2025 - BH_nomeia delegado SCA BH', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº020_2025 - BH_nomeia delegado SCA BH', '/uploads/legislacao/acervo-0089.pdf'), 256), '/uploads/legislacao/acervo-0089.pdf', 'ATO Nº020_2025 - BH_nomeia delegado SCA BH.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0089.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000090', 'ATO Nº021_2022 - equivalência do grau 12_Avelino Lombardi Junior', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº021_2022 - equivalência do grau 12_Avelino Lombardi Junior', '/uploads/legislacao/acervo-0090.pdf'), 256), '/uploads/legislacao/acervo-0090.pdf', 'ATO Nº021_2022 - equivalência do grau 12_Avelino Lombardi Junior.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0090.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000091', 'ATO Nº021_2023 - ENCAMINHAMENTO_REAA_João Severino Cunha', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº021_2023 - ENCAMINHAMENTO_REAA_João Severino Cunha', '/uploads/legislacao/acervo-0091.pdf'), 256), '/uploads/legislacao/acervo-0091.pdf', 'ATO Nº021_2023 - ENCAMINHAMENTO_REAA_João Severino Cunha.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0091.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000092', 'ATO Nº021_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO CARLOS CASTILHO JOINVILLE_SC (1)', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº021_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO CARLOS CASTILHO JOINVILLE_SC (1)', '/uploads/legislacao/acervo-0092.pdf'), 256), '/uploads/legislacao/acervo-0092.pdf', 'ATO Nº021_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO CARLOS CASTILHO JOINVILLE_SC (1).pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0092.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000093', 'ATO Nº021_2025 - Nova ODessa NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO Guardiões de Jerusalém', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº021_2025 - Nova ODessa NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO Guardiões de Jerusalém', '/uploads/legislacao/acervo-0093.pdf'), 256), '/uploads/legislacao/acervo-0093.pdf', 'ATO Nº021_2025 - Nova ODessa NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO Guardiões de Jerusalém.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0093.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000094', 'ATO Nº022_2023 - nomeação de membro efetivo Trevisan', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº022_2023 - nomeação de membro efetivo Trevisan', '/uploads/legislacao/acervo-0094.pdf'), 256), '/uploads/legislacao/acervo-0094.pdf', 'ATO Nº022_2023 - nomeação de membro efetivo Trevisan.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0094.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000095', 'ATO Nº022_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO CARLOS CASTILHO JOINVILLE_SC (1)', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº022_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO CARLOS CASTILHO JOINVILLE_SC (1)', '/uploads/legislacao/acervo-0095.pdf'), 256), '/uploads/legislacao/acervo-0095.pdf', 'ATO Nº022_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO CARLOS CASTILHO JOINVILLE_SC (1).pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0095.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000096', 'ATO Nº022_2025 - Nova Odessa_NOMEIA COMISSÃO DE INST REG SCA Guardiões', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº022_2025 - Nova Odessa_NOMEIA COMISSÃO DE INST REG SCA Guardiões', '/uploads/legislacao/acervo-0096.pdf'), 256), '/uploads/legislacao/acervo-0096.pdf', 'ATO Nº022_2025 - Nova Odessa_NOMEIA COMISSÃO DE INST REG SCA Guardiões.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0096.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000097', 'ATO Nº023_2022 - dispensa a pedido membro da Comissão chancelaria_Vidal', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº023_2022 - dispensa a pedido membro da Comissão chancelaria_Vidal', '/uploads/legislacao/acervo-0097.pdf'), 256), '/uploads/legislacao/acervo-0097.pdf', 'ATO Nº023_2022 - dispensa a pedido membro da Comissão chancelaria_Vidal.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0097.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000098', 'ATO Nº023_2023 - Nomeia delegado_André Luiz Macial_Curitiba', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº023_2023 - Nomeia delegado_André Luiz Macial_Curitiba', '/uploads/legislacao/acervo-0098.pdf'), 256), '/uploads/legislacao/acervo-0098.pdf', 'ATO Nº023_2023 - Nomeia delegado_André Luiz Macial_Curitiba.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0098.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000099', 'ATO Nº023_2024 - nomeia sapientíssimo Carlos Castilho_Joinville_SC (1)', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº023_2024 - nomeia sapientíssimo Carlos Castilho_Joinville_SC (1)', '/uploads/legislacao/acervo-0099.pdf'), 256), '/uploads/legislacao/acervo-0099.pdf', 'ATO Nº023_2024 - nomeia sapientíssimo Carlos Castilho_Joinville_SC (1).pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0099.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000100', 'ATO Nº023_2025 - Nova ODessa_CONFERE CARTA CONSTITUTIVA AO SCA Guardiões', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº023_2025 - Nova ODessa_CONFERE CARTA CONSTITUTIVA AO SCA Guardiões', '/uploads/legislacao/acervo-0100.pdf'), 256), '/uploads/legislacao/acervo-0100.pdf', 'ATO Nº023_2025 - Nova ODessa_CONFERE CARTA CONSTITUTIVA AO SCA Guardiões.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0100.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000101', 'ATO Nº024_2022 - Nomeação membro da Comissão chancelaria_renato feijó', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº024_2022 - Nomeação membro da Comissão chancelaria_renato feijó', '/uploads/legislacao/acervo-0101.pdf'), 256), '/uploads/legislacao/acervo-0101.pdf', 'ATO Nº024_2022 - Nomeação membro da Comissão chancelaria_renato feijó.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0101.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000102', 'ATO Nº024_2023 - Homologa e reconhece administracão do Capítulo Monte Sagrado', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº024_2023 - Homologa e reconhece administracão do Capítulo Monte Sagrado', '/uploads/legislacao/acervo-0102.pdf'), 256), '/uploads/legislacao/acervo-0102.pdf', 'ATO Nº024_2023 - Homologa e reconhece administracão do Capítulo Monte Sagrado.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0102.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000103', 'ATO Nº024_2024 - desligamento_licença_irregular_SGCAB (1) (1)', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº024_2024 - desligamento_licença_irregular_SGCAB (1) (1)', '/uploads/legislacao/acervo-0103.pdf'), 256), '/uploads/legislacao/acervo-0103.pdf', 'ATO Nº024_2024 - desligamento_licença_irregular_SGCAB (1) (1).pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0103.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000104', 'ATO Nº024_2025 - Nova Odessa_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SCA Guardiões', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº024_2025 - Nova Odessa_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SCA Guardiões', '/uploads/legislacao/acervo-0104.pdf'), 256), '/uploads/legislacao/acervo-0104.pdf', 'ATO Nº024_2025 - Nova Odessa_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SCA Guardiões.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0104.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000105', 'ATO Nº025_2022 - Homologa e reconhece administracão de Loja e capítulo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº025_2022 - Homologa e reconhece administracão de Loja e capítulo', '/uploads/legislacao/acervo-0105.pdf'), 256), '/uploads/legislacao/acervo-0105.pdf', 'ATO Nº025_2022 - Homologa e reconhece administracão de Loja e capítulo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0105.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000106', 'ATO Nº025_2023 - Nomeia comissão Monte Sagrado ', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº025_2023 - Nomeia comissão Monte Sagrado ', '/uploads/legislacao/acervo-0106.pdf'), 256), '/uploads/legislacao/acervo-0106.pdf', 'ATO Nº025_2023 - Nomeia comissão Monte Sagrado .pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0106.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000107', 'ATO Nº025_2024 -  EQUIVALÊNCIA OU CONVALIDAÇÃO – DIRETRIZES PARA HABILITAÇÃO AO O GRAU SUPERIOR', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº025_2024 -  EQUIVALÊNCIA OU CONVALIDAÇÃO – DIRETRIZES PARA HABILITAÇÃO AO O GRAU SUPERIOR', '/uploads/legislacao/acervo-0107.pdf'), 256), '/uploads/legislacao/acervo-0107.pdf', 'ATO Nº025_2024 -  EQUIVALÊNCIA OU CONVALIDAÇÃO – DIRETRIZES PARA HABILITAÇÃO AO O GRAU SUPERIOR.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0107.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000108', 'ATO Nº025_2025 - Nova Odessa_nomeia delegadoSCA Guardiões', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº025_2025 - Nova Odessa_nomeia delegadoSCA Guardiões', '/uploads/legislacao/acervo-0108.pdf'), 256), '/uploads/legislacao/acervo-0108.pdf', 'ATO Nº025_2025 - Nova Odessa_nomeia delegadoSCA Guardiões.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0108.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000109', 'ATO Nº026_2022 - carta constitutiva a Loja de Perfeição Haroldo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº026_2022 - carta constitutiva a Loja de Perfeição Haroldo', '/uploads/legislacao/acervo-0109.pdf'), 256), '/uploads/legislacao/acervo-0109.pdf', 'ATO Nº026_2022 - carta constitutiva a Loja de Perfeição Haroldo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0109.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000110', 'ATO Nº026_2023 - Grau 13_Abelardo Camilo Bridi', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº026_2023 - Grau 13_Abelardo Camilo Bridi', '/uploads/legislacao/acervo-0110.pdf'), 256), '/uploads/legislacao/acervo-0110.pdf', 'ATO Nº026_2023 - Grau 13_Abelardo Camilo Bridi.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0110.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000111', 'ATO Nº026_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA Arauto e perfeita união sp', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº026_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA Arauto e perfeita união sp', '/uploads/legislacao/acervo-0111.pdf'), 256), '/uploads/legislacao/acervo-0111.pdf', 'ATO Nº026_2024 - NOMEIA COMISSÃO DE INSTALAÇÃO E REGULARIZAÇÃO DO SUBLIME CAPÍTULO ADONHIRAMITA Arauto e perfeita união sp.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0111.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000112', 'ATO Nº026_2025 - GRavatal NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO_Gravatal', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº026_2025 - GRavatal NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO_Gravatal', '/uploads/legislacao/acervo-0112.pdf'), 256), '/uploads/legislacao/acervo-0112.pdf', 'ATO Nº026_2025 - GRavatal NOMEIA COMISSÃO PARA PROVER IRMÃOS A GRAUS ADEQUADOS AO FUNCIONAMENTO DA CORPORAÇÁO_Gravatal.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0112.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000113', 'ATO Nº027_2022 - Nomeia comissão Haroldo Prates', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº027_2022 - Nomeia comissão Haroldo Prates', '/uploads/legislacao/acervo-0113.pdf'), 256), '/uploads/legislacao/acervo-0113.pdf', 'ATO Nº027_2022 - Nomeia comissão Haroldo Prates.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0113.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000114', 'ATO Nº027_2023 - dispensa delegado_paulo herz', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº027_2023 - dispensa delegado_paulo herz', '/uploads/legislacao/acervo-0114.pdf'), 256), '/uploads/legislacao/acervo-0114.pdf', 'ATO Nº027_2023 - dispensa delegado_paulo herz.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0114.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000115', 'ATO Nº027_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO prefeita união mogi mirim sp', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº027_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO prefeita união mogi mirim sp', '/uploads/legislacao/acervo-0115.pdf'), 256), '/uploads/legislacao/acervo-0115.pdf', 'ATO Nº027_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO prefeita união mogi mirim sp.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0115.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000116', 'ATO Nº027_2025 - Gravatal_NOMEIA COMISSÃO DE INST REG SCA Gelson Cláudio e LP Vamilson Prudêncio', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº027_2025 - Gravatal_NOMEIA COMISSÃO DE INST REG SCA Gelson Cláudio e LP Vamilson Prudêncio', '/uploads/legislacao/acervo-0116.pdf'), 256), '/uploads/legislacao/acervo-0116.pdf', 'ATO Nº027_2025 - Gravatal_NOMEIA COMISSÃO DE INST REG SCA Gelson Cláudio e LP Vamilson Prudêncio.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0116.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000117', 'ATO Nº028_2022 - Nomeia delegado_Julio Cesar_da_silva', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº028_2022 - Nomeia delegado_Julio Cesar_da_silva', '/uploads/legislacao/acervo-0117.pdf'), 256), '/uploads/legislacao/acervo-0117.pdf', 'ATO Nº028_2022 - Nomeia delegado_Julio Cesar_da_silva.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0117.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000118', 'ATO Nº028_2023 - delega poderes de representação_Roberval Savi', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº028_2023 - delega poderes de representação_Roberval Savi', '/uploads/legislacao/acervo-0118.pdf'), 256), '/uploads/legislacao/acervo-0118.pdf', 'ATO Nº028_2023 - delega poderes de representação_Roberval Savi.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0118.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000119', 'ATO Nº028_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO perfeita uniao_mogi mirim_sp', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº028_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO perfeita uniao_mogi mirim_sp', '/uploads/legislacao/acervo-0119.pdf'), 256), '/uploads/legislacao/acervo-0119.pdf', 'ATO Nº028_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO perfeita uniao_mogi mirim_sp.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0119.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000120', 'ATO Nº028_2025 - Gravatal_CONFERE CARTA CONSTITUTIVA AO SCA Gelson Cláudio e LP Vamilson Prudêncio', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº028_2025 - Gravatal_CONFERE CARTA CONSTITUTIVA AO SCA Gelson Cláudio e LP Vamilson Prudêncio', '/uploads/legislacao/acervo-0120.pdf'), 256), '/uploads/legislacao/acervo-0120.pdf', 'ATO Nº028_2025 - Gravatal_CONFERE CARTA CONSTITUTIVA AO SCA Gelson Cláudio e LP Vamilson Prudêncio.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0120.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000121', 'ATO Nº029_2022 - Homologa e reconhece administracão de Loja Haroldo Prates', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº029_2022 - Homologa e reconhece administracão de Loja Haroldo Prates', '/uploads/legislacao/acervo-0121.pdf'), 256), '/uploads/legislacao/acervo-0121.pdf', 'ATO Nº029_2022 - Homologa e reconhece administracão de Loja Haroldo Prates.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0121.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000122', 'ATO Nº029_2023 -exclui membro efetivo Sambaquy', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº029_2023 -exclui membro efetivo Sambaquy', '/uploads/legislacao/acervo-0122.pdf'), 256), '/uploads/legislacao/acervo-0122.pdf', 'ATO Nº029_2023 -exclui membro efetivo Sambaquy.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0122.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000123', 'ATO Nº029_2024 - nomeia sapientíssimo perfeita união mogi mirim sp', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº029_2024 - nomeia sapientíssimo perfeita união mogi mirim sp', '/uploads/legislacao/acervo-0123.pdf'), 256), '/uploads/legislacao/acervo-0123.pdf', 'ATO Nº029_2024 - nomeia sapientíssimo perfeita união mogi mirim sp.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0123.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000124', 'ATO Nº029_2025 - Gravatal_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Vamilson e SCA Gelson', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº029_2025 - Gravatal_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Vamilson e SCA Gelson', '/uploads/legislacao/acervo-0124.pdf'), 256), '/uploads/legislacao/acervo-0124.pdf', 'ATO Nº029_2025 - Gravatal_HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Vamilson e SCA Gelson.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0124.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000125', 'ATO Nº030_2022 - EXCLUI MEMBRO EFETIVO falecimento', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº030_2022 - EXCLUI MEMBRO EFETIVO falecimento', '/uploads/legislacao/acervo-0125.pdf'), 256), '/uploads/legislacao/acervo-0125.pdf', 'ATO Nº030_2022 - EXCLUI MEMBRO EFETIVO falecimento.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0125.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000126', 'ATO Nº030_2023 - Nomeia comissão Monte Moriá', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº030_2023 - Nomeia comissão Monte Moriá', '/uploads/legislacao/acervo-0126.pdf'), 256), '/uploads/legislacao/acervo-0126.pdf', 'ATO Nº030_2023 - Nomeia comissão Monte Moriá.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0126.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000127', 'ATO Nº030_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO ARAUTOS MOGI DAS CRUZES SP', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº030_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO ARAUTOS MOGI DAS CRUZES SP', '/uploads/legislacao/acervo-0127.pdf'), 256), '/uploads/legislacao/acervo-0127.pdf', 'ATO Nº030_2024 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO DO SUBLIME CAPÍTULO ARAUTOS MOGI DAS CRUZES SP.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0127.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000128', 'ATO Nº030_2025 - Gravatal_nomeia delegado LP Vamilson e SCA GElson', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº030_2025 - Gravatal_nomeia delegado LP Vamilson e SCA GElson', '/uploads/legislacao/acervo-0128.pdf'), 256), '/uploads/legislacao/acervo-0128.pdf', 'ATO Nº030_2025 - Gravatal_nomeia delegado LP Vamilson e SCA GElson.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0128.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000129', 'ATO Nº031_2022 - equivalência de grau_Ivan Benatto_e_Josão_Ildes_Assis_SP', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº031_2022 - equivalência de grau_Ivan Benatto_e_Josão_Ildes_Assis_SP', '/uploads/legislacao/acervo-0129.pdf'), 256), '/uploads/legislacao/acervo-0129.pdf', 'ATO Nº031_2022 - equivalência de grau_Ivan Benatto_e_Josão_Ildes_Assis_SP.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0129.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000130', 'ATO Nº031_2023 - Homologa e reconhece administracão do Capítulo Monte Moria', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº031_2023 - Homologa e reconhece administracão do Capítulo Monte Moria', '/uploads/legislacao/acervo-0130.pdf'), 256), '/uploads/legislacao/acervo-0130.pdf', 'ATO Nº031_2023 - Homologa e reconhece administracão do Capítulo Monte Moria.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0130.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000131', 'ATO Nº031_2024 - nomeia sapientíssimo arautos_mogi das cruzes sp', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº031_2024 - nomeia sapientíssimo arautos_mogi das cruzes sp', '/uploads/legislacao/acervo-0131.pdf'), 256), '/uploads/legislacao/acervo-0131.pdf', 'ATO Nº031_2024 - nomeia sapientíssimo arautos_mogi das cruzes sp.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0131.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000132', 'ATO Nº031_2025 - nomeia sapientíssimo SCA Belo Horizonte', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº031_2025 - nomeia sapientíssimo SCA Belo Horizonte', '/uploads/legislacao/acervo-0132.pdf'), 256), '/uploads/legislacao/acervo-0132.pdf', 'ATO Nº031_2025 - nomeia sapientíssimo SCA Belo Horizonte.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0132.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000133', 'ATO Nº032_2022 - equivalência de grau_Allyson Silva Cardoso_Finis Originin_SP', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº032_2022 - equivalência de grau_Allyson Silva Cardoso_Finis Originin_SP', '/uploads/legislacao/acervo-0133.pdf'), 256), '/uploads/legislacao/acervo-0133.pdf', 'ATO Nº032_2022 - equivalência de grau_Allyson Silva Cardoso_Finis Originin_SP.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0133.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000134', 'ATO Nº032_2023 -carta constitutiva Monte Moria', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº032_2023 -carta constitutiva Monte Moria', '/uploads/legislacao/acervo-0134.pdf'), 256), '/uploads/legislacao/acervo-0134.pdf', 'ATO Nº032_2023 -carta constitutiva Monte Moria.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0134.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000135', 'ATO Nº032_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO CARLOS arautos spo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº032_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO CARLOS arautos spo', '/uploads/legislacao/acervo-0135.pdf'), 256), '/uploads/legislacao/acervo-0135.pdf', 'ATO Nº032_2024 - CONFERE CARTA CONSTITUTIVA AO SUBLIME CAPÍTULO CARLOS arautos spo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0135.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000136', 'ATO Nº032_2025 - nomeia sapientíssimo SCA nova odessa_sp', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº032_2025 - nomeia sapientíssimo SCA nova odessa_sp', '/uploads/legislacao/acervo-0136.pdf'), 256), '/uploads/legislacao/acervo-0136.pdf', 'ATO Nº032_2025 - nomeia sapientíssimo SCA nova odessa_sp.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0136.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000137', 'ATO Nº033_2023 -nomeia delegado tubarão', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº033_2023 -nomeia delegado tubarão', '/uploads/legislacao/acervo-0137.pdf'), 256), '/uploads/legislacao/acervo-0137.pdf', 'ATO Nº033_2023 -nomeia delegado tubarão.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0137.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000138', 'ATO Nº033_2024 - nomeia delegado mogi das cruzes', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº033_2024 - nomeia delegado mogi das cruzes', '/uploads/legislacao/acervo-0138.pdf'), 256), '/uploads/legislacao/acervo-0138.pdf', 'ATO Nº033_2024 - nomeia delegado mogi das cruzes.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0138.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000139', 'ATO Nº034_2022 - Homologa e reconhece administracão de cruzeiro do vale', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº034_2022 - Homologa e reconhece administracão de cruzeiro do vale', '/uploads/legislacao/acervo-0139.pdf'), 256), '/uploads/legislacao/acervo-0139.pdf', 'ATO Nº034_2022 - Homologa e reconhece administracão de cruzeiro do vale.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0139.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000140', 'ATO Nº034_2023 - INSTITUI SISTEMA DE GERENCIAMENTO DE CORPORAÇAO FILOSÓFICA (SIGEF) PARA O SGACB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº034_2023 - INSTITUI SISTEMA DE GERENCIAMENTO DE CORPORAÇAO FILOSÓFICA (SIGEF) PARA O SGACB', '/uploads/legislacao/acervo-0140.pdf'), 256), '/uploads/legislacao/acervo-0140.pdf', 'ATO Nº034_2023 - INSTITUI SISTEMA DE GERENCIAMENTO DE CORPORAÇAO FILOSÓFICA (SIGEF) PARA O SGACB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0140.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000141', 'ATO Nº034_2024 -  mudança de domicílio de corporação filosófica', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº034_2024 -  mudança de domicílio de corporação filosófica', '/uploads/legislacao/acervo-0141.pdf'), 256), '/uploads/legislacao/acervo-0141.pdf', 'ATO Nº034_2024 -  mudança de domicílio de corporação filosófica.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0141.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000142', 'ATO Nº034_2025 -  DIRETRIZES PARA investidura ao grau 13', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº034_2025 -  DIRETRIZES PARA investidura ao grau 13', '/uploads/legislacao/acervo-0142.pdf'), 256), '/uploads/legislacao/acervo-0142.pdf', 'ATO Nº034_2025 -  DIRETRIZES PARA investidura ao grau 13.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0142.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000143', 'ATO Nº035_2022 - carta constitutiva a Cruzeiro do Vale', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº035_2022 - carta constitutiva a Cruzeiro do Vale', '/uploads/legislacao/acervo-0143.pdf'), 256), '/uploads/legislacao/acervo-0143.pdf', 'ATO Nº035_2022 - carta constitutiva a Cruzeiro do Vale.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0143.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000144', 'ATO Nº035_2023 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2023_2024', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº035_2023 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2023_2024', '/uploads/legislacao/acervo-0144.pdf'), 256), '/uploads/legislacao/acervo-0144.pdf', 'ATO Nº035_2023 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2023_2024.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0144.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000145', 'ATO Nº035_2024 -concede título emérito João Gagliard', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº035_2024 -concede título emérito João Gagliard', '/uploads/legislacao/acervo-0145.pdf'), 256), '/uploads/legislacao/acervo-0145.pdf', 'ATO Nº035_2024 -concede título emérito João Gagliard.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0145.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000146', 'ATO Nº035_2025 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Monte Moriá', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº035_2025 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Monte Moriá', '/uploads/legislacao/acervo-0146.pdf'), 256), '/uploads/legislacao/acervo-0146.pdf', 'ATO Nº035_2025 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Monte Moriá.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0146.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000147', 'ATO Nº036_2022 - Nomeia delegado_guilherme oimizzolo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº036_2022 - Nomeia delegado_guilherme oimizzolo', '/uploads/legislacao/acervo-0147.pdf'), 256), '/uploads/legislacao/acervo-0147.pdf', 'ATO Nº036_2022 - Nomeia delegado_guilherme oimizzolo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0147.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000148', 'ATO Nº036_2023 - Extingue Comissão SOGEF', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº036_2023 - Extingue Comissão SOGEF', '/uploads/legislacao/acervo-0148.pdf'), 256), '/uploads/legislacao/acervo-0148.pdf', 'ATO Nº036_2023 - Extingue Comissão SOGEF.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0148.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000149', 'ATO Nº036_2024 -concede título benemérito paulo fernando pinheiro', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº036_2024 -concede título benemérito paulo fernando pinheiro', '/uploads/legislacao/acervo-0149.pdf'), 256), '/uploads/legislacao/acervo-0149.pdf', 'ATO Nº036_2024 -concede título benemérito paulo fernando pinheiro.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0149.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000150', 'ATO Nº036_2025 - Disciplina requisitos para ser Iniciação ao Grau 4', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº036_2025 - Disciplina requisitos para ser Iniciação ao Grau 4', '/uploads/legislacao/acervo-0150.pdf'), 256), '/uploads/legislacao/acervo-0150.pdf', 'ATO Nº036_2025 - Disciplina requisitos para ser Iniciação ao Grau 4.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0150.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000151', 'ATO Nº037_2022 - Maçom Emérito Bortoluzzi', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº037_2022 - Maçom Emérito Bortoluzzi', '/uploads/legislacao/acervo-0151.pdf'), 256), '/uploads/legislacao/acervo-0151.pdf', 'ATO Nº037_2022 - Maçom Emérito Bortoluzzi.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0151.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000152', 'ATO Nº037_2023 - Extingue Comissão REVISÃO E ATUALIZAÇÃO DO ESTATUTO E REGIMENTO INTERNO DO SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº037_2023 - Extingue Comissão REVISÃO E ATUALIZAÇÃO DO ESTATUTO E REGIMENTO INTERNO DO SGCAB', '/uploads/legislacao/acervo-0152.pdf'), 256), '/uploads/legislacao/acervo-0152.pdf', 'ATO Nº037_2023 - Extingue Comissão REVISÃO E ATUALIZAÇÃO DO ESTATUTO E REGIMENTO INTERNO DO SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0152.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000153', 'ATO Nº037_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA MONTE SAGRADO_CURITIBA_PR', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº037_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA MONTE SAGRADO_CURITIBA_PR', '/uploads/legislacao/acervo-0153.pdf'), 256), '/uploads/legislacao/acervo-0153.pdf', 'ATO Nº037_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA MONTE SAGRADO_CURITIBA_PR.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0153.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000154', 'ATO Nº037_2025 - Homologa ritual do grau 11_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº037_2025 - Homologa ritual do grau 11_2025', '/uploads/legislacao/acervo-0154.pdf'), 256), '/uploads/legislacao/acervo-0154.pdf', 'ATO Nº037_2025 - Homologa ritual do grau 11_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0154.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000155', 'ATO Nº038_2023 - Nomeia Comissão de Constituição e Justiça do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº038_2023 - Nomeia Comissão de Constituição e Justiça do SGCAB', '/uploads/legislacao/acervo-0155.pdf'), 256), '/uploads/legislacao/acervo-0155.pdf', 'ATO Nº038_2023 - Nomeia Comissão de Constituição e Justiça do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0155.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000156', 'ATO Nº038_2024 - encaminhamento_REAA_José Urubatã da Silva', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº038_2024 - encaminhamento_REAA_José Urubatã da Silva', '/uploads/legislacao/acervo-0156.pdf'), 256), '/uploads/legislacao/acervo-0156.pdf', 'ATO Nº038_2024 - encaminhamento_REAA_José Urubatã da Silva.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0156.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000157', 'ATO Nº038_2025 - Homologa ritual do grau 13_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº038_2025 - Homologa ritual do grau 13_2025', '/uploads/legislacao/acervo-0157.pdf'), 256), '/uploads/legislacao/acervo-0157.pdf', 'ATO Nº038_2025 - Homologa ritual do grau 13_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0157.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000158', 'ATO Nº039_2023 - Homologa ritual do grau 6', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº039_2023 - Homologa ritual do grau 6', '/uploads/legislacao/acervo-0158.pdf'), 256), '/uploads/legislacao/acervo-0158.pdf', 'ATO Nº039_2023 - Homologa ritual do grau 6.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0158.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000159', 'ATO Nº039_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Campina do Gregório_Chapecó', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº039_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Campina do Gregório_Chapecó', '/uploads/legislacao/acervo-0159.pdf'), 256), '/uploads/legislacao/acervo-0159.pdf', 'ATO Nº039_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Campina do Gregório_Chapecó.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0159.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000160', 'ATO Nº039_2025 - Homologa ritual de inst_regul_corp_filos_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº039_2025 - Homologa ritual de inst_regul_corp_filos_2025', '/uploads/legislacao/acervo-0160.pdf'), 256), '/uploads/legislacao/acervo-0160.pdf', 'ATO Nº039_2025 - Homologa ritual de inst_regul_corp_filos_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0160.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000161', 'ATO Nº040_2022 - Homologa e reconhece administracão da Arno Gebler', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº040_2022 - Homologa e reconhece administracão da Arno Gebler', '/uploads/legislacao/acervo-0161.pdf'), 256), '/uploads/legislacao/acervo-0161.pdf', 'ATO Nº040_2022 - Homologa e reconhece administracão da Arno Gebler.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0161.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000162', 'ATO Nº040_2024 - define padrão da bandeira e estandarte do sgcab', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº040_2024 - define padrão da bandeira e estandarte do sgcab', '/uploads/legislacao/acervo-0162.pdf'), 256), '/uploads/legislacao/acervo-0162.pdf', 'ATO Nº040_2024 - define padrão da bandeira e estandarte do sgcab.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0162.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000163', 'ATO Nº040_2025 - Homologa ritual resumido grau 4_12_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº040_2025 - Homologa ritual resumido grau 4_12_2025', '/uploads/legislacao/acervo-0163.pdf'), 256), '/uploads/legislacao/acervo-0163.pdf', 'ATO Nº040_2025 - Homologa ritual resumido grau 4_12_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0163.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000164', 'ATO Nº041_2022 - Nomeia delegado_arquelau', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº041_2022 - Nomeia delegado_arquelau', '/uploads/legislacao/acervo-0164.pdf'), 256), '/uploads/legislacao/acervo-0164.pdf', 'ATO Nº041_2022 - Nomeia delegado_arquelau.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0164.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000165', 'ATO Nº041_2024 - Convocação Assembléia Membros efetivos', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº041_2024 - Convocação Assembléia Membros efetivos', '/uploads/legislacao/acervo-0165.pdf'), 256), '/uploads/legislacao/acervo-0165.pdf', 'ATO Nº041_2024 - Convocação Assembléia Membros efetivos.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0165.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000166', 'ATO Nº041_2025 - Homologa ritual Loja de mesa Perfeição e Capitulares_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº041_2025 - Homologa ritual Loja de mesa Perfeição e Capitulares_2025', '/uploads/legislacao/acervo-0166.pdf'), 256), '/uploads/legislacao/acervo-0166.pdf', 'ATO Nº041_2025 - Homologa ritual Loja de mesa Perfeição e Capitulares_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0166.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000167', 'ATO Nº042_2022 -  delegação de poderes_Willian Reis', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº042_2022 -  delegação de poderes_Willian Reis', '/uploads/legislacao/acervo-0167.pdf'), 256), '/uploads/legislacao/acervo-0167.pdf', 'ATO Nº042_2022 -  delegação de poderes_Willian Reis.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0167.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000168', 'ATO Nº042_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Joacyr Perdigão_Rio de Janeiro', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº042_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Joacyr Perdigão_Rio de Janeiro', '/uploads/legislacao/acervo-0168.pdf'), 256), '/uploads/legislacao/acervo-0168.pdf', 'ATO Nº042_2024 - NOMEIA COMISSÃO DE INVESTIDURA AO GRAU 13 NO SCA Joacyr Perdigão_Rio de Janeiro.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0168.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000169', 'ATO Nº042_2025 - Homologa Ritual dos Trabalhos de Mesa para as Lojas de Perfeição e Capitulares Exclusivo SGCAB_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº042_2025 - Homologa Ritual dos Trabalhos de Mesa para as Lojas de Perfeição e Capitulares Exclusivo SGCAB_2025', '/uploads/legislacao/acervo-0169.pdf'), 256), '/uploads/legislacao/acervo-0169.pdf', 'ATO Nº042_2025 - Homologa Ritual dos Trabalhos de Mesa para as Lojas de Perfeição e Capitulares Exclusivo SGCAB_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0169.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000170', 'ATO Nº043_2022 - disciplina procedimentos para iniciação aos graus do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº043_2022 - disciplina procedimentos para iniciação aos graus do SGCAB', '/uploads/legislacao/acervo-0170.pdf'), 256), '/uploads/legislacao/acervo-0170.pdf', 'ATO Nº043_2022 - disciplina procedimentos para iniciação aos graus do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0170.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000171', 'ATO Nº043_2023 - Homologa e reconhece administracão da Loja de Perfeição Mário da Silva', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº043_2023 - Homologa e reconhece administracão da Loja de Perfeição Mário da Silva', '/uploads/legislacao/acervo-0171.pdf'), 256), '/uploads/legislacao/acervo-0171.pdf', 'ATO Nº043_2023 - Homologa e reconhece administracão da Loja de Perfeição Mário da Silva.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0171.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000172', 'ATO Nº043_2024 - nomeia delegado dagoberto rio de janeiro', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº043_2024 - nomeia delegado dagoberto rio de janeiro', '/uploads/legislacao/acervo-0172.pdf'), 256), '/uploads/legislacao/acervo-0172.pdf', 'ATO Nº043_2024 - nomeia delegado dagoberto rio de janeiro.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0172.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000173', 'ATO Nº043_2025 - Homologa Ritual de posse Patriarca e administração do SGCAB_Exclusivo SGCAB_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº043_2025 - Homologa Ritual de posse Patriarca e administração do SGCAB_Exclusivo SGCAB_2025', '/uploads/legislacao/acervo-0173.pdf'), 256), '/uploads/legislacao/acervo-0173.pdf', 'ATO Nº043_2025 - Homologa Ritual de posse Patriarca e administração do SGCAB_Exclusivo SGCAB_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0173.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000174', 'ATO Nº044_2022 Tabela de Taxas_2023', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº044_2022 Tabela de Taxas_2023', '/uploads/legislacao/acervo-0174.pdf'), 256), '/uploads/legislacao/acervo-0174.pdf', 'ATO Nº044_2022 Tabela de Taxas_2023.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0174.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000175', 'ATO Nº044_2023 - Homologa e reconhece administracão do Sublime Caítulo Augusto Caser', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº044_2023 - Homologa e reconhece administracão do Sublime Caítulo Augusto Caser', '/uploads/legislacao/acervo-0175.pdf'), 256), '/uploads/legislacao/acervo-0175.pdf', 'ATO Nº044_2023 - Homologa e reconhece administracão do Sublime Caítulo Augusto Caser.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0175.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000176', 'ATO Nº044_2024 - nomeia delegado Robson - Adjunto rio de janeiro', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº044_2024 - nomeia delegado Robson - Adjunto rio de janeiro', '/uploads/legislacao/acervo-0176.pdf'), 256), '/uploads/legislacao/acervo-0176.pdf', 'ATO Nº044_2024 - nomeia delegado Robson - Adjunto rio de janeiro.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0176.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000177', 'ATO Nº044_2025 - dispensa delegado do patriarca_Roberval Silton Savi', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº044_2025 - dispensa delegado do patriarca_Roberval Silton Savi', '/uploads/legislacao/acervo-0177.pdf'), 256), '/uploads/legislacao/acervo-0177.pdf', 'ATO Nº044_2025 - dispensa delegado do patriarca_Roberval Silton Savi.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0177.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000178', 'ATO Nº045_2022 - ratifica a criação do Barrete do gr 13', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº045_2022 - ratifica a criação do Barrete do gr 13', '/uploads/legislacao/acervo-0178.pdf'), 256), '/uploads/legislacao/acervo-0178.pdf', 'ATO Nº045_2022 - ratifica a criação do Barrete do gr 13.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0178.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000179', 'ATO Nº045_2024 - medalha do mérito a dedicação_alberto conde', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº045_2024 - medalha do mérito a dedicação_alberto conde', '/uploads/legislacao/acervo-0179.pdf'), 256), '/uploads/legislacao/acervo-0179.pdf', 'ATO Nº045_2024 - medalha do mérito a dedicação_alberto conde.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0179.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000180', 'ATO Nº045_2025 - encaminhamento_REAA_Lucio Nelson Martins Filho', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº045_2025 - encaminhamento_REAA_Lucio Nelson Martins Filho', '/uploads/legislacao/acervo-0180.pdf'), 256), '/uploads/legislacao/acervo-0180.pdf', 'ATO Nº045_2025 - encaminhamento_REAA_Lucio Nelson Martins Filho.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0180.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000181', 'ATO Nº046_2022 - Suspensão dos Trabalhos de Capítulo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº046_2022 - Suspensão dos Trabalhos de Capítulo', '/uploads/legislacao/acervo-0181.pdf'), 256), '/uploads/legislacao/acervo-0181.pdf', 'ATO Nº046_2022 - Suspensão dos Trabalhos de Capítulo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0181.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000182', 'ATO Nº046_2023 - Homologa ritual de mesa das corporações filosóficas do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº046_2023 - Homologa ritual de mesa das corporações filosóficas do SGCAB', '/uploads/legislacao/acervo-0182.pdf'), 256), '/uploads/legislacao/acervo-0182.pdf', 'ATO Nº046_2023 - Homologa ritual de mesa das corporações filosóficas do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0182.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000183', 'ATO Nº046_2024 - Institui o pelerine para Vice Patriarca e Patriarca de Honra do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº046_2024 - Institui o pelerine para Vice Patriarca e Patriarca de Honra do SGCAB', '/uploads/legislacao/acervo-0183.pdf'), 256), '/uploads/legislacao/acervo-0183.pdf', 'ATO Nº046_2024 - Institui o pelerine para Vice Patriarca e Patriarca de Honra do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0183.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000184', 'ATO Nº046_2025 - suspende atividades Loja Perfeição Joaçaba_SC', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº046_2025 - suspende atividades Loja Perfeição Joaçaba_SC', '/uploads/legislacao/acervo-0184.pdf'), 256), '/uploads/legislacao/acervo-0184.pdf', 'ATO Nº046_2025 - suspende atividades Loja Perfeição Joaçaba_SC.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0184.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000185', 'ATO Nº047_2022 - Nomeia delegado_Roberval', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº047_2022 - Nomeia delegado_Roberval', '/uploads/legislacao/acervo-0185.pdf'), 256), '/uploads/legislacao/acervo-0185.pdf', 'ATO Nº047_2022 - Nomeia delegado_Roberval.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0185.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000186', 'ATO Nº047_2023 - Título benemérito LOIOLA', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº047_2023 - Título benemérito LOIOLA', '/uploads/legislacao/acervo-0186.pdf'), 256), '/uploads/legislacao/acervo-0186.pdf', 'ATO Nº047_2023 - Título benemérito LOIOLA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0186.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000187', 'ATO Nº047_2024 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2024_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº047_2024 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2024_2025', '/uploads/legislacao/acervo-0187.pdf'), 256), '/uploads/legislacao/acervo-0187.pdf', 'ATO Nº047_2024 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2024_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0187.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000188', 'ATO Nº047_2025 - Mogi  Mirim nomeia delegado Perfeita União', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº047_2025 - Mogi  Mirim nomeia delegado Perfeita União', '/uploads/legislacao/acervo-0188.pdf'), 256), '/uploads/legislacao/acervo-0188.pdf', 'ATO Nº047_2025 - Mogi  Mirim nomeia delegado Perfeita União.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0188.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000189', 'ATO Nº048_2022 - Nomeia delegado_Henrique Vilelal', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº048_2022 - Nomeia delegado_Henrique Vilelal', '/uploads/legislacao/acervo-0189.pdf'), 256), '/uploads/legislacao/acervo-0189.pdf', 'ATO Nº048_2022 - Nomeia delegado_Henrique Vilelal.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0189.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000190', 'ATO Nº048_2023 - Compra_troca de Rituais', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº048_2023 - Compra_troca de Rituais', '/uploads/legislacao/acervo-0190.pdf'), 256), '/uploads/legislacao/acervo-0190.pdf', 'ATO Nº048_2023 - Compra_troca de Rituais.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0190.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000191', 'ATO Nº048_2025 - Nomeia delegado Adnilson Arruda Cuiabá_MT', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº048_2025 - Nomeia delegado Adnilson Arruda Cuiabá_MT', '/uploads/legislacao/acervo-0191.pdf'), 256), '/uploads/legislacao/acervo-0191.pdf', 'ATO Nº048_2025 - Nomeia delegado Adnilson Arruda Cuiabá_MT.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0191.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000192', 'ATO Nº049_2022 - Maçom Benemérito Ortiga', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº049_2022 - Maçom Benemérito Ortiga', '/uploads/legislacao/acervo-0192.pdf'), 256), '/uploads/legislacao/acervo-0192.pdf', 'ATO Nº049_2022 - Maçom Benemérito Ortiga.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0192.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000193', 'ATO Nº049_2023 - Normativa de ingresso nos Graus Filosóficos Adonhiramitas', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº049_2023 - Normativa de ingresso nos Graus Filosóficos Adonhiramitas', '/uploads/legislacao/acervo-0193.pdf'), 256), '/uploads/legislacao/acervo-0193.pdf', 'ATO Nº049_2023 - Normativa de ingresso nos Graus Filosóficos Adonhiramitas.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0193.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000194', 'ATO Nº049_2024 - medalha do mérito a dedicação_Marcondes', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº049_2024 - medalha do mérito a dedicação_Marcondes', '/uploads/legislacao/acervo-0194.pdf'), 256), '/uploads/legislacao/acervo-0194.pdf', 'ATO Nº049_2024 - medalha do mérito a dedicação_Marcondes.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0194.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000195', 'ATO Nº049_2025 - Nomeia delegado Hiram de Melo_campina Grande_PB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº049_2025 - Nomeia delegado Hiram de Melo_campina Grande_PB', '/uploads/legislacao/acervo-0195.pdf'), 256), '/uploads/legislacao/acervo-0195.pdf', 'ATO Nº049_2025 - Nomeia delegado Hiram de Melo_campina Grande_PB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0195.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000196', 'ATO Nº050_2022 - Maçom benemérito Audi', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº050_2022 - Maçom benemérito Audi', '/uploads/legislacao/acervo-0196.pdf'), 256), '/uploads/legislacao/acervo-0196.pdf', 'ATO Nº050_2022 - Maçom benemérito Audi.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0196.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000197', 'ATO Nº050_2023 - Nomeia comissão Sublime Capítulo Adonhiramita Cavaleiros da Morada do Sol', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº050_2023 - Nomeia comissão Sublime Capítulo Adonhiramita Cavaleiros da Morada do Sol', '/uploads/legislacao/acervo-0197.pdf'), 256), '/uploads/legislacao/acervo-0197.pdf', 'ATO Nº050_2023 - Nomeia comissão Sublime Capítulo Adonhiramita Cavaleiros da Morada do Sol.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0197.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000198', 'ATO Nº050_2024 - medalha do mérito a dedicação_Melchiors', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº050_2024 - medalha do mérito a dedicação_Melchiors', '/uploads/legislacao/acervo-0198.pdf'), 256), '/uploads/legislacao/acervo-0198.pdf', 'ATO Nº050_2024 - medalha do mérito a dedicação_Melchiors.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0198.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000199', 'ATO Nº050_2025 - Nomeia delegado João Rode_Balneário Camboriú_SC', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº050_2025 - Nomeia delegado João Rode_Balneário Camboriú_SC', '/uploads/legislacao/acervo-0199.pdf'), 256), '/uploads/legislacao/acervo-0199.pdf', 'ATO Nº050_2025 - Nomeia delegado João Rode_Balneário Camboriú_SC.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0199.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000200', 'ATO Nº051_2022 - nomeação de membro efetivo Vidal', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº051_2022 - nomeação de membro efetivo Vidal', '/uploads/legislacao/acervo-0200.pdf'), 256), '/uploads/legislacao/acervo-0200.pdf', 'ATO Nº051_2022 - nomeação de membro efetivo Vidal.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0200.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000201', 'ATO Nº051_2023 -carta constitutiva Capitulo Cavaleiros da Morada do Sol', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº051_2023 -carta constitutiva Capitulo Cavaleiros da Morada do Sol', '/uploads/legislacao/acervo-0201.pdf'), 256), '/uploads/legislacao/acervo-0201.pdf', 'ATO Nº051_2023 -carta constitutiva Capitulo Cavaleiros da Morada do Sol.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0201.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000202', 'ATO Nº051_2024 - medalha do mérito a dedicação_valtenir', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº051_2024 - medalha do mérito a dedicação_valtenir', '/uploads/legislacao/acervo-0202.pdf'), 256), '/uploads/legislacao/acervo-0202.pdf', 'ATO Nº051_2024 - medalha do mérito a dedicação_valtenir.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0202.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000203', 'ATO Nº051_2025 - Nomeia Sapientíssimo_Rafael Bassani_Perfeita União_Mogi Mirim_SP', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº051_2025 - Nomeia Sapientíssimo_Rafael Bassani_Perfeita União_Mogi Mirim_SP', '/uploads/legislacao/acervo-0203.pdf'), 256), '/uploads/legislacao/acervo-0203.pdf', 'ATO Nº051_2025 - Nomeia Sapientíssimo_Rafael Bassani_Perfeita União_Mogi Mirim_SP.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0203.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000204', 'ATO Nº052_2022 - Nomeia delegado_Marco Melchiors', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº052_2022 - Nomeia delegado_Marco Melchiors', '/uploads/legislacao/acervo-0204.pdf'), 256), '/uploads/legislacao/acervo-0204.pdf', 'ATO Nº052_2022 - Nomeia delegado_Marco Melchiors.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0204.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000205', 'ATO Nº052_2023 - Homologa e reconhece administracão do Capítulo Cavaleiros da Morada do Sol', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº052_2023 - Homologa e reconhece administracão do Capítulo Cavaleiros da Morada do Sol', '/uploads/legislacao/acervo-0205.pdf'), 256), '/uploads/legislacao/acervo-0205.pdf', 'ATO Nº052_2023 - Homologa e reconhece administracão do Capítulo Cavaleiros da Morada do Sol.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0205.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000206', 'ATO Nº052_2024 - medalha do mérito a dedicação_willian', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº052_2024 - medalha do mérito a dedicação_willian', '/uploads/legislacao/acervo-0206.pdf'), 256), '/uploads/legislacao/acervo-0206.pdf', 'ATO Nº052_2024 - medalha do mérito a dedicação_willian.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0206.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000207', 'ATO Nº052_2025 - exonera delegado do patriarca_Miguel Omizollo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº052_2025 - exonera delegado do patriarca_Miguel Omizollo', '/uploads/legislacao/acervo-0207.pdf'), 256), '/uploads/legislacao/acervo-0207.pdf', 'ATO Nº052_2025 - exonera delegado do patriarca_Miguel Omizollo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0207.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000208', 'ATO Nº053_2022 - nomeação de membro efetivo Homen', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº053_2022 - nomeação de membro efetivo Homen', '/uploads/legislacao/acervo-0208.pdf'), 256), '/uploads/legislacao/acervo-0208.pdf', 'ATO Nº053_2022 - nomeação de membro efetivo Homen.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0208.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000209', 'ATO Nº053_2023 -nomeia delegado loiola', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº053_2023 -nomeia delegado loiola', '/uploads/legislacao/acervo-0209.pdf'), 256), '/uploads/legislacao/acervo-0209.pdf', 'ATO Nº053_2023 -nomeia delegado loiola.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0209.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000210', 'ATO Nº053_2025 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2025_2026', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº053_2025 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2025_2026', '/uploads/legislacao/acervo-0210.pdf'), 256), '/uploads/legislacao/acervo-0210.pdf', 'ATO Nº053_2025 - DISCIPLINA O RECESSO DO SGCAB MAÇÔNICO 2025_2026.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0210.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000211', 'ATO Nº054_2022 -  delegação de poderes_Melchiros', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº054_2022 -  delegação de poderes_Melchiros', '/uploads/legislacao/acervo-0211.pdf'), 256), '/uploads/legislacao/acervo-0211.pdf', 'ATO Nº054_2022 -  delegação de poderes_Melchiros.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0211.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000212', 'ATO Nº054_2023 -Encaminhamento ao REAA de Henquique Costa Filho', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº054_2023 -Encaminhamento ao REAA de Henquique Costa Filho', '/uploads/legislacao/acervo-0212.pdf'), 256), '/uploads/legislacao/acervo-0212.pdf', 'ATO Nº054_2023 -Encaminhamento ao REAA de Henquique Costa Filho.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0212.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000213', 'ATO Nº054_2024 - medalha lucio nelson martins_Fulco', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº054_2024 - medalha lucio nelson martins_Fulco', '/uploads/legislacao/acervo-0213.pdf'), 256), '/uploads/legislacao/acervo-0213.pdf', 'ATO Nº054_2024 - medalha lucio nelson martins_Fulco.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0213.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000214', 'ATO Nº054_2025 - Homologa Ritual de Posse de Sapientissimo e Administração para Lojas de Perfeição e SCA', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº054_2025 - Homologa Ritual de Posse de Sapientissimo e Administração para Lojas de Perfeição e SCA', '/uploads/legislacao/acervo-0214.pdf'), 256), '/uploads/legislacao/acervo-0214.pdf', 'ATO Nº054_2025 - Homologa Ritual de Posse de Sapientissimo e Administração para Lojas de Perfeição e SCA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0214.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000215', 'ATO Nº055_2024 - medalha lucio nelson martins_João Paulo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº055_2024 - medalha lucio nelson martins_João Paulo', '/uploads/legislacao/acervo-0215.pdf'), 256), '/uploads/legislacao/acervo-0215.pdf', 'ATO Nº055_2024 - medalha lucio nelson martins_João Paulo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0215.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000216', 'ATO Nº055_2025 - nomeia membro efetivo_Luiz Marcondes', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº055_2025 - nomeia membro efetivo_Luiz Marcondes', '/uploads/legislacao/acervo-0216.pdf'), 256), '/uploads/legislacao/acervo-0216.pdf', 'ATO Nº055_2025 - nomeia membro efetivo_Luiz Marcondes.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0216.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000217', 'ATO Nº056_2024 - medalha lucio nelson martins_Lucio_Dupuy', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº056_2024 - medalha lucio nelson martins_Lucio_Dupuy', '/uploads/legislacao/acervo-0217.pdf'), 256), '/uploads/legislacao/acervo-0217.pdf', 'ATO Nº056_2024 - medalha lucio nelson martins_Lucio_Dupuy.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0217.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000218', 'ATO Nº056_2025 - nomeia membro efetivo_Inácio Loiola', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº056_2025 - nomeia membro efetivo_Inácio Loiola', '/uploads/legislacao/acervo-0218.pdf'), 256), '/uploads/legislacao/acervo-0218.pdf', 'ATO Nº056_2025 - nomeia membro efetivo_Inácio Loiola.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0218.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000219', 'ATO Nº057_2024 - medalha lucio nelson martins_Ortiga', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº057_2024 - medalha lucio nelson martins_Ortiga', '/uploads/legislacao/acervo-0219.pdf'), 256), '/uploads/legislacao/acervo-0219.pdf', 'ATO Nº057_2024 - medalha lucio nelson martins_Ortiga.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0219.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000220', 'ATO Nº057_2025 - autoriza o retorno das atividades Loja Perfeição Joaçaba_SC', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº057_2025 - autoriza o retorno das atividades Loja Perfeição Joaçaba_SC', '/uploads/legislacao/acervo-0220.pdf'), 256), '/uploads/legislacao/acervo-0220.pdf', 'ATO Nº057_2025 - autoriza o retorno das atividades Loja Perfeição Joaçaba_SC.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0220.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000221', 'ATO Nº058_2024 - nomeia delegado Florianópolis_ José Valério', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº058_2024 - nomeia delegado Florianópolis_ José Valério', '/uploads/legislacao/acervo-0221.pdf'), 256), '/uploads/legislacao/acervo-0221.pdf', 'ATO Nº058_2024 - nomeia delegado Florianópolis_ José Valério.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0221.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000222', 'ATO Nº058_2025 - Nomeia Sapientíssimo_Sandro Roters_Cruzeiro do Vale_Joaçaba_SC', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº058_2025 - Nomeia Sapientíssimo_Sandro Roters_Cruzeiro do Vale_Joaçaba_SC', '/uploads/legislacao/acervo-0222.pdf'), 256), '/uploads/legislacao/acervo-0222.pdf', 'ATO Nº058_2025 - Nomeia Sapientíssimo_Sandro Roters_Cruzeiro do Vale_Joaçaba_SC.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0222.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000223', 'ATO Nº059_2024 - medalha do mérito a dedicação_FRederico', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº059_2024 - medalha do mérito a dedicação_FRederico', '/uploads/legislacao/acervo-0223.pdf'), 256), '/uploads/legislacao/acervo-0223.pdf', 'ATO Nº059_2024 - medalha do mérito a dedicação_FRederico.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0223.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000224', 'ATO Nº059_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Cruzeiro do Vale_Joaçaba', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº059_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Cruzeiro do Vale_Joaçaba', '/uploads/legislacao/acervo-0224.pdf'), 256), '/uploads/legislacao/acervo-0224.pdf', 'ATO Nº059_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Cruzeiro do Vale_Joaçaba.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0224.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000225', 'ATO Nº060_2024 - medalha do mérito a dedicação_João Paulo', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº060_2024 - medalha do mérito a dedicação_João Paulo', '/uploads/legislacao/acervo-0225.pdf'), 256), '/uploads/legislacao/acervo-0225.pdf', 'ATO Nº060_2024 - medalha do mérito a dedicação_João Paulo.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0225.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000226', 'ATO Nº060_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO do SCA São Francisco de Assis_ao_Vale_Assis_SP', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº060_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO do SCA São Francisco de Assis_ao_Vale_Assis_SP', '/uploads/legislacao/acervo-0226.pdf'), 256), '/uploads/legislacao/acervo-0226.pdf', 'ATO Nº060_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO do SCA São Francisco de Assis_ao_Vale_Assis_SP.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0226.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000227', 'ATO Nº061_2024 - nomeia membro efetivo_José Valério', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº061_2024 - nomeia membro efetivo_José Valério', '/uploads/legislacao/acervo-0227.pdf'), 256), '/uploads/legislacao/acervo-0227.pdf', 'ATO Nº061_2024 - nomeia membro efetivo_José Valério.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0227.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000228', 'ATO Nº061_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Arca da Sabedoria_Vale_Assis_SP', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº061_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Arca da Sabedoria_Vale_Assis_SP', '/uploads/legislacao/acervo-0228.pdf'), 256), '/uploads/legislacao/acervo-0228.pdf', 'ATO Nº061_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO Da LP Arca da Sabedoria_Vale_Assis_SP.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0228.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000229', 'ATO Nº062_2024 - nomeia membro efetivo_Edson Lopes', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº062_2024 - nomeia membro efetivo_Edson Lopes', '/uploads/legislacao/acervo-0229.pdf'), 256), '/uploads/legislacao/acervo-0229.pdf', 'ATO Nº062_2024 - nomeia membro efetivo_Edson Lopes.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0229.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000230', 'ATO Nº062_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO do SCA Arquitetos da Paz ao valre de Alta Floresta-MS', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº062_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO do SCA Arquitetos da Paz ao valre de Alta Floresta-MS', '/uploads/legislacao/acervo-0230.pdf'), 256), '/uploads/legislacao/acervo-0230.pdf', 'ATO Nº062_2025 - HOMOLOGA E RECONHECE A ADMINISTRAÇÃO do SCA Arquitetos da Paz ao valre de Alta Floresta-MS.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0230.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000231', 'ATO Nº063_2024 - Extingue comissões_SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº063_2024 - Extingue comissões_SGCAB', '/uploads/legislacao/acervo-0231.pdf'), 256), '/uploads/legislacao/acervo-0231.pdf', 'ATO Nº063_2024 - Extingue comissões_SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0231.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000232', 'ATO Nº063_2025 - Nomeia delegado Euclydes Canhette Junior_Alta Floresta_MS', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº063_2025 - Nomeia delegado Euclydes Canhette Junior_Alta Floresta_MS', '/uploads/legislacao/acervo-0232.pdf'), 256), '/uploads/legislacao/acervo-0232.pdf', 'ATO Nº063_2025 - Nomeia delegado Euclydes Canhette Junior_Alta Floresta_MS.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0232.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000233', 'ATO Nº064_2024 - Nomeia comissão de Constituição e Justiça_do_SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº064_2024 - Nomeia comissão de Constituição e Justiça_do_SGCAB', '/uploads/legislacao/acervo-0233.pdf'), 256), '/uploads/legislacao/acervo-0233.pdf', 'ATO Nº064_2024 - Nomeia comissão de Constituição e Justiça_do_SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0233.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000234', 'ATO Nº064_2025 - Disciplina requisitos para encaminhamento a Corporações Filosóficas de outros Ritos', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº064_2025 - Disciplina requisitos para encaminhamento a Corporações Filosóficas de outros Ritos', '/uploads/legislacao/acervo-0234.pdf'), 256), '/uploads/legislacao/acervo-0234.pdf', 'ATO Nº064_2025 - Disciplina requisitos para encaminhamento a Corporações Filosóficas de outros Ritos.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0234.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000235', 'ATO Nº065_2024 - Nomeação de Comissão finanças_do_SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº065_2024 - Nomeação de Comissão finanças_do_SGCAB', '/uploads/legislacao/acervo-0235.pdf'), 256), '/uploads/legislacao/acervo-0235.pdf', 'ATO Nº065_2024 - Nomeação de Comissão finanças_do_SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0235.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000236', 'ATO Nº065_2025 - EquivaLencia Graus SGCAB_SUPRAB_Moderno_Brasileiro_REAA', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº065_2025 - EquivaLencia Graus SGCAB_SUPRAB_Moderno_Brasileiro_REAA', '/uploads/legislacao/acervo-0236.pdf'), 256), '/uploads/legislacao/acervo-0236.pdf', 'ATO Nº065_2025 - EquivaLencia Graus SGCAB_SUPRAB_Moderno_Brasileiro_REAA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0236.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000237', 'ATO Nº066_2024 - Nomeação de Comissão Chancelaria_do_SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº066_2024 - Nomeação de Comissão Chancelaria_do_SGCAB', '/uploads/legislacao/acervo-0237.pdf'), 256), '/uploads/legislacao/acervo-0237.pdf', 'ATO Nº066_2024 - Nomeação de Comissão Chancelaria_do_SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0237.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000238', 'ATO Nº066_2025 - nomeia sapientíssimo Augusto Casér_Julio Pereira', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº066_2025 - nomeia sapientíssimo Augusto Casér_Julio Pereira', '/uploads/legislacao/acervo-0238.pdf'), 256), '/uploads/legislacao/acervo-0238.pdf', 'ATO Nº066_2025 - nomeia sapientíssimo Augusto Casér_Julio Pereira.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0238.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000239', 'ATO Nº067_2024 - Nomeação da Comissão de Ritualística e liturgia', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº067_2024 - Nomeação da Comissão de Ritualística e liturgia', '/uploads/legislacao/acervo-0239.pdf'), 256), '/uploads/legislacao/acervo-0239.pdf', 'ATO Nº067_2024 - Nomeação da Comissão de Ritualística e liturgia.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0239.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000240', 'ATO Nº067_2025 - nomeia sapientíssimo Mário da SIlva_José Martins', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº067_2025 - nomeia sapientíssimo Mário da SIlva_José Martins', '/uploads/legislacao/acervo-0240.pdf'), 256), '/uploads/legislacao/acervo-0240.pdf', 'ATO Nº067_2025 - nomeia sapientíssimo Mário da SIlva_José Martins.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0240.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000241', 'ATO Nº068_2024 - Diretor do SOGEF do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº068_2024 - Diretor do SOGEF do SGCAB', '/uploads/legislacao/acervo-0241.pdf'), 256), '/uploads/legislacao/acervo-0241.pdf', 'ATO Nº068_2024 - Diretor do SOGEF do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0241.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000242', 'ATO Nº068_2025 - HOMOLOGA E RECONHCE A ADMINISTRAÇÃO do SCA Augusto Casr ao vale de florianópolis_SC', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº068_2025 - HOMOLOGA E RECONHCE A ADMINISTRAÇÃO do SCA Augusto Casr ao vale de florianópolis_SC', '/uploads/legislacao/acervo-0242.pdf'), 256), '/uploads/legislacao/acervo-0242.pdf', 'ATO Nº068_2025 - HOMOLOGA E RECONHCE A ADMINISTRAÇÃO do SCA Augusto Casr ao vale de florianópolis_SC.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0242.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000243', 'ATO Nº069_2024 - Diretor do JORNAL ADONHIRAMITA do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº069_2024 - Diretor do JORNAL ADONHIRAMITA do SGCAB', '/uploads/legislacao/acervo-0243.pdf'), 256), '/uploads/legislacao/acervo-0243.pdf', 'ATO Nº069_2024 - Diretor do JORNAL ADONHIRAMITA do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0243.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000244', 'ATO Nº069_2025 - HOMOLOGA E RECONHCE A ADMINISTRAÇÃO da Loja de Perfeição Mário da Silva ao valde de São José_SC', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº069_2025 - HOMOLOGA E RECONHCE A ADMINISTRAÇÃO da Loja de Perfeição Mário da Silva ao valde de São José_SC', '/uploads/legislacao/acervo-0244.pdf'), 256), '/uploads/legislacao/acervo-0244.pdf', 'ATO Nº069_2025 - HOMOLOGA E RECONHCE A ADMINISTRAÇÃO da Loja de Perfeição Mário da Silva ao valde de São José_SC.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0244.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000245', 'ATO Nº070_2024 - Diretor de Comunicações do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº070_2024 - Diretor de Comunicações do SGCAB', '/uploads/legislacao/acervo-0245.pdf'), 256), '/uploads/legislacao/acervo-0245.pdf', 'ATO Nº070_2024 - Diretor de Comunicações do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0245.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000246', 'ATO Nº070_2025 - Homologa ritual do grau 10_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº070_2025 - Homologa ritual do grau 10_2025', '/uploads/legislacao/acervo-0246.pdf'), 256), '/uploads/legislacao/acervo-0246.pdf', 'ATO Nº070_2025 - Homologa ritual do grau 10_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0246.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000247', 'ATO Nº071_2024 - Diretor Administrativo do SGCAB', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº071_2024 - Diretor Administrativo do SGCAB', '/uploads/legislacao/acervo-0247.pdf'), 256), '/uploads/legislacao/acervo-0247.pdf', 'ATO Nº071_2024 - Diretor Administrativo do SGCAB.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0247.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000248', 'ATO Nº071_2025 - Homologa ritual do grau 12_2025', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('ATO Nº071_2025 - Homologa ritual do grau 12_2025', '/uploads/legislacao/acervo-0248.pdf'), 256), '/uploads/legislacao/acervo-0248.pdf', 'ATO Nº071_2025 - Homologa ritual do grau 12_2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0248.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000249', 'download', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('download', '/uploads/legislacao/acervo-0249.pdf'), 256), '/uploads/legislacao/acervo-0249.pdf', 'download.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0249.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000250', 'PRANCHA Nº001_2023 - SESSÃO DE MEMBROS EFETIVOS 2023 - INICIAÇÃO AO GRAU 13', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('PRANCHA Nº001_2023 - SESSÃO DE MEMBROS EFETIVOS 2023 - INICIAÇÃO AO GRAU 13', '/uploads/legislacao/acervo-0250.pdf'), 256), '/uploads/legislacao/acervo-0250.pdf', 'PRANCHA Nº001_2023 - SESSÃO DE MEMBROS EFETIVOS 2023 - INICIAÇÃO AO GRAU 13.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0250.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000251', 'Prancha Nº001_2024 - Sessão de Investidura Grau 13', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Prancha Nº001_2024 - Sessão de Investidura Grau 13', '/uploads/legislacao/acervo-0251.pdf'), 256), '/uploads/legislacao/acervo-0251.pdf', 'Prancha Nº001_2024 - Sessão de Investidura Grau 13.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0251.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000252', 'Prancha Nº002_2024 - tratados com corporações expúrias', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Prancha Nº002_2024 - tratados com corporações expúrias', '/uploads/legislacao/acervo-0252.pdf'), 256), '/uploads/legislacao/acervo-0252.pdf', 'Prancha Nº002_2024 - tratados com corporações expúrias.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0252.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000253', 'Regulamento Geral SGCAB 2024', 'legislacao', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Regulamento Geral SGCAB 2024', '/uploads/legislacao/acervo-0253.pdf'), 256), '/uploads/legislacao/acervo-0253.pdf', 'Regulamento Geral SGCAB 2024.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0253.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000254', 'O Rito Adonhiramita - Historia - COM INDICE', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('O Rito Adonhiramita - Historia - COM INDICE', '/uploads/legislacao/acervo-0254.pdf'), 256), '/uploads/legislacao/acervo-0254.pdf', 'O Rito Adonhiramita - Historia - COM INDICE.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0254.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000255', 'PROGRAMAÇÃO LP E CAP - ATUALIZADOS', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('PROGRAMAÇÃO LP E CAP - ATUALIZADOS', '/uploads/legislacao/acervo-0255.pdf'), 256), '/uploads/legislacao/acervo-0255.pdf', 'PROGRAMAÇÃO LP E CAP - ATUALIZADOS.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0255.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000256', 'programação LP E CAPITULO 2025', 'documentos_loja', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('programação LP E CAPITULO 2025', '/uploads/legislacao/acervo-0256.pdf'), 256), '/uploads/legislacao/acervo-0256.pdf', 'programação LP E CAPITULO 2025.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0256.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000257', 'scan', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('scan', '/uploads/legislacao/acervo-0257.pdf'), 256), '/uploads/legislacao/acervo-0257.pdf', 'scan.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0257.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000258', 'scanner', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('scanner', '/uploads/legislacao/acervo-0258.pdf'), 256), '/uploads/legislacao/acervo-0258.pdf', 'scanner.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0258.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000259', 'Sublime Grande Capítulo do Rio Grande o Sul', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Sublime Grande Capítulo do Rio Grande o Sul', '/uploads/legislacao/acervo-0259.pdf'), 256), '/uploads/legislacao/acervo-0259.pdf', 'Sublime Grande Capítulo do Rio Grande o Sul.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0259.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000260', 'Supremo Conclave Autônomo para o Rito Brasileiro', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conclave Autônomo para o Rito Brasileiro', '/uploads/legislacao/acervo-0260.pdf'), 256), '/uploads/legislacao/acervo-0260.pdf', 'Supremo Conclave Autônomo para o Rito Brasileiro.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0260.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000261', 'Supremo Conselho de Santa Catarina para o REAA', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho de Santa Catarina para o REAA', '/uploads/legislacao/acervo-0261.pdf'), 256), '/uploads/legislacao/acervo-0261.pdf', 'Supremo Conselho de Santa Catarina para o REAA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0261.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000262', 'Supremo Conselho do Estado do Rio Grande do Norte do Grau 33 do REAA', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho do Estado do Rio Grande do Norte do Grau 33 do REAA', '/uploads/legislacao/acervo-0262.pdf'), 256), '/uploads/legislacao/acervo-0262.pdf', 'Supremo Conselho do Estado do Rio Grande do Norte do Grau 33 do REAA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0262.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000263', 'Supremo Conselho do Grau 33 do Paraná', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho do Grau 33 do Paraná', '/uploads/legislacao/acervo-0263.pdf'), 256), '/uploads/legislacao/acervo-0263.pdf', 'Supremo Conselho do Grau 33 do Paraná.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0263.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000264', 'Supremo Conselho do Grau 33 para a República Federativa do Brasil_MG', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho do Grau 33 para a República Federativa do Brasil_MG', '/uploads/legislacao/acervo-0264.pdf'), 256), '/uploads/legislacao/acervo-0264.pdf', 'Supremo Conselho do Grau 33 para a República Federativa do Brasil_MG.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0264.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000265', 'Supremo Conselho do REAA para o Estado de Mato Grosso', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho do REAA para o Estado de Mato Grosso', '/uploads/legislacao/acervo-0265.pdf'), 256), '/uploads/legislacao/acervo-0265.pdf', 'Supremo Conselho do REAA para o Estado de Mato Grosso.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0265.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000266', 'Supremo Conselho do Rio Grande do Sul do 33 e último grau do REAA', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho do Rio Grande do Sul do 33 e último grau do REAA', '/uploads/legislacao/acervo-0266.pdf'), 256), '/uploads/legislacao/acervo-0266.pdf', 'Supremo Conselho do Rio Grande do Sul do 33 e último grau do REAA.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0266.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000267', 'Supremo Conselho dos Graus 4 ao 33 de Pernambuco', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho dos Graus 4 ao 33 de Pernambuco', '/uploads/legislacao/acervo-0267.pdf'), 256), '/uploads/legislacao/acervo-0267.pdf', 'Supremo Conselho dos Graus 4 ao 33 de Pernambuco.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0267.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000268', 'Supremo Conselho dos GRaus Escoceses 4 ao 33 para o Brasil_SP', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho dos GRaus Escoceses 4 ao 33 para o Brasil_SP', '/uploads/legislacao/acervo-0268.pdf'), 256), '/uploads/legislacao/acervo-0268.pdf', 'Supremo Conselho dos GRaus Escoceses 4 ao 33 para o Brasil_SP.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0268.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000269', 'Supremo Conselho Paranaense do Rito Moderno ou Francês', 'tratados_corporacoes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Supremo Conselho Paranaense do Rito Moderno ou Francês', '/uploads/legislacao/acervo-0269.pdf'), 256), '/uploads/legislacao/acervo-0269.pdf', 'Supremo Conselho Paranaense do Rito Moderno ou Francês.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0269.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000270', '20251209145751', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('20251209145751', '/uploads/legislacao/acervo-0270.pdf'), 256), '/uploads/legislacao/acervo-0270.pdf', '20251209145751.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0270.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000271', 'Grande Oriente Autônomo do Maranhão', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente Autônomo do Maranhão', '/uploads/legislacao/acervo-0271.pdf'), 256), '/uploads/legislacao/acervo-0271.pdf', 'Grande Oriente Autônomo do Maranhão.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0271.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000272', 'Grande Oriente da Bahia', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente da Bahia', '/uploads/legislacao/acervo-0272.pdf'), 256), '/uploads/legislacao/acervo-0272.pdf', 'Grande Oriente da Bahia.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0272.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000273', 'Grande Oriente da Paraíba', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente da Paraíba', '/uploads/legislacao/acervo-0273.pdf'), 256), '/uploads/legislacao/acervo-0273.pdf', 'Grande Oriente da Paraíba.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0273.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000274', 'Grande Oriente de Minas Gerais', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente de Minas Gerais', '/uploads/legislacao/acervo-0274.pdf'), 256), '/uploads/legislacao/acervo-0274.pdf', 'Grande Oriente de Minas Gerais.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0274.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000275', 'Grande Oriente de Santa Catarina', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente de Santa Catarina', '/uploads/legislacao/acervo-0275.pdf'), 256), '/uploads/legislacao/acervo-0275.pdf', 'Grande Oriente de Santa Catarina.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0275.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000276', 'Grande Oriente do Distrito Federal', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente do Distrito Federal', '/uploads/legislacao/acervo-0276.pdf'), 256), '/uploads/legislacao/acervo-0276.pdf', 'Grande Oriente do Distrito Federal.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0276.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000277', 'Grande Oriente do Mato Grosso do Sul', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente do Mato Grosso do Sul', '/uploads/legislacao/acervo-0277.pdf'), 256), '/uploads/legislacao/acervo-0277.pdf', 'Grande Oriente do Mato Grosso do Sul.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0277.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000278', 'Grande Oriente do Paraná', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente do Paraná', '/uploads/legislacao/acervo-0278.pdf'), 256), '/uploads/legislacao/acervo-0278.pdf', 'Grande Oriente do Paraná.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0278.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000279', 'Grande Oriente Independente do Piauí', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente Independente do Piauí', '/uploads/legislacao/acervo-0279.pdf'), 256), '/uploads/legislacao/acervo-0279.pdf', 'Grande Oriente Independente do Piauí.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0279.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000280', 'Grande Oriente Independente do Rio de Janeiro', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente Independente do Rio de Janeiro', '/uploads/legislacao/acervo-0280.pdf'), 256), '/uploads/legislacao/acervo-0280.pdf', 'Grande Oriente Independente do Rio de Janeiro.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0280.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000281', 'Grande Oriente Independente do Rio Grande do Norte', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente Independente do Rio Grande do Norte', '/uploads/legislacao/acervo-0281.pdf'), 256), '/uploads/legislacao/acervo-0281.pdf', 'Grande Oriente Independente do Rio Grande do Norte.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0281.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000282', 'Grande Oriente Lusitano', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente Lusitano', '/uploads/legislacao/acervo-0282.pdf'), 256), '/uploads/legislacao/acervo-0282.pdf', 'Grande Oriente Lusitano.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0282.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000283', 'Grande Oriente Paulista', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('Grande Oriente Paulista', '/uploads/legislacao/acervo-0283.pdf'), 256), '/uploads/legislacao/acervo-0283.pdf', 'Grande Oriente Paulista.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0283.pdf');

INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '00000000-0000-4000-8000-000000000284', 'scan 2', 'tratados_orientes', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('scan 2', '/uploads/legislacao/acervo-0284.pdf'), 256), '/uploads/legislacao/acervo-0284.pdf', 'scan 2.pdf', 'application/pdf', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '/uploads/legislacao/acervo-0284.pdf');

