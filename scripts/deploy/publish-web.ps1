[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$OutputDir,
    [switch]$SkipInstall
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-Command 'node' 'Node.js 22 kurun.'

$frontend = Join-Path $root 'frontend'
$webDir = Join-Path $frontend 'apps/web'
if (-not $OutputDir) { $OutputDir = Join-Path $root 'artifacts' }
$stageDir = Join-Path $OutputDir 'web'
$zipPath = Join-Path $OutputDir 'web.zip'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
if (Test-Path -LiteralPath $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }

$packageJson = Get-Content -LiteralPath (Join-Path $frontend 'package.json') -Raw | ConvertFrom-Json
$pnpmVersion = ($packageJson.packageManager -replace '^pnpm@', '')
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $pnpm = @('pnpm')
}
else {
    Assert-Command 'npx' 'pnpm veya npm (npx) kurun.'
    $pnpm = @('npx', '--yes', "pnpm@$pnpmVersion")
}

function Invoke-Pnpm {
    param([string[]]$Arguments)
    $file = $pnpm[0]
    $prefix = @()
    if ($pnpm.Count -gt 1) { $prefix = $pnpm[1..($pnpm.Count - 1)] }
    Invoke-Native -File $file -Arguments ($prefix + $Arguments) -WorkingDirectory $frontend
}

if (-not $SkipInstall) {
    Write-Step 'Bagimliliklar kuruluyor (frozen lockfile)'
    Invoke-Pnpm @('install', '--frozen-lockfile')
}

Write-Step 'Web derleniyor (next build, standalone)'
Invoke-Pnpm @('--filter', '@lgs/web', 'build')

$distName = if ($env:NEXT_DIST_DIR) { $env:NEXT_DIST_DIR } else { '.next' }
$distDir = Join-Path $webDir $distName
$standalone = Join-Path $distDir 'standalone'
$serverJs = Join-Path $standalone 'apps/web/server.js'
if (-not (Test-Path -LiteralPath $serverJs)) {
    throw "Beklenen standalone yapisi bulunamadi: $serverJs (outputFileTracingRoot ve output: standalone ayarlarini denetleyin)."
}

Write-Step 'Paket hazirlaniyor'
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
Copy-Item -Path (Join-Path $standalone '*') -Destination $stageDir -Recurse -Force

$stageApp = Join-Path $stageDir 'apps/web'
$staticSource = Join-Path $distDir 'static'
if (-not (Test-Path -LiteralPath $staticSource)) { throw "Statik dosyalar bulunamadi: $staticSource" }
New-Item -ItemType Directory -Force -Path (Join-Path $stageApp "$distName/static") | Out-Null
Copy-Item -Path (Join-Path $staticSource '*') -Destination (Join-Path $stageApp "$distName/static") -Recurse -Force

$publicSource = Join-Path $webDir 'public'
if (Test-Path -LiteralPath $publicSource) {
    New-Item -ItemType Directory -Force -Path (Join-Path $stageApp 'public') | Out-Null
    Copy-Item -Path (Join-Path $publicSource '*') -Destination (Join-Path $stageApp 'public') -Recurse -Force
}

foreach ($mustExist in @('server.js', "$distName/static", "$distName/BUILD_ID")) {
    if (-not (Test-Path -LiteralPath (Join-Path $stageApp $mustExist))) { throw "Pakette eksik oge: apps/web/$mustExist" }
}
if (-not (Test-Path -LiteralPath (Join-Path $stageDir 'node_modules/next'))) { throw 'Pakette node_modules/next yok.' }

Write-Step 'Zip olusturuluyor'
New-ZipFromDirectory -SourceDirectory $stageDir -ZipPath $zipPath
$size = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 1)
Write-Host "Hazir: $zipPath ($size MB). Baslatma komutu: node apps/web/server.js"
