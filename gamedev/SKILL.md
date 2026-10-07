---
name: gamedev
description: End-to-end game development pipeline for 2D and 3D games on web and desktop — pick the engine (Phaser, Three.js, Godot 4), scaffold the project, and drive design, assets, implementation, playtesting and shipping by handing off to the right skill at each stage. Use when the user says "make a game", "build a game", "game jam", "prototype a game", "start a game project", "what engine should I use", "turn my web game into a desktop app", "publish my game", or asks for help with any stage of making a game and no more specific skill fits.
metadata:
  author: Jibaru
  version: 1.0.0
---

# gamedev

This skill runs the pipeline and delegates the work. Every stage has a skill that
does it better than improvising. Your job here is to keep the stages in order,
keep the project's shared files current, and not skip verification.

```
GDD  →  assets  →  scaffold  →  build milestone  →  playtest  →  (repeat per milestone)  →  ship
```

## Shared project files

Every `game-*` skill reads and writes these, so keep them current:

| Path | Owner | Purpose |
| --- | --- | --- |
| `GDD.md` | `game-design-doc` | design, scope, asset table, milestones |
| `CREDITS.md` + `<assets>/credits.json` | `game-assets` | licences and provenance |
| `assets/` (or `public/assets/` for Vite) | `game-assets` | models, textures, sprites, audio, fonts |
| `playtest/scripts/*.json` | `game-playtest` | input scripts |
| `playtest/screenshots/` | `game-playtest` | evidence; gitignore it |

## Stage 1: Design

No `GDD.md`? Use **`game-design-doc`** before any code. That applies even for a
jam: a 15-minute interview saves hours of building the wrong thing. If the user
refuses, write a 10-line GDD yourself (pitch, engine, core loop, controls,
fail/win, M1) and confirm it in one message.

Horror, mystery or other narrative games: `game-design-doc` reads its
`references/horror-design.md`. In those genres, ambiguity is the product, and that
shapes the trailer and the store page as much as the game.

## Stage 2: Pick the engine

The GDD records the choice. If it's still open, recommend from this table:

| The game is… | Engine | Why |
| --- | --- | --- |
| 2D, web-first, jam or small | **Phaser 4** + Vite | complete 2D framework, official agent skills, instant browser sharing |
| 3D, web-first | **Three.js** + Vite | biggest ecosystem; glTF and PBR assets drop straight in |
| 3D or 2D, desktop-first, bigger scope, needs editor tooling or consoles later | **Godot 4** | text scenes, runs headless, exports to desktop **and** web |
| Already using React | React Three Fiber | only if the UI is React-heavy |
| Go / Ebitengine project | Ebitengine | test it with `run-ebitengine-app-headless` |

Web games reach desktop through Tauri (Stage 6), so "it must run on
desktop" alone is not a reason to leave Phaser or Three.js.

## Stage 3: Assets and scaffold

1. Use **`game-assets`** to fetch the GDD's asset table and fill in the Source
   column. Missing art becomes a code-drawn placeholder, never a blocker.
   Voices and music come from **`elevenlabs-game-audio`** when the free sources
   don't cover them.
2. Scaffold from `references/scaffolds.md`. Every scaffold exposes a
   `window.__TEST__` test hook, or root-node variables in Godot, so
   `game-playtest` can assert on state from the first commit. The Godot scaffold
   also has direct-start entry scenes and debug hooks. Add them from day one,
   because hand-aimed test cameras were the most common cause of false FAILs.
3. Add `playtest/screenshots/` and `playtest/summary.txt` to `.gitignore`.
4. On Windows, read `godot-field-notes/references/windows-agent.md` once before the
   first build. Python store stubs, `/tmp` paths, heredocs and zip handling each cost
   hours in a real project.

## Stage 4: Build, one milestone at a time

Build **only** the current GDD milestone. For engine-specific depth, use the
installed engine skills. Check what's available and prefer these:

