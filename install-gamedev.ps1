# Install the game development kit for Claude Code:
#   - this repo's game skills (gamedev, game-design-doc, game-assets, game-playtest)
#   - curated third-party skill packs, filtered by profile
#   - free MCP servers (Godot, Blender) when those apps are installed
#
# PowerShell script for Windows

param(
    [ValidateSet("web2d", "web3d", "godot", "all")]
    [Alias("Profile")]
    [string[]]$Profiles = @("all"),
    [switch]$NoMcp = $false,
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

$CLAUDE_SKILLS_DIR = "$env:USERPROFILE\.claude\skills"
$CURRENT_DIR = $PSScriptRoot

function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }

$OwnSkills = @("gamedev", "game-design-doc", "game-assets", "game-playtest", "game-trailer", "game-landing-page", "godot-field-notes", "elevenlabs-game-audio")

# gamedev-skills/awesome-gamedev-agent-skills: engine-agnostic design, genres, jams, publishing.
# Left out on purpose: router and create-game-assets (overlap gamedev/game-assets),
# phaser-core/pixijs/threejs-* (the official packs below are deeper), Unity/Unreal/Roblox/Bevy.
$BasePack = "gamedev-skills/awesome-gamedev-agent-skills"
$BaseSkills = @("game-feel", "level-design", "audio-design", "camera-systems", "game-ui-ux", "input-systems",
    "save-systems", "procedural-gen", "physics-tuning", "performance-optimization", "game-ai", "shader-programming",
    "game-jam", "prototype-fast", "itch-publish", "steam-publish",
    "platformer", "roguelike", "rpg", "puzzle", "fps-shooter", "tower-defense", "card-game", "survival-crafting", "visual-novel")

$Web2dPack = "phaserjs/phaser"
$Web2dSkills = @("actions-and-utilities", "animations", "audio-and-sound", "cameras", "curves-and-paths", "data-manager",
    "events-system", "filters-and-postfx", "game-object-components", "game-setup-and-config", "geometry-and-math",
    "graphics-and-shapes", "groups-and-containers", "input-keyboard-mouse-touch", "loading-assets", "particles",
    "physics-arcade", "physics-matter", "render-textures", "scale-and-responsive", "scenes", "sprites-and-images",
    "text-and-bitmaptext", "tilemaps", "time-and-timers", "tweens", "v4-new-features")

$Web3dPacks = @("majidmanzarpour/threejs-game-skills", "CloudAI-X/threejs-skills")

$GodotPack = "gamedev-skills/awesome-gamedev-agent-skills"
$GodotSkills = @("godot-2d-movement", "godot-3d-essentials", "godot-animation", "godot-audio", "godot-export",
    "godot-gdscript", "godot-multiplayer", "godot-nodes-scenes", "godot-physics", "godot-resources", "godot-shaders",
    "godot-signals-groups", "godot-tilemap", "godot-ui-control")

function Test-Profile($name) { return ($Profiles -contains $name) -or ($Profiles -contains "all") }

function Invoke-Step([string]$exe, [string[]]$arguments) {
    Write-Info "  > $exe $($arguments -join ' ')"
    if (-not $DryRun) {
        & $exe @arguments
        if ($LASTEXITCODE -ne 0) { Write-Warning "  exited with $LASTEXITCODE" }
    }
}

function Add-Pack([string]$pack, [string[]]$skills) {
    $arguments = @("-y", "skills@latest", "add", $pack)
    foreach ($s in $skills) { $arguments += @("--skill", $s) }
    $arguments += @("-g", "-a", "claude-code", "-y")
    Invoke-Step "npx" $arguments
}

Write-Info "==========================================================="
Write-Info "   Game Dev Kit Installer - profiles: $($Profiles -join ', ')"
Write-Info "==========================================================="
Write-Host ""

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "npx not found: install Node.js 18+ first" -ForegroundColor Red
    exit 1
}

# 1. This repo's game skills (always refreshed so the kit stays consistent)
Write-Info "-> Kit skills"
if (-not $DryRun -and -not (Test-Path $CLAUDE_SKILLS_DIR)) {
    New-Item -ItemType Directory -Path $CLAUDE_SKILLS_DIR -Force | Out-Null
}
foreach ($s in $OwnSkills) {
    $target = Join-Path $CLAUDE_SKILLS_DIR $s
    Write-Info "  > copy $s -> $target"
    if (-not $DryRun) {
        if (Test-Path $target) { Remove-Item -Path $target -Recurse -Force }
        Copy-Item -Path (Join-Path $CURRENT_DIR $s) -Destination $target -Recurse -Force
    }
}
Write-Host ""

# 2. Third-party packs
Write-Info "-> Base: design, genres, jams, publishing"
Add-Pack $BasePack $BaseSkills
Write-Host ""

if (Test-Profile "web2d") {
    Write-Info "-> web2d: official Phaser skills"
    Add-Pack $Web2dPack $Web2dSkills
    Write-Host ""
}
if (Test-Profile "web3d") {
    Write-Info "-> web3d: Three.js game + API skills"
    foreach ($pack in $Web3dPacks) { Add-Pack $pack @("*") }
    Write-Host ""
}
if (Test-Profile "godot") {
    Write-Info "-> godot: Godot 4 skills"
    Add-Pack $GodotPack $GodotSkills
    Write-Host ""
}

# 3. Free MCP servers, only when the app they drive is present.
# add-json with "cmd /c npx": `claude mcp add ... -- npx -y` misparses -y on Windows.
if (-not $NoMcp) {
    if (Get-Command claude -ErrorAction SilentlyContinue) {
        Write-Info "-> MCP servers"
        if (Test-Profile "godot") {
            $godot = $env:GODOT
            if (-not $godot) {
                $cmd = Get-Command godot, godot4 -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($cmd) { $godot = $cmd.Source }
            }
            if ($godot) {
                $json = @{ command = "cmd"; args = @("/c", "npx", "-y", "@coding-solo/godot-mcp"); env = @{ GODOT_PATH = $godot } } | ConvertTo-Json -Compress
                Invoke-Step "claude" @("mcp", "add-json", "godot", $json, "-s", "user")
            } else {
                Write-Warning "  Godot not found (set `$env:GODOT or put godot on PATH) - skipping godot-mcp"
            }
        }
        $blender = Get-Command blender -ErrorAction SilentlyContinue
        if (-not $blender) {
            $blender = Get-ChildItem "C:\Program Files\Blender Foundation\*\blender.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        if ($blender -and (Get-Command uvx -ErrorAction SilentlyContinue)) {
            $json = @{ command = "cmd"; args = @("/c", "uvx", "mcp-for-blender") } | ConvertTo-Json -Compress
            Invoke-Step "claude" @("mcp", "add-json", "blender", $json, "-s", "user")
            Write-Warning "  Blender also needs the addon: https://github.com/ahujasid/blender-mcp#installation"
        } else {
            Write-Warning "  Blender or uvx not found - skipping blender-mcp"
        }
        Write-Host ""
    } else {
        Write-Warning "claude CLI not on PATH - skipping MCP servers"
        Write-Host ""
    }
}

Write-Info "==========================================================="
Write-Success "Game dev kit installed."
Write-Info "==========================================================="
Write-Host ""
Write-Host "Optional paid generators (asset generation) - see README.md -> Game dev kit."
Write-Host "Start with: `"I want to make a game`" in Claude Code."
