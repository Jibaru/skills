#!/bin/bash
# Install/Update Claude Code Skills
# Bash script for Git Bash/WSL/Linux/Mac

set -e

# Configuration
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE_MODE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--update)
            UPDATE_MODE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -u, --update    Update existing skills"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Claude Code Skills Installer${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"

# Create Claude skills directory if it doesn't exist
if [ ! -d "$CLAUDE_SKILLS_DIR" ]; then
    echo -e "${CYAN}Creating Claude skills directory at: $CLAUDE_SKILLS_DIR${NC}"
    mkdir -p "$CLAUDE_SKILLS_DIR"
fi

# Find all skill directories (those with SKILL.md)
skill_count=0
skills=()

for dir in "$CURRENT_DIR"/*/ ; do
    if [ -f "$dir/SKILL.md" ]; then
        skills+=("$dir")
        ((skill_count++))
    fi
done

if [ $skill_count -eq 0 ]; then
    echo -e "${RED}No skills found in current directory!${NC}"
    echo -e "${CYAN}Skills must contain a SKILL.md file${NC}"
    exit 1
fi

echo -e "${CYAN}Found $skill_count skill(s):${NC}\n"

for skill_path in "${skills[@]}"; do
    skill_name=$(basename "$skill_path")
    target_path="$CLAUDE_SKILLS_DIR/$skill_name"

    echo -e "${CYAN}→ $skill_name${NC}"

    # Check if skill already exists
    if [ -d "$target_path" ]; then
        if [ "$UPDATE_MODE" = true ]; then
            echo -e "${YELLOW}  Updating existing skill...${NC}"
            rm -rf "$target_path"
        else
            echo -e "${YELLOW}  Skill already exists. Use -u or --update flag to update.${NC}"
            echo -e "${CYAN}  Location: $target_path${NC}\n"
            continue
        fi
    else
        echo -e "${CYAN}  Installing new skill...${NC}"
    fi

    # Copy skill directory
    cp -r "$skill_path" "$target_path"

    echo -e "${GREEN}  ✓ Successfully installed to: $target_path${NC}\n"
done

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Installation complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"

echo -e "${CYAN}Installed skills location: $CLAUDE_SKILLS_DIR${NC}\n"

echo -e "${CYAN}Usage:${NC}"
echo -e "  • Install new skills:    ./install.sh"
echo -e "  • Update existing:       ./install.sh --update"
echo -e "  • List installed:        ls $CLAUDE_SKILLS_DIR\n"

echo -e "${GREEN}Your skills are now available in Claude Code! 🚀${NC}"