| Topic | Skills (from `install-gamedev`) |
| --- | --- |
| Phaser API | `scenes`, `sprites-and-images`, `physics-arcade`, `tilemaps`, `input-keyboard-mouse-touch`, `loading-assets`, `particles`, `tweens`, `cameras`, `v4-new-features` (official `phaserjs/phaser` pack) |
| Three.js game structure | `threejs-game-director`, `threejs-gameplay-systems`, `threejs-aaa-graphics-builder`, `threejs-game-ui-designer`, `threejs-debug-profiler` |
| Three.js API | `threejs-fundamentals`, `threejs-loaders`, `threejs-materials`, `threejs-lighting`, `threejs-animation`, `threejs-shaders`, `threejs-postprocessing` |
| Godot | `godot-gdscript`, `godot-nodes-scenes`, `godot-2d-movement`, `godot-3d-essentials`, `godot-physics`, `godot-tilemap`, `godot-ui-control`, `godot-signals-groups`, `godot-animation`, `godot-shaders`, `godot-audio`, `godot-resources`, `godot-multiplayer`, `godot-export` |
| Godot, from shipping a real game | **`godot-field-notes`** (ours): `source_color` linear-space thresholds, render-to-texture tricks, retargeting, GDScript inference errors, export from Windows (incl. macOS ad-hoc), display settings. It corrects a few statements in the pack above. **Writing any `.gdshader` → read its shaders reference first.** |
| Any engine | `game-feel`, `level-design`, `camera-systems`, `input-systems`, `game-ui-ux`, `audio-design`, `save-systems`, `procedural-gen`, `physics-tuning`, `performance-optimization`, `game-ai` |
| Genre conventions | `platformer`, `roguelike`, `rpg`, `puzzle`, `fps-shooter`, `tower-defense`, `card-game`, `survival-crafting`, `visual-novel` |
| Jams | `game-jam`, `prototype-fast` |

Rules while building:

- **The core verb first**, on a blank screen, feeling good, before any
  content. Tune numbers from the GDD, and update the GDD when they change.
- Constants for tuning live in one place (a `config.js` / `tuning.gd`),
  not scattered through the code as magic numbers.
- Load assets by the GDD's keys. A placeholder and the real asset use the same key.
- No feature that isn't in the current milestone. Put new ideas in the GDD's
  "Out of scope" section, and tell the user.

## Stage 5: Playtest every milestone

Use **`game-playtest`**: write or extend a playtest script for the milestone, run
it, **open the screenshots and look at them**, and fix what's wrong. A
milestone is done when the run passes and the screenshots match what the GDD
milestone describes. Tell the user which milestone is done, and give the
screenshot paths.

- **Keep a suite.** Put the one-line suite command in the project README
  ("Playtests" section). Run it sequentially in the background before any commit
  or release that touches shared systems: intro, save, input, UI theme. Adding an
  intro once broke a story test that pointed at the main scene.
- **One Godot at a time**, across every agent. Two instances ran a real machine out
  of memory and killed a background suite.
- **When delegating to subagents**, tell them: one Godot at a time, no full-suite
  runs, scratch files in the scratchpad (never the project root, where Godot imports
  them), don't commit. A script error in a file you didn't touch may be a subagent
  mid-edit, so check before "fixing" it.

## Stage 6: Ship

See `references/ship.md` for the commands. In short:

- **Web**: `vite build --base ./` → `dist/` works on itch.io (HTML5 zip),
  GitHub Pages, Netlify, or a VPS. Playtest the build with `--dist dist`
  before uploading.
- **Desktop from a web game**: Tauri 2 wraps `dist/` into a native app
  (a few MB, uses the system webview).
- **Desktop from Godot**: export presets plus the export templates;
  `godot --headless --export-release`. Windows and a free, ad-hoc-signed universal
  macOS build can both be made from Windows (`godot-field-notes/references/export.md`).
- **GitHub release**: the version bump, export, zip and `gh release create` sequence
  is in `references/ship.md`. Keep asset names constant so
  `releases/latest/download/<name>` links never change.
- **itch.io**: `references/itch.md` covers the agent workflow and the failures that
  really happen (interactive login, unverified email, transient HTTP 525). The
  `itch-publish` and `steam-publish` skills have store details. `CREDITS.md` ships
  with the game if any asset needs attribution.
- **Trailer**: **`game-trailer`**, spoiler-free by default for narrative games.
- **Landing page**: **`game-landing-page`**, minimal by default, with absolute OG URLs
  and a GitHub Pages custom domain.
- **Icons**: the `icongen` skill for the favicon and app icons (Tauri needs a
  1024×1024 PNG source).

## Troubleshooting

- **User wants Unity or Unreal**: this kit doesn't cover them. Suggest
  the official Unity MCP or `CoplayDev/unity-mcp`, or `chongdashu/unreal-mcp`, plus
  the `unity-*` / `unreal-*` skills from `gamedev-skills/awesome-gamedev-agent-skills`.
- **An engine skill contradicts this one**: for API details, the engine
  skill wins. For process (GDD, assets, credits, playtest), this pipeline wins.
