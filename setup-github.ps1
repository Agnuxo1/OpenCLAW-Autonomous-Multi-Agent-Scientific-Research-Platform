<#
.SYNOPSIS
    Setup script for OpenCLAW Autonomous Platform GitHub Secrets and State Gist.
.DESCRIPTION
    This script:
    1. Creates a private GitHub Gist for agent state persistence.
    2. Sets all required GitHub Repository Secrets for the Actions workflows.
    3. Triggers the first workflow run manually.
.NOTES
    Requires a GitHub Personal Access Token with 'gist' and 'repo' scopes.
    Usage: .\setup-github.ps1 -GitHubToken "ghp_your_token_here"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$GitHubToken
)

$ErrorActionPreference = "Stop"
$repo = "Agnuxo1/OpenCLAW-Autonomous-Multi-Agent-Scientific-Research-Platform"
$headers = @{
    "Authorization"        = "Bearer $GitHubToken"
    "Accept"               = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

Write-Host "=== OpenCLAW Platform Setup ===" -ForegroundColor Cyan

# 1. Create Private Gist for State
Write-Host "`n[1/3] Creating private Gist for agent state..." -ForegroundColor Yellow
$gistBody = @{
    description = "OpenCLAW Agent State (Private - Do Not Delete)"
    public      = $false
    files       = @{
        "agent_state.json" = @{
            content = '{"lastRun":"","totalPosts":0,"totalEmails":0,"totalCollaboratorsFound":0,"recentPosts":[],"recentEmails":[],"strategyMemos":[],"collaboratorCandidates":[]}'
        }
    }
} | ConvertTo-Json -Depth 5

$gistRes = Invoke-RestMethod -Uri "https://api.github.com/gists" -Method Post -Headers $headers -Body $gistBody -ContentType "application/json"
$gistId = $gistRes.id
Write-Host "  Gist created: $gistId" -ForegroundColor Green
Write-Host "  URL: $($gistRes.html_url)" -ForegroundColor Green

# 2. Set Repository Secrets
Write-Host "`n[2/3] Setting GitHub Repository Secrets..." -ForegroundColor Yellow

# Get repo public key for secret encryption
$keyRes = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/secrets/public-key" -Headers $headers
$keyId = $keyRes.key_id
$publicKey = $keyRes.key

# We need libsodium for encryption. Use Node.js instead.
Write-Host "  Public key retrieved. Key ID: $keyId" -ForegroundColor Green
Write-Host "  NOTE: GitHub Secrets require libsodium encryption." -ForegroundColor Yellow
Write-Host "  Please set secrets manually at:" -ForegroundColor Yellow
Write-Host "  https://github.com/$repo/settings/secrets/actions" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Secrets to set:" -ForegroundColor White
Write-Host "    MOLTBOOK_API_KEY = moltbook_sk_uMJvGTGJdBA5fU31_XtkOAfKcJ-721ds" -ForegroundColor Gray
Write-Host "    ZOHO_EMAIL = 1.5bit@zohomail.eu" -ForegroundColor Gray
Write-Host "    ZOHO_PASSWORD = rcPd3UHykckY6gE" -ForegroundColor Gray
Write-Host "    GIST_STATE_ID = $gistId" -ForegroundColor Gray

# 3. Trigger first workflow
Write-Host "`n[3/3] Triggering first Research Cycle..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/workflows/research-cycle.yml/dispatches" -Method Post -Headers $headers -Body (@{ ref = "main" } | ConvertTo-Json) -ContentType "application/json"
    Write-Host "  Workflow triggered!" -ForegroundColor Green
}
catch {
    Write-Host "  Could not trigger workflow. It will run on next cron schedule." -ForegroundColor Yellow
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "Your agent will run autonomously 24/7:" -ForegroundColor White
Write-Host "  Research Agent: Every 4 hours" -ForegroundColor Gray
Write-Host "  Social Agent:   Every 6 hours" -ForegroundColor Gray
Write-Host "  Strategy Agent: Every 12 hours" -ForegroundColor Gray
Write-Host "`nMonitor at: https://github.com/$repo/actions" -ForegroundColor Cyan
