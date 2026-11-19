[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [string]$DeploymentName = 'main',
    [string]$RepoRoot,
    [string]$OutputDir,
    [string]$ClientIp,
    [switch]$SkipSeed
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-AzLogin
Assert-Command 'dotnet' '.NET SDK kurun (global.json surumu).'
if (-not (Invoke-NativeCapture -File 'dotnet' -Arguments @('ef', '--version'))) {
    throw "dotnet-ef bulunamadi. Kurulum: dotnet tool install --global dotnet-ef --version 10.0.14"
}

if (-not $OutputDir) { $OutputDir = Join-Path $root 'artifacts' }
$bundleDir = Join-Path $OutputDir 'bundle'
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

$outputs = Get-DeploymentOutputs -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName
$vault = $outputs.keyVaultName
$sqlServer = $outputs.sqlServerName

Write-Step 'Baglanti bilgileri Key Vault''tan okunuyor (diske yazilmaz)'
$connection = Get-KeyVaultSecretValue -VaultName $vault -Name 'Sql-ConnectionString'
$pepper = Get-KeyVaultSecretValue -VaultName $vault -Name 'RecoveryCodes-Pepper'
if (-not $connection) { throw 'Sql-ConnectionString okunamadi. Key Vault yetkinizi ve dagitimi denetleyin.' }
if (-not $pepper) { throw 'RecoveryCodes-Pepper okunamadi. Once set-secrets.ps1 calistirin.' }

$rid = Get-HostRuntimeIdentifier
$bundleName = if ($script:IsWindowsHost) { 'efbundle.exe' } else { 'efbundle' }
$bundlePath = Join-Path $bundleDir $bundleName

Write-Step "Migration paketi olusturuluyor ($rid)"
Invoke-Native -File 'dotnet' -WorkingDirectory $root -Arguments @(
    'ef', 'migrations', 'bundle',
    '--project', 'backend/src/LGSApp.Infrastructure',
    '--startup-project', 'backend/src/LGSApp.Api',
    '--configuration', 'Release',
    '-r', $rid, '--self-contained', '--force',
    '-o', $bundlePath)

if (-not $ClientIp) {
    Write-Step 'Calistiran makinenin genel IP adresi bulunuyor'
    $ClientIp = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 15).ToString().Trim()
}
if ($ClientIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw "Gecersiz IPv4 adresi: $ClientIp" }
$ruleName = 'migrate-' + (Get-Date -Format 'yyyyMMddHHmmss')

Write-Step "Gecici SQL guvenlik duvari kurali: $ruleName ($ClientIp)"
Invoke-Az @('sql', 'server', 'firewall-rule', 'create', '--resource-group', $ResourceGroup, '--server', $sqlServer,
    '--name', $ruleName, '--start-ip-address', $ClientIp, '--end-ip-address', $ClientIp, '--output', 'none')

$saved = @{
    Environment = $env:ASPNETCORE_ENVIRONMENT
    Connection  = $env:ConnectionStrings__DefaultConnection
    Pepper      = $env:RecoveryCodes__Pepper
}
try {
    Write-Host 'Kuralin yayilmasi icin 30 sn bekleniyor...'
    Start-Sleep -Seconds 30

    Write-Step 'Migration uygulaniyor'
    $applied = $false
    for ($attempt = 1; $attempt -le 3 -and -not $applied; $attempt++) {
        Push-Location -LiteralPath $bundleDir
        try {
            $env:ASPNETCORE_ENVIRONMENT = 'Production'
            $env:ConnectionStrings__DefaultConnection = $connection
            & $bundlePath
        }
        finally { Pop-Location }
        if ($LASTEXITCODE -eq 0) { $applied = $true }
        elseif ($attempt -lt 3) { Write-Host "Deneme $attempt basarisiz; 20 sn sonra yeniden denenecek."; Start-Sleep -Seconds 20 }
    }
    if (-not $applied) { throw 'Migration uygulanamadi.' }
    Write-Host 'Migration tamamlandi.'

    if (-not $SkipSeed) {
        $env:ASPNETCORE_ENVIRONMENT = 'Production'
        $env:ConnectionStrings__DefaultConnection = $connection
        $env:RecoveryCodes__Pepper = $pepper
        $project = Join-Path $root 'backend/src/LGSApp.Api/LGSApp.Api.csproj'
        $seedBase = @('run', '-c', 'Release', '--no-launch-profile', '--project', $project, '-p:OpenApiGenerateDocumentsOnBuild=false', '--', 'seed-reference-data')

        Write-Step 'Referans veri: deneme calistirmasi (--dry-run)'
        Invoke-Native -File 'dotnet' -Arguments ($seedBase + @('--dry-run'))

        if (Read-Confirmation 'Referans veri (ders/konu) gercekten yuklensin mi') {
            Write-Step 'Referans veri yukleniyor'
            Invoke-Native -File 'dotnet' -Arguments $seedBase
        }
        else { Write-Host 'Referans veri yuklenmedi.' }
    }
}
finally {
    $env:ASPNETCORE_ENVIRONMENT = $saved.Environment
    $env:ConnectionStrings__DefaultConnection = $saved.Connection
    $env:RecoveryCodes__Pepper = $saved.Pepper
    $pepper = $null
    $connection = $null
    Write-Step "Gecici guvenlik duvari kurali siliniyor: $ruleName"
    & az sql server firewall-rule delete --resource-group $ResourceGroup --server $sqlServer --name $ruleName --yes --output none
    if ($LASTEXITCODE -ne 0) { Write-Warning "Kural silinemedi! Elle silin: az sql server firewall-rule delete -g $ResourceGroup -s $sqlServer -n $ruleName" }
}
