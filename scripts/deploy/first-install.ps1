[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [string]$Location = 'westeurope',
    [string]$ParametersFile,
    [string]$DeploymentName = 'main',
    [string]$RepoRoot,
    [string]$AdminUserName
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-AzLogin

function Confirm-Step {
    param([string]$Title)
    Write-Step $Title
    if (-not (Read-Confirmation 'Bu adim calistirilsin mi')) { throw "Adim atlandi: $Title. Kurulum sirasi bozulmamali; kaldigi yerden ilgili betikle devam edin." }
}

Confirm-Step '1/9 Butce (abonelik kapsami, 50 ve 80 uyarilari)'
& (Join-Path $PSScriptRoot 'deploy-budget.ps1') -RepoRoot $root -Location $Location

Confirm-Step '2/9 Altyapi: what-if onizlemesi ve dagitim (what-if onayi betik icinde zorunludur)'
$infraArguments = @{ ResourceGroup = $ResourceGroup; Location = $Location; DeploymentName = $DeploymentName; RepoRoot = $root }
if ($ParametersFile) { $infraArguments['ParametersFile'] = $ParametersFile }
& (Join-Path $PSScriptRoot 'deploy-infra.ps1') @infraArguments

Confirm-Step '3/9 Sirlar (Key Vault)'
& (Join-Path $PSScriptRoot 'set-secrets.ps1') -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName

Confirm-Step '4/9 Paketler hazirlaniyor (API ve web)'
& (Join-Path $PSScriptRoot 'publish-api.ps1') -RepoRoot $root
& (Join-Path $PSScriptRoot 'publish-web.ps1') -RepoRoot $root

Confirm-Step '5/9 Veritabani migration ve referans veri (gecici guvenlik duvari kurali)'
& (Join-Path $PSScriptRoot 'migrate-db.ps1') -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName -RepoRoot $root

Confirm-Step '6/9 Ilk mudur icin Seed degiskenleri'
$seedArguments = @{ ResourceGroup = $ResourceGroup; DeploymentName = $DeploymentName }
if ($AdminUserName) { $seedArguments['AdminUserName'] = $AdminUserName }
& (Join-Path $PSScriptRoot 'set-seed.ps1') @seedArguments

Confirm-Step '7/9 API ve web dagitimi'
& (Join-Path $PSScriptRoot 'deploy-apps.ps1') -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName -RepoRoot $root

Write-Step '8/9 Ilk mudur girisi (elle)'
Write-Host 'Web adresini tarayicida acin, mudur hesabiyla giris yapin ve sifreyi degistirin.'
Read-Host 'Sifreyi degistirdiyseniz Enter''a basin'

Confirm-Step '9/9 Seed degiskenlerini sil'
& (Join-Path $PSScriptRoot 'set-seed.ps1') -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName -Remove

Write-Host ''
Write-Host 'Kurulum tamamlandi.'
