[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [string]$DeploymentName = 'main',
    [string]$AdminUserName,
    [switch]$Remove
)

. (Join-Path $PSScriptRoot '_common.ps1')
Assert-AzLogin
$outputs = Get-DeploymentOutputs -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName
$api = $outputs.apiAppName

if ($Remove) {
    Write-Step 'Seed degiskenleri siliniyor'
    Invoke-Az @('webapp', 'config', 'appsettings', 'delete', '--resource-group', $ResourceGroup, '--name', $api,
        '--setting-names', 'Seed__Enabled', 'Seed__AdminUserName', 'Seed__AdminPassword', '--output', 'none')
    Write-Host 'Seed degiskenleri silindi; API yeniden baslatildi.'
    return
}

if (-not $AdminUserName) { $AdminUserName = Read-Host 'Ilk mudur kullanici adi' }
$secure = Read-Host -Prompt 'Ilk mudur tek seferlik sifresi' -AsSecureString
$plain = ConvertFrom-SecureStringPlain $secure
try {
    Write-Step 'Seed degiskenleri yaziliyor (API yeniden baslar)'
    Invoke-Az @('webapp', 'config', 'appsettings', 'set', '--resource-group', $ResourceGroup, '--name', $api,
        '--settings', 'Seed__Enabled=true', "Seed__AdminUserName=$AdminUserName", "Seed__AdminPassword=$plain", '--output', 'none')
}
finally { $plain = $null }
Write-Host 'Mudur ilk giriste sifresini degistirdikten sonra: set-seed.ps1 -Remove'
