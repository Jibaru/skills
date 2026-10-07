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
| `game-playtest` | Plays the game with scripted input (Playwright for web, a harness for Godot), takes screenshots, asserts on game state, and catches errors. Godot side: one-process lock, suite summaries, `gd`/`until` steps |
| `godot-field-notes` | Fixes for Godot 4 from shipping a real game: shader colour spaces, render-to-texture, retargeting, GDScript inference errors, exporting from Windows (including a free ad-hoc macOS build), display settings, Windows pitfalls |
| `game-trailer` | Spoiler-free trailers: shot lists, Godot Movie Maker recording, contact-sheet review, encoding |
| `game-landing-page` | Minimal trailer-first landing page with absolute OG meta, stable download links, a checker script, and a GitHub Pages custom domain |
| `elevenlabs-game-audio` | Voices, Voice Design and music with ElevenLabs. Keys stay out of commands, and output is verified by numbers because the agent can't listen |

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

## Thesis kit (UNTELS · LaTeX · APA 7)

Skills to write a bachelor's thesis plan (*plan de tesis*) and thesis for Systems
Engineering at UNTELS (Peru) in LaTeX, following the official format, the jury
rubric and APA 7 in Spanish. Each phase interviews you first (grill-me rounds),
drafts, and self-reviews against the rubric before showing anything.

| Skill | What it does |
| --- | --- |
| `tesis` | Orchestrator: creates the thesis project, tracks `ESTADO.md`, picks the next phase, checks vertical coherence. Holds the shared references (format, structure, course rules, APA, jury rubric, writing voice) and the LaTeX template |
| `tesis-literatura` | Search strings, OpenAlex / Semantic Scholar / Crossref / arXiv / Peruvian thesis repositories, open-access download, parallel per-paper analysis, review matrix |
| `tesis-referencias` | Verified `referencias.bib` from DOI/ISBN, citation ↔ reference check |
| `tesis-problema` | Chapter I: problem description, questions, objectives, scope, justification, title |
| `tesis-marco` | Chapter II: prior studies, theoretical bases, key terms |
| `tesis-variables` | Chapter III: operationalization, hypotheses, consistency matrix |
| `tesis-metodologia` | Chapter IV: research design, population and sample, instruments, expert validation, schedule, budget |
| `tesis-resultados` | Statistics (normality, paired t / Wilcoxon), results, discussion, conclusions |
| `tesis-figuras` | Mermaid / PlantUML / matplotlib figures and Playwright screenshots |
| `tesis-jurado` | Jury-style review with the official rubric and an originality check against the downloaded PDFs |

The thesis itself lives in its own (private) repository; the kit creates it with
`tesis/scripts/nuevo-proyecto.sh <dir>`. `tesis.yaml` is the single source of
truth for problems, objectives, hypotheses, variables and indicators, and the
consistency and operationalization tables are generated from it.

Install:

```powershell
.\install-tesis.ps1            # skills + grill-me + Python deps + Docker images
.\install-tesis.ps1 -NoDocker
```

```bash
./install-tesis.sh
./install-tesis.sh --no-docker --dry-run
```

Requires Python 3.10+, Node.js 18+ (grill-me, figures) and Docker (LaTeX build
with `texlive/texlive`, Word export with `pandoc/latex`). Without Docker the
project also compiles in Overleaf.

Optional API keys, read from the environment or from the thesis project's
`.env` (git-ignored): `TESIS_MAILTO` (polite pool for OpenAlex, Crossref and
Unpaywall), `S2_API_KEY`, `CORE_API_KEY`, `IEEE_API_KEY`, `SCOPUS_API_KEY`
(+ `SCOPUS_INSTTOKEN` off campus). `tesis-literatura/scripts/claves.py` shows
which are missing and where to get them, creates the `.env` (`--env`) and tests
each key (`--probar`); searches enable keyed sources automatically and report
what was skipped.

Start with: *"quiero empezar mi tesis"*.
