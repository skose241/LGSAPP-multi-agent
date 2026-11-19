[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [string]$DeploymentName = 'main',
    [string]$RepoRoot,
    [string]$ArtifactsDir,
    [ValidateSet('api', 'web', 'both')][string]$Target = 'both'
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-AzLogin

if (-not $ArtifactsDir) { $ArtifactsDir = Join-Path $root 'artifacts' }
$outputs = Get-DeploymentOutputs -ResourceGroup $ResourceGroup -DeploymentName $DeploymentName

function Wait-Healthy {
    param([string]$Url, [string]$Label)
    Write-Host "$Label saglik denetimi: $Url"
    for ($i = 1; $i -le 30; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
            if ($response.StatusCode -eq 200) { Write-Host "   $Label hazir (200)."; return }
        }
        catch { }
        Start-Sleep -Seconds 10
    }
    Write-Warning "$Label 5 dakika icinde 200 donmedi. Gunlukler: az webapp log tail -g $ResourceGroup -n <uygulama>"
}

if ($Target -in @('api', 'both')) {
    $zip = Join-Path $ArtifactsDir 'api.zip'
    if (-not (Test-Path -LiteralPath $zip)) { throw "api.zip yok: $zip. Once publish-api.ps1 calistirin." }
    Write-Step "API dagitiliyor: $($outputs.apiAppName)"
    Invoke-Az @('webapp', 'deploy', '--resource-group', $ResourceGroup, '--name', $outputs.apiAppName, '--src-path', $zip, '--type', 'zip')
    Wait-Healthy -Url "$($outputs.apiUrl)/health/ready" -Label 'API'
}

if ($Target -in @('web', 'both')) {
    $zip = Join-Path $ArtifactsDir 'web.zip'
    if (-not (Test-Path -LiteralPath $zip)) { throw "web.zip yok: $zip. Once publish-web.ps1 calistirin." }
    Write-Step "Web dagitiliyor: $($outputs.webAppName)"
    Invoke-Az @('webapp', 'deploy', '--resource-group', $ResourceGroup, '--name', $outputs.webAppName, '--src-path', $zip, '--type', 'zip')
    Wait-Healthy -Url "$($outputs.webUrl)/healthz" -Label 'Web'
}

Write-Host ''
Write-Host "Web adresi: $($outputs.webUrl)"
