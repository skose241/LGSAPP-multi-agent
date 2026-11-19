[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [string]$DeploymentName = 'main',
    [switch]$RotateJwtKey,
    [switch]$RotateProxyKey,
    [switch]$SkipGemini,
    [switch]$RestartApps
)

. (Join-Path $PSScriptRoot '_common.ps1')
Assert-AzLogin

$outputs = Get-DeploymentOutputs -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName
$vault = $outputs.keyVaultName
Write-Step "Key Vault sirlari: $vault"

foreach ($required in @('Sql-ConnectionString', 'Storage-ConnectionString')) {
    if (-not (Test-KeyVaultSecretExists -VaultName $vault -Name $required)) {
        Write-Warning "$required Key Vault'ta okunamadi. Dagitim bu sirri yazar; rol yayilimi bekleniyor olabilir veya dagitim eksik."
    }
}

if ((Test-KeyVaultSecretExists $vault 'Jwt-Key') -and -not $RotateJwtKey) {
    Write-Host 'Jwt-Key mevcut, degistirilmedi.'
}
else {
    Set-KeyVaultSecretValue -VaultName $vault -Name 'Jwt-Key' -Value (New-RandomBase64 64)
    Write-Host 'Jwt-Key yazildi.'
}

if (Test-KeyVaultSecretExists $vault 'RecoveryCodes-Pepper') {
    Write-Host 'RecoveryCodes-Pepper mevcut; pepper bir kez belirlenir, USTUNE YAZILMADI.'
}
else {
    Set-KeyVaultSecretValue -VaultName $vault -Name 'RecoveryCodes-Pepper' -Value (New-RandomBase64 48)
    Write-Host 'RecoveryCodes-Pepper yazildi.'
}

if ((Test-KeyVaultSecretExists $vault 'Bff-ProxyKey') -and -not $RotateProxyKey) {
    Write-Host 'Bff-ProxyKey mevcut, degistirilmedi.'
}
else {
    Set-KeyVaultSecretValue -VaultName $vault -Name 'Bff-ProxyKey' -Value (New-RandomHex 32)
    Write-Host 'Bff-ProxyKey yazildi.'
}

if (-not $SkipGemini) {
    foreach ($item in @(
            @{ Secret = 'Gemini-QuestionApiKey'; Label = 'Gemini soru uretimi API anahtari' },
            @{ Secret = 'Gemini-SolutionApiKey'; Label = 'Gemini cozum API anahtari' })) {
        $exists = Test-KeyVaultSecretExists $vault $item.Secret
        $hint = if ($exists) { ' (mevcut; bos birakirsaniz korunur)' } else { '' }
        $secure = Read-Host -Prompt "$($item.Label)$hint" -AsSecureString
        if ($secure.Length -eq 0) {
            if (-not $exists) { Write-Warning "$($item.Secret) bos birakildi; yapay zeka ozellikleri calismaz." }
            continue
        }
        $plain = ConvertFrom-SecureStringPlain $secure
        try { Set-KeyVaultSecretValue -VaultName $vault -Name $item.Secret -Value $plain }
        finally { $plain = $null }
        Write-Host "$($item.Secret) yazildi."
    }
}

if ($RestartApps) {
    Write-Step 'Uygulamalar yeniden baslatiliyor (Key Vault referanslari yenilenir)'
    Invoke-Az @('webapp', 'restart', '--resource-group', $ResourceGroup, '--name', $outputs.apiAppName)
    Invoke-Az @('webapp', 'restart', '--resource-group', $ResourceGroup, '--name', $outputs.webAppName)
}
else {
    Write-Host ''
    Write-Host 'Not: Key Vault referanslari yeni sirlari en gec 24 saatte alir. Hemen almak icin uygulamalari yeniden baslatin (-RestartApps).'
}
