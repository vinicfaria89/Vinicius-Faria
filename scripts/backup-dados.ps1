# Backup diario da pasta data/ (catalogo, historico, clientes, modelos) em zip, fora do OneDrive.
# Mantem os ultimos $Manter backups. Os zips contem dados pessoais de clientes: nao enviar para a internet.
param(
  [string]$Destino = (Join-Path $env:USERPROFILE 'Documents\GCB-Backups'),
  [int]$Manter = 14
)
$ErrorActionPreference = 'Stop'
$data = Join-Path (Split-Path $PSScriptRoot -Parent) 'data'
if (-not (Test-Path $data)) { throw "Pasta data nao encontrada: $data" }
New-Item -ItemType Directory -Force $Destino | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$tmp = Join-Path $env:TEMP "gcb-bkp-$stamp"
Copy-Item $data $tmp -Recurse            # copia primeiro: evita ler arquivo no meio de uma gravacao
$zip = Join-Path $Destino "gcb-data-$stamp.zip"
Compress-Archive -Path "$tmp\*" -DestinationPath $zip
Remove-Item $tmp -Recurse -Force

Get-ChildItem $Destino -Filter 'gcb-data-*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Manter | Remove-Item -Force
Write-Output "Backup criado: $zip ($([math]::Round((Get-Item $zip).Length/1KB)) KB)"
