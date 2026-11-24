[CmdletBinding()]
param(
    [int]$Amount = 40,
    [int[]]$AlertAmounts = @(25, 35),
    [string[]]$ContactEmails = @(),
    [string]$RepoRoot,
    [string]$Location = 'westeurope'
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-AzLogin

Write-Step "Butce kurulumu (abonelik kapsami): $Amount birim, $($AlertAmounts -join ' ve ') uyarilari"
$template = Join-Path $root 'infra/budget.bicep'

$alertJson = ConvertTo-Json -InputObject @($AlertAmounts) -Compress

$arguments = @('deployment', 'sub', 'create', '--location', $Location, '--name', 'lgsapp-budget', '--template-file', $template,
    '--parameters', "amount=$Amount", '--parameters', "alertAmounts=$alertJson")
if ($ContactEmails.Count -gt 0) {
    $emailJson = ConvertTo-Json -InputObject @($ContactEmails) -Compress
    if ($script:IsWindowsHost) { $emailJson = $emailJson -replace '"', '\"' }
    $arguments += @('--parameters', "contactEmails=$emailJson")
}
Invoke-Az $arguments
Write-Host 'Butce olusturuldu.'