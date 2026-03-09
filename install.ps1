# Install/Update Claude Code Skills
# PowerShell script for Windows

param(
    [switch]$Update = $false
)

$ErrorActionPreference = "Stop"

# Configuration
$CLAUDE_SKILLS_DIR = "$env:USERPROFILE\.claude\skills"
$CURRENT_DIR = $PSScriptRoot

# ANSI colors for better output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Error { Write-Host $args -ForegroundColor Red }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }

Write-Info "═══════════════════════════════════════════════════════════"
Write-Info "   Claude Code Skills Installer"
Write-Info "═══════════════════════════════════════════════════════════`n"

# Create Claude skills directory if it doesn't exist
if (-not (Test-Path $CLAUDE_SKILLS_DIR)) {
    Write-Info "Creating Claude skills directory at: $CLAUDE_SKILLS_DIR"
    New-Item -ItemType Directory -Path $CLAUDE_SKILLS_DIR -Force | Out-Null
}

# Find all skill directories (those with SKILL.md)
$skills = Get-ChildItem -Path $CURRENT_DIR -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "SKILL.md")
}

if ($skills.Count -eq 0) {
    Write-Error "No skills found in current directory!"
    Write-Info "Skills must contain a SKILL.md file"
    exit 1
}

Write-Info "Found $($skills.Count) skill(s):`n"

foreach ($skill in $skills) {
    $skillName = $skill.Name
    $sourcePath = $skill.FullName
    $targetPath = Join-Path $CLAUDE_SKILLS_DIR $skillName

    Write-Info "→ $skillName"

    # Check if skill already exists
    if (Test-Path $targetPath) {
        if ($Update) {
            Write-Warning "  Updating existing skill..."
            Remove-Item -Path $targetPath -Recurse -Force
        } else {
            Write-Warning "  Skill already exists. Use -Update flag to update."
            Write-Info "  Location: $targetPath`n"
            continue
        }
    } else {
        Write-Info "  Installing new skill..."
    }

    # Copy skill directory
    Copy-Item -Path $sourcePath -Destination $targetPath -Recurse -Force

    Write-Success "  ✓ Successfully installed to: $targetPath`n"
}

Write-Info "═══════════════════════════════════════════════════════════"
Write-Success "Installation complete!"
Write-Info "═══════════════════════════════════════════════════════════`n"

Write-Info "Installed skills location: $CLAUDE_SKILLS_DIR`n"

Write-Info "Usage:"
Write-Info "  • Install new skills:    .\install.ps1"
Write-Info "  • Update existing:       .\install.ps1 -Update"
Write-Info "  • List installed:        ls $CLAUDE_SKILLS_DIR`n"

Write-Success "Your skills are now available in Claude Code! 🚀"
