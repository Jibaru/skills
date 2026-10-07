#!/bin/bash
# Install the game development kit for Claude Code:
#   - this repo's game skills (gamedev, game-design-doc, game-assets, game-playtest)
#   - curated third-party skill packs, filtered by profile
#   - free MCP servers (Godot, Blender) when those apps are installed
#
# Bash script for Git Bash/WSL/Linux/Mac

set -e

CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILES=()
DRY_RUN=false
SKIP_MCP=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

OWN_SKILLS=(gamedev game-design-doc game-assets game-playtest game-trailer game-landing-page godot-field-notes elevenlabs-game-audio)

# gamedev-skills/awesome-gamedev-agent-skills: engine-agnostic design, genres, jams, publishing.
# Left out on purpose: router and create-game-assets (overlap gamedev/game-assets),
# phaser-core/pixijs/threejs-* (the official packs below are deeper), Unity/Unreal/Roblox/Bevy.
BASE_PACK="gamedev-skills/awesome-gamedev-agent-skills"
BASE_SKILLS=(game-feel level-design audio-design camera-systems game-ui-ux input-systems
  save-systems procedural-gen physics-tuning performance-optimization game-ai shader-programming
  game-jam prototype-fast itch-publish steam-publish
  platformer roguelike rpg puzzle fps-shooter tower-defense card-game survival-crafting visual-novel)

WEB2D_PACK="phaserjs/phaser"
WEB2D_SKILLS=(actions-and-utilities animations audio-and-sound cameras curves-and-paths data-manager
  events-system filters-and-postfx game-object-components game-setup-and-config geometry-and-math
  graphics-and-shapes groups-and-containers input-keyboard-mouse-touch loading-assets particles
  physics-arcade physics-matter render-textures scale-and-responsive scenes sprites-and-images
  text-and-bitmaptext tilemaps time-and-timers tweens v4-new-features)

WEB3D_PACKS=("majidmanzarpour/threejs-game-skills" "CloudAI-X/threejs-skills")

GODOT_PACK="gamedev-skills/awesome-gamedev-agent-skills"
GODOT_SKILLS=(godot-2d-movement godot-3d-essentials godot-animation godot-audio godot-export
  godot-gdscript godot-multiplayer godot-nodes-scenes godot-physics godot-resources godot-shaders
  godot-signals-groups godot-tilemap godot-ui-control)

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -p, --profile <name>   web2d | web3d | godot | all  (repeatable, default all)"
    echo "                         the base set (design, genres, publishing) is always installed"
    echo "  --no-mcp               don't register MCP servers"
    echo "  --dry-run              print what would run, change nothing"
    echo "  -h, --help             show this help"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--profile) PROFILES+=("$2"); shift 2 ;;
        --no-mcp) SKIP_MCP=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; usage; exit 1 ;;
    esac
done
[ ${#PROFILES[@]} -eq 0 ] && PROFILES=(all)

has_profile() {
    for p in "${PROFILES[@]}"; do
        [ "$p" = "$1" ] || [ "$p" = "all" ] && return 0
    done
    return 1
}

for p in "${PROFILES[@]}"; do
    case $p in web2d|web3d|godot|all) ;; *) echo -e "${RED}Unknown profile: $p${NC}"; exit 1 ;; esac
done

run() {
    echo -e "${CYAN}  \$ $*${NC}"
    if [ "$DRY_RUN" = false ]; then "$@"; fi
}

add_pack() {
    local pack="$1"; shift
    local args=()
    for s in "$@"; do args+=(--skill "$s"); done
    run npx -y skills@latest add "$pack" "${args[@]}" -g -a claude-code -y
}

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Game Dev Kit Installer — profiles: ${PROFILES[*]}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"

command -v npx >/dev/null || { echo -e "${RED}npx not found: install Node.js 18+ first${NC}"; exit 1; }

# 1. This repo's game skills (always refreshed so the kit stays consistent)
echo -e "${CYAN}→ Kit skills${NC}"
[ "$DRY_RUN" = false ] && mkdir -p "$CLAUDE_SKILLS_DIR"
for s in "${OWN_SKILLS[@]}"; do
    run rm -rf "$CLAUDE_SKILLS_DIR/$s"
    run cp -r "$CURRENT_DIR/$s" "$CLAUDE_SKILLS_DIR/$s"
done
echo ""

# 2. Third-party packs
echo -e "${CYAN}→ Base: design, genres, jams, publishing${NC}"
add_pack "$BASE_PACK" "${BASE_SKILLS[@]}"
echo ""

if has_profile web2d; then
    echo -e "${CYAN}→ web2d: official Phaser skills${NC}"
    add_pack "$WEB2D_PACK" "${WEB2D_SKILLS[@]}"
    echo ""
fi

if has_profile web3d; then
    echo -e "${CYAN}→ web3d: Three.js game + API skills${NC}"
    for pack in "${WEB3D_PACKS[@]}"; do add_pack "$pack" '*'; done
    echo ""
fi

if has_profile godot; then
    echo -e "${CYAN}→ godot: Godot 4 skills${NC}"
    add_pack "$GODOT_PACK" "${GODOT_SKILLS[@]}"
    echo ""
fi

# 3. Free MCP servers, only when the app they drive is present
if [ "$SKIP_MCP" = false ] && command -v claude >/dev/null; then
    echo -e "${CYAN}→ MCP servers${NC}"
    if has_profile godot; then
        GODOT_BIN="${GODOT:-$(command -v godot || command -v godot4 || true)}"
        if [ -n "$GODOT_BIN" ]; then
            run claude mcp add-json godot "{\"command\":\"npx\",\"args\":[\"-y\",\"@coding-solo/godot-mcp\"],\"env\":{\"GODOT_PATH\":\"$GODOT_BIN\"}}" -s user || true
        else
            echo -e "${YELLOW}  Godot not found (set GODOT or put godot on PATH) — skipping godot-mcp${NC}"
        fi
    fi
    if command -v blender >/dev/null && command -v uvx >/dev/null; then
        run claude mcp add-json blender '{"command":"uvx","args":["mcp-for-blender"]}' -s user || true
        echo -e "${YELLOW}  Blender also needs the addon: https://github.com/ahujasid/blender-mcp#installation${NC}"
    else
        echo -e "${YELLOW}  Blender or uvx not found — skipping blender-mcp${NC}"
    fi
    echo ""
elif [ "$SKIP_MCP" = false ]; then
    echo -e "${YELLOW}claude CLI not on PATH — skipping MCP servers${NC}\n"
fi

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Game dev kit installed.${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"
echo -e "Optional paid generators (asset generation) — see README.md → Game dev kit."
echo -e "Start with: ${GREEN}\"I want to make a game\"${NC} in Claude Code.\n"
