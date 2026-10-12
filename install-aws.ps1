# Install the AWS review kit for Claude Code:
#   - aws-review (orchestrator) and aws-refresh
#   - the expert reviewers aws-compute, aws-data, aws-storage, aws-messaging,
#     aws-networking, aws-iac, aws-security, aws-cost, aws-observability
#
# PowerShell script for Windows

param(
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

$CLAUDE_SKILLS_DIR = "$env:USERPROFILE\.claude\skills"
$CURRENT_DIR = $PSScriptRoot

function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }

$OwnSkills = @("aws-review", "aws-refresh", "aws-compute", "aws-data", "aws-storage", "aws-messaging",
    "aws-networking", "aws-iac", "aws-security", "aws-cost", "aws-observability")

Write-Info "==========================================================="
Write-Info "   AWS Review Kit Installer"
Write-Info "===========================================================`n"

# Kit skills (always refreshed so the kit stays consistent; evals stay in the repo)
Write-Info "-> Kit skills"
if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $CLAUDE_SKILLS_DIR | Out-Null }
foreach ($s in $OwnSkills) {
    $dest = Join-Path $CLAUDE_SKILLS_DIR $s
    Write-Info "  > copy $s"
    if (-not $DryRun) {
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Copy-Item -Recurse (Join-Path $CURRENT_DIR $s) $dest
    }
}
$evals = Join-Path $CLAUDE_SKILLS_DIR "aws-review\evals"
if (-not $DryRun -and (Test-Path $evals)) { Remove-Item -Recurse -Force $evals }

# aws-refresh edits the repo, not the installed copies
Write-Info "  > write aws-refresh\SOURCE_REPO"
if (-not $DryRun) { Set-Content -Path (Join-Path $CLAUDE_SKILLS_DIR "aws-refresh\SOURCE_REPO") -Value $CURRENT_DIR }
Write-Host ""

Write-Info "==========================================================="
Write-Success "AWS review kit installed."
Write-Info "===========================================================`n"
Write-Host "Optional: connect the AWS Knowledge MCP server so reviewers can confirm prices and limits live:"
Write-Host "  claude mcp add --transport http aws-knowledge https://knowledge-mcp.global.api.aws"
Write-Host "Start with: `"review my AWS code`" in Claude Code.`n"
