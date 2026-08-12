param(
  [Parameter(Mandatory = $true)]
  [string]$Origem
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $repo "public\uploads\legislacao"
$migration = Join-Path $repo "mysql\migrations\0072_repositorio_legislacao.sql"

if (-not (Test-Path -LiteralPath $Origem -PathType Container)) {
  throw "Pasta de origem nao encontrada: $Origem"
}

New-Item -ItemType Directory -Force -Path $destino | Out-Null

$cabecalho = @"
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

"@
Set-Content -LiteralPath $migration -Value $cabecalho -Encoding utf8

$arquivos = Get-ChildItem -LiteralPath $Origem -Recurse -File | Sort-Object FullName
$indice = 0
foreach ($arquivo in $arquivos) {
  $indice++
  $relativo = $arquivo.FullName.Substring($Origem.Length).TrimStart('\')
  $diretorio = Split-Path -Parent $relativo
  $categoria = switch -Wildcard ($diretorio) {
    "Legisla*" { "legislacao"; break }
    "Tratados do SGC\Corpora*" { "tratados_corporacoes"; break }
    "Tratados do SGC\Grandes Orientes*" { "tratados_orientes"; break }
    default { "documentos_loja" }
  }

  $extensao = $arquivo.Extension.ToLowerInvariant()
  $nomeDestino = "acervo-{0:D4}{1}" -f $indice, $extensao
  Copy-Item -LiteralPath $arquivo.FullName -Destination (Join-Path $destino $nomeDestino) -Force

  $titulo = [System.IO.Path]::GetFileNameWithoutExtension($arquivo.Name).Replace("'", "''")
  $nomeOriginal = $arquivo.Name.Replace("'", "''")
  $mime = switch ($extensao) {
    ".pdf" { "application/pdf" }
    ".docx" { "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
    ".doc" { "application/msword" }
    ".odt" { "application/vnd.oasis.opendocument.text" }
    ".png" { "image/png" }
    default { "application/octet-stream" }
  }
  $url = "/uploads/legislacao/$nomeDestino"
  $idBase = "00000000-0000-4000-8000-{0:D12}" -f $indice
  $sql = @"
INSERT INTO documentos
  (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
SELECT '$idBase', '$titulo', '$categoria', 'Documento integrante do repositorio de legislacao.',
       SHA2(CONCAT('$titulo', '$url'), 256), '$url', '$nomeOriginal', '$mime', @importador_id
WHERE @importador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos WHERE arquivo_url = '$url');

"@
  Add-Content -LiteralPath $migration -Value $sql -Encoding utf8
}

Write-Host "Importacao preparada: $($arquivos.Count) arquivos."
