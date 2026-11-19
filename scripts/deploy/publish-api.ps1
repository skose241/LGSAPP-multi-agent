[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$OutputDir,
    [string]$Runtime = 'linux-x64'
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-Command 'dotnet' '.NET SDK kurun (global.json surumu).'

if (-not $OutputDir) { $OutputDir = Join-Path $root 'artifacts' }
$publishDir = Join-Path $OutputDir 'api'
$zipPath = Join-Path $OutputDir 'api.zip'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
if (Test-Path -LiteralPath $publishDir) { Remove-Item -LiteralPath $publishDir -Recurse -Force }

Write-Step "API yayinlaniyor ($Runtime, framework-dependent)"
$project = Join-Path $root 'backend/src/LGSApp.Api/LGSApp.Api.csproj'
Invoke-Native -File 'dotnet' -Arguments @(
    'publish', $project,
    '-c', 'Release', '-r', $Runtime, '--self-contained', 'false',
    '-p:OpenApiGenerateDocumentsOnBuild=false',
    '-o', $publishDir)

Write-Step 'Gelistirme ayar dosyasi denetimi'
$leftover = Get-ChildItem -LiteralPath $publishDir -Filter 'appsettings.*.json' |
    Where-Object { $_.Name -ne 'appsettings.json' }
if ($leftover) { throw "Pakette gelistirme ayar dosyasi var ($($leftover.Name -join ', ')); yayin durduruldu." }

Write-Step 'Zip olusturuluyor'
New-ZipFromDirectory -SourceDirectory $publishDir -ZipPath $zipPath
$size = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 1)
Write-Host "Hazir: $zipPath ($size MB)"
