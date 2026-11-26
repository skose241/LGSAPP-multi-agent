[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [string]$DeploymentName = 'main',
    [string]$RepoRoot,
    [string]$OutputDir,
    [string]$ClientIp,
    [string]$Container = 'images',
    [switch]$BlobsOnly
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-AzLogin

function Clear-Container {
    param([string]$StorageConnection, [string]$StorageAccount, [string]$Container)
    $previous = $env:AZURE_STORAGE_CONNECTION_STRING
    try {
        if ($StorageConnection) {
            $env:AZURE_STORAGE_CONNECTION_STRING = $StorageConnection
            Invoke-Az @('storage', 'blob', 'delete-batch', '--source', $Container, '--output', 'none')
        }
        else {
            Write-Host 'Storage-ConnectionString yok; --auth-mode login ile deneniyor (Storage Blob Data Contributor gerekir).'
            Invoke-Az @('storage', 'blob', 'delete-batch', '--account-name', $StorageAccount, '--source', $Container, '--auth-mode', 'login', '--output', 'none')
        }
    }
    finally { $env:AZURE_STORAGE_CONNECTION_STRING = $previous }
}

function Get-OtherSessionCount {
    param([string[]]$RunBase)
    $text = Invoke-NativeCapture -File 'dotnet' -Arguments ($RunBase + @('reset-database', '--dry-run'))
    if ($text -and $text -match 'oturum\S*: (\d+)') { return [int]$Matches[1] }
    return -1
}

Write-Step 'Dagitim ciktilari okunuyor'
$outputs = Get-DeploymentOutputs -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName
$api = $outputs.apiAppName
$sqlServer = $outputs.sqlServerName
$databaseName = $outputs.sqlDatabaseName
$vault = $outputs.keyVaultName
$storageAccount = $outputs.storageAccountName
$apiUrl = $outputs.apiUrl
if (-not $api -or -not $apiUrl -or -not $sqlServer -or -not $databaseName -or -not $vault -or -not $storageAccount) {
    throw 'Dagitim ciktilarinda apiAppName, apiUrl, sqlServerName, sqlDatabaseName, keyVaultName veya storageAccountName eksik.'
}
Write-Host "API: $api | SQL sunucusu: $sqlServer | Veritabani: $databaseName | Depolama: $storageAccount/$Container"

$blobRetry = "./scripts/deploy/reset-data.ps1 -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName -BlobsOnly"

Write-Step 'Baglanti bilgileri Key Vault''tan okunuyor (diske yazilmaz, ekrana basilmaz)'
$storageConnection = Get-KeyVaultSecretValue -VaultName $vault -Name 'Storage-ConnectionString'

if ($BlobsOnly) {
    Write-Host "UYARI: '$storageAccount/$Container' kabindaki TUM dosyalar silinecek." -ForegroundColor Yellow
    if (-not (Read-Confirmation 'Kap gercekten bosaltilsin mi')) { throw 'Kullanici vazgecti; hicbir sey silinmedi.' }
    Write-Step "Depolama kabi bosaltiliyor: $storageAccount/$Container"
    Clear-Container -StorageConnection $storageConnection -StorageAccount $storageAccount -Container $Container
    Write-Host 'Kap bosaltildi.'
    return
}

Assert-Command 'dotnet' '.NET SDK kurun (global.json surumu).'
if (-not (Invoke-NativeCapture -File 'dotnet' -Arguments @('ef', '--version'))) {
    throw "dotnet-ef bulunamadi. Kurulum: dotnet tool install --global dotnet-ef --version 10.0.14"
}

if (-not $OutputDir) { $OutputDir = Join-Path $root 'artifacts' }
$bundleDir = Join-Path $OutputDir 'bundle'
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

$connection = Get-KeyVaultSecretValue -VaultName $vault -Name 'Sql-ConnectionString'
$pepper = Get-KeyVaultSecretValue -VaultName $vault -Name 'RecoveryCodes-Pepper'
if (-not $connection) { throw 'Sql-ConnectionString okunamadi. Key Vault yetkinizi ve dagitimi denetleyin.' }
if (-not $pepper) { throw 'RecoveryCodes-Pepper okunamadi. Once set-secrets.ps1 calistirin.' }

$rid = Get-HostRuntimeIdentifier
$bundleName = if ($script:IsWindowsHost) { 'efbundle.exe' } else { 'efbundle' }
$bundlePath = Join-Path $bundleDir $bundleName
$project = Join-Path $root 'backend/src/LGSApp.Api/LGSApp.Api.csproj'
$runBase = @('run', '-c', 'Release', '--no-launch-profile', '--project', $project, '-p:OpenApiGenerateDocumentsOnBuild=false', '--')

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
$ruleName = 'reset-' + (Get-Date -Format 'yyyyMMddHHmmss')

$saved = @{
    Environment = $env:ASPNETCORE_ENVIRONMENT
    Connection  = $env:ConnectionStrings__DefaultConnection
    Pepper      = $env:RecoveryCodes__Pepper
}
$ruleCreated = $false
$apiStopped = $false
$completed = $false
$blobsDone = $false

try {
    Write-Step "Gecici SQL guvenlik duvari kurali: $ruleName ($ClientIp)"
    Invoke-Az @('sql', 'server', 'firewall-rule', 'create', '--resource-group', $ResourceGroup, '--server', $sqlServer,
        '--name', $ruleName, '--start-ip-address', $ClientIp, '--end-ip-address', $ClientIp, '--output', 'none')
    $ruleCreated = $true
    Write-Host 'Kuralin yayilmasi icin 30 sn bekleniyor...'
    Start-Sleep -Seconds 30

    $env:ASPNETCORE_ENVIRONMENT = 'Production'
    $env:ConnectionStrings__DefaultConnection = $connection
    $env:RecoveryCodes__Pepper = $pepper

    Write-Step 'Silinecek verinin ozeti (satir sayilari)'
    Invoke-Native -File 'dotnet' -Arguments ($runBase + @('reset-database', '--dry-run'))

    Write-Host ''
    Write-Host "UYARI: '$databaseName' veritabanindaki TUM veriler ve sema, '$Container' kabindaki TUM dosyalar silinecek." -ForegroundColor Yellow
    $typed = Read-Host "Devam etmek icin veritabani adini aynen yazin ($databaseName)"
    if ($typed.Trim() -cne $databaseName) { throw 'Veritabani adi eslesmedi; hicbir sey silinmedi.' }
    if (-not (Read-Confirmation 'Son onay: API durdurulup tum veri GERI DONMEZ sekilde silinsin mi')) { throw 'Kullanici vazgecti; hicbir sey silinmedi.' }

    Write-Step "API durduruluyor: $api"
    $apiStopped = $true
    Invoke-Az @('webapp', 'stop', '--resource-group', $ResourceGroup, '--name', $api, '--output', 'none')

    Write-Host 'API durumunun Stopped olmasi bekleniyor (en fazla 120 sn)...'
    $deadline = (Get-Date).AddSeconds(120)
    $state = ''
    while ((Get-Date) -lt $deadline) {
        $state = Get-AzText @('webapp', 'show', '--resource-group', $ResourceGroup, '--name', $api, '--query', 'state')
        if ($state -eq 'Stopped') { break }
        Start-Sleep -Seconds 5
    }
    if ($state -ne 'Stopped') {
        Write-Warning "API durumu 'Stopped' olmadi (son durum: $state)."
        if (-not (Read-Confirmation 'API tam durmadan devam edilsin mi')) { throw 'Kullanici vazgecti; hicbir sey silinmedi.' }
    }

    Write-Host 'Veritabanindaki diger kullanici oturumlarinin kapanmasi bekleniyor (en fazla 120 sn)...'
    $sessionDeadline = (Get-Date).AddSeconds(120)
    $sessions = Get-OtherSessionCount -RunBase $runBase
    while ($sessions -ne 0 -and (Get-Date) -lt $sessionDeadline) {
        Write-Host "   Acik oturum: $sessions; 10 sn sonra yeniden denetlenecek."
        Start-Sleep -Seconds 10
        $sessions = Get-OtherSessionCount -RunBase $runBase
    }
    if ($sessions -ne 0) {
        Write-Warning "Veritabaninda hala diger oturumlar var (sayi: $sessions; -1 okunamadi demektir)."
        if (-not (Read-Confirmation 'Oturumlar kapanmadan silmeye devam edilsin mi')) { throw 'Kullanici vazgecti; hicbir sey silinmedi.' }
    }

    Write-Step 'Veritabani nesneleri siliniyor'
    Invoke-Native -File 'dotnet' -Arguments ($runBase + @('reset-database', '--confirm', $databaseName))

    Write-Step 'Migration uygulaniyor'
    $applied = $false
    for ($attempt = 1; $attempt -le 3 -and -not $applied; $attempt++) {
        Push-Location -LiteralPath $bundleDir
        try { & $bundlePath }
        finally { Pop-Location }
        if ($LASTEXITCODE -eq 0) { $applied = $true }
        elseif ($attempt -lt 3) { Write-Host "Deneme $attempt basarisiz; 20 sn sonra yeniden denenecek."; Start-Sleep -Seconds 20 }
    }
    if (-not $applied) { throw 'Migration uygulanamadi. Sorunu giderip betigi yeniden calistirin.' }

    Write-Step 'Referans veri (ders/konu) yukleniyor'
    Invoke-Native -File 'dotnet' -Arguments ($runBase + @('seed-reference-data'))
    $completed = $true

    Write-Step "Depolama kabi bosaltiliyor: $storageAccount/$Container"
    try {
        Clear-Container -StorageConnection $storageConnection -StorageAccount $storageAccount -Container $Container
        $blobsDone = $true
    }
    catch {
        Write-Warning "Depolama kabi bosaltilamadi: $($_.Exception.Message)"
        Write-Warning "Veritabani sifirlandi ancak dosyalar silinmedi. Yeniden deneyin: $blobRetry"
    }
}
finally {
    $env:ASPNETCORE_ENVIRONMENT = $saved.Environment
    $env:ConnectionStrings__DefaultConnection = $saved.Connection
    $env:RecoveryCodes__Pepper = $saved.Pepper
    $pepper = $null
    $connection = $null
    $storageConnection = $null

    if ($apiStopped) {
        try {
            if ($completed) { Write-Step "API baslatiliyor: $api" }
            else { Write-Warning 'Islem tamamlanmadan bitti; API yine de baslatiliyor. Sema yarim kalmis olabilir (baslangic korumasi migration eksikse API acilmaz).' }
            Invoke-Az @('webapp', 'start', '--resource-group', $ResourceGroup, '--name', $api, '--output', 'none')
        }
        catch { Write-Warning "API baslatilamadi! Elle baslatin: az webapp start -g $ResourceGroup -n $api ($($_.Exception.Message))" }
    }

    if ($ruleCreated) {
        try {
            Write-Step "Gecici guvenlik duvari kurali siliniyor: $ruleName"
            & az sql server firewall-rule delete --resource-group $ResourceGroup --server $sqlServer --name $ruleName --output none
            if ($LASTEXITCODE -ne 0) { throw "az $LASTEXITCODE koduyla bitti." }
        }
        catch { Write-Warning "Kural silinemedi! Elle silin: az sql server firewall-rule delete -g $ResourceGroup -s $sqlServer -n $ruleName ($($_.Exception.Message))" }
    }
}

if ($completed) {
    Write-Step 'API hazir olana kadar bekleniyor'
    $ready = $false
    for ($i = 1; $i -le 30 -and -not $ready; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "$apiUrl/health/ready" -UseBasicParsing -TimeoutSec 20
            if ($response.StatusCode -eq 200) { $ready = $true }
        }
        catch { }
        if (-not $ready) { Start-Sleep -Seconds 10 }
    }
    if ($ready) { Write-Host 'API hazir (200).' }
    else { Write-Warning "API 5 dakika icinde 200 donmedi. Gunlukler: az webapp log tail -g $ResourceGroup -n $api" }

    Write-Host ''
    Write-Host 'Sifirlama tamamlandi. Sonraki adimlar:' -ForegroundColor Green
    $lastName = 'K' + [char]0x00F6 + 'se'
    Write-Host "  1) ./scripts/deploy/set-seed.ps1 -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName -AdminUserName sistem -AdminFirstName Semih -AdminLastName $lastName"
    Write-Host '  2) Mudur ile giris yapip sifreyi degistirin, sonra: ./scripts/deploy/set-seed.ps1 -ResourceGroup <ad> -Remove'
    Write-Host '  3) Yapay zeka hesabi (yapay.zeka) API acilisinda otomatik olusur.'
    if (-not $blobsDone) { Write-Warning "Blob kabi bosaltilmadi. Yeniden deneyin: $blobRetry" }
}
