Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:IsWindowsHost = ($PSVersionTable.PSVersion.Major -lt 6) -or ($IsWindows)

function Get-RepoRoot {
    param([string]$RepoRoot)
    if ($RepoRoot) { return (Resolve-Path -LiteralPath $RepoRoot).Path }
    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
}

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
    param([string]$Name, [string]$Hint)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' bulunamadi. $Hint"
    }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$File,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory
    )
    if ($WorkingDirectory) { Push-Location -LiteralPath $WorkingDirectory }
    try {
        & $File @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "'$File' komutu $LASTEXITCODE koduyla basarisiz oldu."
        }
    }
    finally {
        if ($WorkingDirectory) { Pop-Location }
    }
}

function Invoke-NativeCapture {
    param(
        [Parameter(Mandatory)][string]$File,
        [string[]]$Arguments = @()
    )
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $File @Arguments 2>$null
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($output | Out-String).Trim()
}

function Invoke-Az {
    param([string[]]$Arguments)
    Invoke-Native -File 'az' -Arguments $Arguments
}

function Get-AzText {
    param([string[]]$Arguments)
    return Invoke-NativeCapture -File 'az' -Arguments ($Arguments + @('--output', 'tsv'))
}

function Assert-AzLogin {
    Assert-Command 'az' 'Azure CLI kurun: https://learn.microsoft.com/cli/azure/install-azure-cli'
    $account = Invoke-NativeCapture -File 'az' -Arguments @('account', 'show', '--query', 'id', '--output', 'tsv')
    if (-not $account) { throw "Azure CLI oturumu yok. Once 'az login' calistirin." }
}

function Get-DeploymentOutputs {
    param([string]$ResourceGroup, [string]$DeploymentName = 'main')
    $json = Invoke-NativeCapture -File 'az' -Arguments @(
        'deployment', 'group', 'show', '--resource-group', $ResourceGroup, '--name', $DeploymentName,
        '--query', 'properties.outputs', '--output', 'json')
    if (-not $json) { throw "'$DeploymentName' dagitimi '$ResourceGroup' kaynak grubunda bulunamadi. Once deploy-infra.ps1 calistirin." }
    $raw = $json | ConvertFrom-Json
    $result = @{}
    foreach ($property in $raw.PSObject.Properties) { $result[$property.Name] = $property.Value.value }
    return $result
}

function New-RandomBytes {
    param([int]$Count)
    $bytes = New-Object byte[] $Count
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return , $bytes
}

function New-RandomBase64 {
    param([int]$ByteCount)
    return [Convert]::ToBase64String((New-RandomBytes $ByteCount))
}

function New-RandomHex {
    param([int]$ByteCount)
    return (([System.BitConverter]::ToString((New-RandomBytes $ByteCount))) -replace '-', '').ToLowerInvariant()
}

function New-RandomPassword {
    param([int]$Length = 32)
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = New-RandomBytes $Length
    $chars = for ($i = 0; $i -lt $Length; $i++) { $alphabet[$bytes[$i] % $alphabet.Length] }
    return 'Aa1' + (-join $chars)
}

function ConvertFrom-SecureStringPlain {
    param([System.Security.SecureString]$Secure)
    $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Read-Confirmation {
    param([string]$Prompt)
    $answer = Read-Host "$Prompt (evet/hayir)"
    return $answer.Trim().ToLowerInvariant() -in @('evet', 'e', 'yes', 'y')
}

function Get-KeyVaultSecretValue {
    param([string]$VaultName, [string]$Name)
    return Invoke-NativeCapture -File 'az' -Arguments @(
        'keyvault', 'secret', 'show', '--vault-name', $VaultName, '--name', $Name, '--query', 'value', '--output', 'tsv')
}

function Test-KeyVaultSecretExists {
    param([string]$VaultName, [string]$Name)
    $id = Invoke-NativeCapture -File 'az' -Arguments @(
        'keyvault', 'secret', 'show', '--vault-name', $VaultName, '--name', $Name, '--query', 'id', '--output', 'tsv')
    return [bool]$id
}

function Set-KeyVaultSecretValue {
    param([string]$VaultName, [string]$Name, [string]$Value, [int]$Attempts = 12)
    for ($i = 1; $i -le $Attempts; $i++) {
        & az keyvault secret set --vault-name $VaultName --name $Name "--value=$Value" --output none 2>$null
        if ($LASTEXITCODE -eq 0) { return }
        if ($i -eq $Attempts) { throw "Key Vault sirri yazilamadi: $Name. Rol atamasinin yayilmasini bekleyip yeniden deneyin." }
        Write-Host "   Key Vault yazma yetkisi henuz yayilmamis olabilir; 20 sn sonra yeniden denenecek ($i/$Attempts)..."
        Start-Sleep -Seconds 20
    }
}

function New-ZipFromDirectory {
    param([string]$SourceDirectory, [string]$ZipPath)
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
    $base = (Resolve-Path -LiteralPath $SourceDirectory).Path.TrimEnd('\', '/')
    $fileStream = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::CreateNew)
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($file in Get-ChildItem -LiteralPath $base -Recurse -File -Force) {
                $relative = $file.FullName.Substring($base.Length + 1).Replace('\', '/')
                [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal)
            }
        }
        finally { $archive.Dispose() }
    }
    finally { $fileStream.Dispose() }
}

function Get-HostRuntimeIdentifier {
    if ($script:IsWindowsHost) { return 'win-x64' }
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    $os = if ($IsMacOS) { 'osx' } else { 'linux' }
    return "$os-$arch"
}
