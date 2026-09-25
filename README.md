# Me as a skill

## Installation

**PowerShell (Windows):**
```powershell
.\install.ps1
```

**Bash (Git Bash/WSL):**
```bash
./install.sh
```

## Update

**PowerShell:**
```powershell
.\install.ps1 -Update
```

**Bash:**
```bash
./install.sh --update
```

Skills will be installed to `~/.claude/skills/`

## Game dev kit

Everything needed to design, build, test and ship 2D and 3D games for web
and desktop with Claude Code. It has four skills of its own, plus curated
community packs.

| Skill | What it does |
| --- | --- |
| `gamedev` | Runs the pipeline (GDD → assets → build → playtest → ship), picks the engine (Phaser, Three.js, Godot 4), and provides the scaffolds and shipping guide (Tauri, Godot export, itch.io) |
| `game-design-doc` | Interviews you in rounds until the design is settled, then writes `GDD.md` |
| `game-assets` | Searches and downloads CC0/CC-BY assets from Poly Haven, ambientCG, Kenney, game-icons.net, Poly Pizza and Freesound, keeps `CREDITS.md` up to date, and synthesizes retro sound effects offline |
| `game-playtest` | Plays the game with scripted input (Playwright for web, a harness for Godot), takes screenshots, asserts on game state, and catches errors |

Install the kit and the community packs:

```powershell
.\install-gamedev.ps1                      # everything
.\install-gamedev.ps1 -Profile web2d       # base + Phaser
.\install-gamedev.ps1 -Profile web3d,godot
```

```bash
./install-gamedev.sh                       # everything
./install-gamedev.sh -p web2d              # base + Phaser
./install-gamedev.sh -p web3d -p godot --dry-run
```

| Profile | Adds |
| --- | --- |
| base (always) | design, game-feel, genres, jam, and itch/Steam publishing skills from [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) |
| `web2d` | the official [Phaser skills](https://github.com/phaserjs/phaser) |
| `web3d` | [threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) + [threejs-skills](https://github.com/CloudAI-X/threejs-skills) |
| `godot` | the Godot 4 skills from gamedev-skills, plus [godot-mcp](https://github.com/Coding-Solo/godot-mcp) if Godot is installed |

[blender-mcp](https://github.com/ahujasid/blender-mcp) is registered when
Blender and `uvx` are found.

### Optional keys and generators

Everything works without them. Set these only when you want more sources:

| For | Set / run |
| --- | --- |
| Poly Pizza models (Quaternius and others) | `POLYPIZZA_API_KEY` from https://poly.pizza/settings/api |
| Freesound audio | `FREESOUND_API_KEY` from https://freesound.org/apiv2/apply |
| Meshy (3D generation, rigging) | `claude mcp add-json meshy '{"command":"npx","args":["-y","@meshy-ai/meshy-mcp-server"],"env":{"MESHY_API_KEY":"msy_..."}}'` |
| PixelLab (pixel-art characters, tilesets) | `claude mcp add --transport http pixellab https://api.pixellab.ai/mcp --header "Authorization: Bearer <key>"` |
| Retro Diffusion (pixel-art sprites) | `claude mcp add --transport http retro-diffusion https://mcp.retrodiffusion.ai/mcp --header "Authorization: Bearer rdpk-..."` |
| ElevenLabs (SFX, music, voice) | `claude mcp add --transport http elevenlabs https://api.elevenlabs.io/v1/mcp` |

Start with: *"I want to make a game"*.
