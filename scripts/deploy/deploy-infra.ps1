[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [string]$Location = 'westeurope',
    [string]$ParametersFile,
    [string]$DeploymentName = 'main',
    [string]$RepoRoot
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-AzLogin

$template = Join-Path $root 'infra/main.bicep'
if (-not $ParametersFile) {
    $candidate = Join-Path $root 'infra/main.parameters.json'
    $ParametersFile = if (Test-Path -LiteralPath $candidate) { $candidate } else { Join-Path $root 'infra/main.parameters.example.json' }
}
Write-Host "Sablon: $template"
Write-Host "Parametre dosyasi: $ParametersFile"

Write-Step "Kaynak grubu: $ResourceGroup ($Location)"
Invoke-Az @('group', 'create', '--name', $ResourceGroup, '--location', $Location, '--output', 'none')

Write-Step 'SQL yonetici sifresi belirleniyor'
$sqlPassword = $null
$vaultName = Get-AzText @('keyvault', 'list', '--resource-group', $ResourceGroup, '--query', '[0].name')
if ($vaultName) {
    $existing = Get-KeyVaultSecretValue -VaultName $vaultName -Name 'Sql-ConnectionString'
    if ($existing -and ($existing -match 'Password=([^;]+)')) {
        $sqlPassword = $Matches[1]
        Write-Host 'Mevcut sifre Key Vault baglanti dizesinden alindi (degismeyecek).'
    }
}
if (-not $sqlPassword) {
    $sqlPassword = New-RandomPassword 32
    Write-Host 'Yeni rastgele sifre uretildi; yalnizca Key Vault baglanti dizesine yazilacak.'
}

$deployerObjectId = Get-AzText @('ad', 'signed-in-user', 'show', '--query', 'id')
$commonArguments = @(
    '--resource-group', $ResourceGroup,
    '--name', $DeploymentName,
    '--template-file', $template,
    '--parameters', "@$ParametersFile",
    '--parameters', "sqlAdminPassword=$sqlPassword"
)
if ($deployerObjectId) { $commonArguments += @('--parameters', "deployerObjectId=$deployerObjectId") }
else { Write-Warning 'Oturum acan kullanici nesne kimligi alinamadi; Key Vault Secrets Officer rolunu elle atamaniz gerekir.' }

Write-Step 'what-if (degisiklik onizlemesi)'
Invoke-Az (@('deployment', 'group', 'what-if') + $commonArguments)

if (-not (Read-Confirmation 'Yukaridaki degisiklikler uygulansin mi')) {
    Write-Host 'Iptal edildi; hicbir kaynak degistirilmedi.'
    return
}

Write-Step 'Dagitim'
Invoke-Az (@('deployment', 'group', 'create') + $commonArguments + @('--output', 'none'))

$outputs = Get-DeploymentOutputs -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName
Write-Host ''
Write-Host 'Dagitim tamamlandi.'
Write-Host "  API : $($outputs.apiUrl)"
Write-Host "  Web : $($outputs.webUrl)"
Write-Host "  Key Vault : $($outputs.keyVaultName)"
Write-Host 'Siradaki adim: set-secrets.ps1'
