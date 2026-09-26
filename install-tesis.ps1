# Install the thesis kit for Claude Code:
#   - this repo's thesis skills (tesis, tesis-*)
#   - grill-me / grilling from mattpocock/skills (interview rounds used by every phase)
#   - Python dependencies of the scripts
#   - Docker images for LaTeX (texlive/texlive) and Word export (pandoc/latex)
#
# PowerShell script for Windows

param(
    [switch]$NoDocker = $false,
    [switch]$NoPip = $false,
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

$CLAUDE_SKILLS_DIR = "$env:USERPROFILE\.claude\skills"
$CURRENT_DIR = $PSScriptRoot

function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }

$OwnSkills = @("tesis", "tesis-literatura", "tesis-referencias", "tesis-problema", "tesis-marco",
    "tesis-variables", "tesis-metodologia", "tesis-resultados", "tesis-figuras", "tesis-jurado")
$PipPackages = @("pyyaml", "pymupdf", "pypdf", "openpyxl", "python-docx", "pandas", "scipy", "statsmodels", "matplotlib")
$DockerImages = @("texlive/texlive:latest", "pandoc/latex:latest", "plantuml/plantuml:latest")

function Invoke-Step([string]$exe, [string[]]$arguments) {
    Write-Info "  > $exe $($arguments -join ' ')"
    if (-not $DryRun) {
        & $exe @arguments
        if ($LASTEXITCODE -ne 0) { Write-Warning "  exited with $LASTEXITCODE" }
    }
}

Write-Info "==========================================================="
Write-Info "   Thesis Kit Installer (UNTELS - LaTeX - APA 7)"
Write-Info "===========================================================`n"

# 1. This repo's thesis skills (always refreshed so the kit stays consistent)
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
Write-Host ""

# 2. Interview skill used at the start of every phase
Write-Info "-> grill-me / grilling"
if (Get-Command npx -ErrorAction SilentlyContinue) {
    Invoke-Step "npx" @("-y", "skills@latest", "add", "mattpocock/skills", "--skill", "grill-me", "--skill", "grilling", "-g", "-a", "claude-code", "-y")
} else {
    Write-Warning "  npx not found - install Node.js 18+ and rerun, or add grill-me manually"
}
Write-Host ""

# 3. Python dependencies
if (-not $NoPip) {
    Write-Info "-> Python packages"
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($py) {
        Invoke-Step "python" (@("-m", "pip", "install", "--quiet", "--upgrade") + $PipPackages)
    } else {
        Write-Warning "  Python not found - install Python 3.10+ and rerun"
    }
    Write-Host ""
}

# 4. Docker images (LaTeX build and Word export)
if (-not $NoDocker) {
    Write-Info "-> Docker images"
    $dockerOk = $false
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        docker info *> $null
        $dockerOk = ($LASTEXITCODE -eq 0)
    }
    if ($dockerOk) {
        foreach ($img in $DockerImages) { Invoke-Step "docker" @("pull", $img) }
    } else {
        Write-Warning "  Docker not running - start Docker Desktop and rerun, or compile in Overleaf"
    }
    Write-Host ""
}

Write-Info "==========================================================="
Write-Success "Thesis kit installed."
Write-Info "===========================================================`n"
Write-Host "Optional: set TESIS_MAILTO=<your email> for the OpenAlex/Crossref/Unpaywall polite pool."
Write-Host "Start with: `"quiero empezar mi tesis`" in Claude Code.`n"
