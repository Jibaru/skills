#!/bin/bash
# Install the thesis kit for Claude Code:
#   - this repo's thesis skills (tesis, tesis-*)
#   - grill-me / grilling from mattpocock/skills (interview rounds used by every phase)
#   - Python dependencies of the scripts
#   - Docker images for LaTeX (texlive/texlive) and Word export (pandoc/latex)
#
# Bash script for Git Bash/WSL/Linux/Mac

set -e

CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false
SKIP_DOCKER=false
SKIP_PIP=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

OWN_SKILLS=(tesis tesis-literatura tesis-referencias tesis-problema tesis-marco
  tesis-variables tesis-metodologia tesis-resultados tesis-figuras tesis-jurado)
PIP_PACKAGES=(pyyaml pymupdf pypdf openpyxl python-docx pandas scipy statsmodels matplotlib)
DOCKER_IMAGES=(texlive/texlive:latest pandoc/latex:latest plantuml/plantuml:latest)

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --no-docker   don't pull the LaTeX/pandoc images (~5 GB)"
    echo "  --no-pip      don't install Python packages"
    echo "  --dry-run     print what would run, change nothing"
    echo "  -h, --help    show this help"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-docker) SKIP_DOCKER=true; shift ;;
        --no-pip) SKIP_PIP=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; usage; exit 1 ;;
    esac
done

run() {
    echo -e "${CYAN}  \$ $*${NC}"
    if [ "$DRY_RUN" = false ]; then "$@"; fi
}

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Thesis Kit Installer (UNTELS · LaTeX · APA 7)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"

# 1. This repo's thesis skills (always refreshed so the kit stays consistent)
echo -e "${CYAN}→ Kit skills${NC}"
[ "$DRY_RUN" = false ] && mkdir -p "$CLAUDE_SKILLS_DIR"
for s in "${OWN_SKILLS[@]}"; do
    run rm -rf "$CLAUDE_SKILLS_DIR/$s"
    run cp -r "$CURRENT_DIR/$s" "$CLAUDE_SKILLS_DIR/$s"
done
echo ""

# 2. Interview skill used at the start of every phase
echo -e "${CYAN}→ grill-me / grilling${NC}"
if command -v npx >/dev/null; then
    run npx -y skills@latest add mattpocock/skills --skill grill-me --skill grilling -g -a claude-code -y
else
    echo -e "${YELLOW}  npx not found — install Node.js 18+ and rerun, or add grill-me manually${NC}"
fi
echo ""

# 3. Python dependencies
if [ "$SKIP_PIP" = false ]; then
    echo -e "${CYAN}→ Python packages${NC}"
    PY="$(command -v python3 || command -v python || true)"
    if [ -n "$PY" ]; then
        run "$PY" -m pip install --quiet --upgrade "${PIP_PACKAGES[@]}"
    else
        echo -e "${YELLOW}  Python not found — install Python 3.10+ and rerun${NC}"
    fi
    echo ""
fi

# 4. Docker images (LaTeX build and Word export)
if [ "$SKIP_DOCKER" = false ]; then
    echo -e "${CYAN}→ Docker images${NC}"
    if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
        for img in "${DOCKER_IMAGES[@]}"; do run docker pull "$img"; done
    else
        echo -e "${YELLOW}  Docker not running — start Docker Desktop and rerun, or compile in Overleaf${NC}"
    fi
    echo ""
fi

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Thesis kit installed.${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"
echo -e "Optional: TESIS_MAILTO=<your email> for the OpenAlex/Crossref/Unpaywall polite pool."
echo -e "Start with: ${GREEN}\"quiero empezar mi tesis\"${NC} in Claude Code.\n"
