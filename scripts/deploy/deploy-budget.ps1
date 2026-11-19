[CmdletBinding()]
param(
    [int]$Amount = 100,
    [string[]]$ContactEmails = @(),
    [string]$RepoRoot,
    [string]$Location = 'westeurope'
)

. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-RepoRoot $RepoRoot
Assert-AzLogin

Write-Step "Butce kurulumu (abonelik kapsami): $Amount birim, 50 ve 80 uyarilari"
$template = Join-Path $root 'infra/budget.bicep'

$arguments = @('deployment', 'sub', 'create', '--location', $Location, '--name', 'lgsapp-budget', '--template-file', $template,
    '--parameters', "amount=$Amount")
if ($ContactEmails.Count -gt 0) {
    $emailJson = ConvertTo-Json -InputObject @($ContactEmails) -Compress
    $arguments += @('--parameters', "contactEmails=$emailJson")
}
Invoke-Az $arguments
Write-Host 'Butce olusturuldu.'
