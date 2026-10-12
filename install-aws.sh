#!/bin/bash
# Install the AWS review kit for Claude Code:
#   - aws-review (orchestrator) and aws-refresh
#   - the expert reviewers aws-compute, aws-data, aws-storage, aws-messaging,
#     aws-networking, aws-iac, aws-security, aws-cost, aws-observability
#
# Bash script for Git Bash/WSL/Linux/Mac

set -e

CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

OWN_SKILLS=(aws-review aws-refresh aws-compute aws-data aws-storage aws-messaging
  aws-networking aws-iac aws-security aws-cost aws-observability)

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --dry-run     print what would run, change nothing"
    echo "  -h, --help    show this help"
}

while [[ $# -gt 0 ]]; do
    case $1 in
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
echo -e "${CYAN}   AWS Review Kit Installer${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"

# Kit skills (always refreshed so the kit stays consistent; evals stay in the repo)
echo -e "${CYAN}→ Kit skills${NC}"
[ "$DRY_RUN" = false ] && mkdir -p "$CLAUDE_SKILLS_DIR"
for s in "${OWN_SKILLS[@]}"; do
    run rm -rf "$CLAUDE_SKILLS_DIR/$s"
    run cp -r "$CURRENT_DIR/$s" "$CLAUDE_SKILLS_DIR/$s"
done
run rm -rf "$CLAUDE_SKILLS_DIR/aws-review/evals"

# aws-refresh edits the repo, not the installed copies
echo -e "${CYAN}  \$ echo $CURRENT_DIR > $CLAUDE_SKILLS_DIR/aws-refresh/SOURCE_REPO${NC}"
[ "$DRY_RUN" = false ] && echo "$CURRENT_DIR" > "$CLAUDE_SKILLS_DIR/aws-refresh/SOURCE_REPO"
echo ""

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}AWS review kit installed.${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"
echo -e "Optional: connect the AWS Knowledge MCP server so reviewers can confirm prices and limits live:"
echo -e "  claude mcp add --transport http aws-knowledge https://knowledge-mcp.global.api.aws"
echo -e "Start with: ${GREEN}\"review my AWS code\"${NC} in Claude Code.\n"
