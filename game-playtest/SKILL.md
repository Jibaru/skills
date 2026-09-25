---
name: game-playtest
description: Verify a game actually works by playing it — drive a web game (Phaser, Three.js, PixiJS, Kaplay, any canvas) through Playwright or a Godot 4 project through a headless-capable harness with a scripted JSON input sequence, capture screenshots, assert on game state, catch console and script errors, flag blank frames, and validate glTF models. Use after implementing or changing gameplay, when the user says "test the game", "playtest", "does it work", "take a screenshot of the game", "check for errors", "the screen is black", or before declaring any game milestone done.
metadata:
  author: Jibaru
  version: 1.0.0
---

# game-playtest

A game that compiles is not a game that works. After every gameplay change,
**run it, look at it, and assert on it** before saying it's done. This skill
drives the game with a scripted input sequence, then produces screenshots
you must open and look at, plus a report of errors and checks.

## The loop

1. Write or update a **playtest script** in `playtest/scripts/<name>.json`
   that exercises the thing you just built.
2. Run it (web or Godot, below).
3. **Read every screenshot** with the Read tool. A PASS only means nothing
   crashed and no frame was blank; it can't tell that the player sprite is
   the wrong tile or the HUD is off-screen. You can.
4. Fix, then rerun. Repeat until the screenshots show what the GDD
   milestone describes.
5. Tell the user the result, and include the screenshot paths.

Never claim a milestone works without a passing run and screenshots you
looked at.

## Playtest scripts

One JSON format drives both runners:

```json
{
  "name": "smoke",
  "viewport": [1280, 720],
  "steps": [
    { "wait": 1500 },
    { "screenshot": "start" },
    { "expect": "window.__TEST__.state().hp === 3" },
    { "hold": ["d", "s"], "ms": 600 },
    { "press": "Space" },
    { "click": [640, 360] },
    { "eval": "window.__TEST__.state()" },
    { "screenshot": "after-move" }
  ]
}
```

| Step | Effect |
| --- | --- |
| `wait: ms` | let the game run |
| `frames: n` | Godot only: wait n frames |
| `press: key` | tap a key |
| `hold: key or [keys], ms` | hold keys together (diagonals, run + jump) |
| `action: name or [names], ms` | Godot only: fire an InputMap action as an event |
| `click: [x, y]` / `move: [x, y]` | mouse, in canvas or viewport coordinates |
| `type: "text"` | web only: type into focused input |
| `expect: expr` | fail the run unless `expr` is exactly `true` |
| `eval: expr` | record a value in the report |
| `screenshot: label` | save `NN-label.png`; flagged as BLANK if it's one flat colour |

Key names use the browser's names (`ArrowLeft`, `Space`, `Enter`, `a`…).
The Godot harness maps them to Godot keycodes.

Keep scripts **short and purposeful**: `smoke.json` boots the game and uses
the core verb. Add one script per mechanic worth protecting (`jump.json`,
`game-over.json`). Randomness makes `expect` flaky, so seed the RNG from a
query parameter or a project setting when running under test.

## Test hooks: make state observable

Screenshots show what's on screen, and `expect` checks the numbers behind it.
Expose a small, read-only state function from the game:

- **Web**: `window.__TEST__ = { state: () => ({ hp, score, x, y, scene }) }`
  set in the main scene's `create()` (Phaser) or after init (Three.js). It's
  cheap enough to leave in production builds.
- **Godot**: expressions run against the **main scene's root node**, so its
  script variables are directly available: `"score > 0"`,
  `"get_node('Player').position.x > 100"`, `"get_tree().paused == false"`.

## Web games

Needs Playwright in the game project (once):

```bash
npm i -D playwright && npx playwright install chromium
```

Run against the dev server (started and stopped for you), a running URL,
or a production build:

```bash
node <skill>/scripts/playtest-web.mjs playtest/scripts/smoke.json --cmd "npx vite --port 5199 --strictPort" --url http://localhost:5199/
node <skill>/scripts/playtest-web.mjs playtest/scripts/*.json --url http://localhost:5173/
node <skill>/scripts/playtest-web.mjs playtest/scripts/smoke.json --dist dist
```

- Chromium runs headless with SwiftShader (software) WebGL, so it works
  without a GPU. A heavy 3D scene can drop to a few FPS there, and a game
  that clamps `dt` then runs in slow motion. So **assert on direction and
  state, not distance**: `x > 0.5`, not `x > 10`. `--headed` uses the real
  GPU, and it's the only FPS number worth quoting.
- `--cmd` refuses to start if something already answers at `--url` (a
  stale dev server would be tested instead). It warms the page up once so
  Vite's dependency pre-bundling doesn't restart the server mid-run.
- It reports as errors: uncaught exceptions, `console.error`, failed requests
  and HTTP 4xx/5xx (the usual cause of a missing texture or sound).
- `--dist` serves with COOP/COEP headers, so Godot web exports run too.
- Screenshots crop to the first `<canvas>`. Set `"canvas": "#game canvas"`
  in the script for another selector, or `"full": true` on a step for the
  whole page, including HTML UI.

## Godot 4 projects

```bash
node <skill>/scripts/playtest-godot.mjs playtest/scripts/smoke.json --project . --godot <path-to-godot>
node <skill>/scripts/playtest-godot.mjs playtest/scripts/logic.json --headless
```

- Finds Godot from `--godot`, then `$GODOT`, then `godot`/`godot4` on PATH.
  On Windows use the `*_console.exe` binary, or no output is captured.
- The harness (`assets/playtest_harness.gd`) is copied to
  `playtest/playtest_harness.gd` and runs as the main loop with `-s`. It
  loads the main scene itself, so **the project is never modified**. Set
  `"scene": "res://levels/level_2.tscn"` in a script to test another scene.
- The project is imported headless first, so newly added assets work.
- **Screenshots need a window**: the default mode opens one for a few
  seconds, with audio off. `--headless` skips screenshots and is fine for
  logic checks and CI.
- `SCRIPT ERROR` lines from the engine are reported with their file and
  line. `godot.log` next to the screenshots has the full output.

## Other engines

- **Ebitengine**: use the `run-ebitengine-app-headless` skill.
- **Three.js with the `threejs-game-skills` pack**: its `threejs-qa-release`
  skill has baselines and bot playtests. This runner still works as a quick
  smoke test for any canvas.

## 3D models

Before blaming the renderer for a missing or broken model, validate it:

```bash
npx -y @gltf-transform/cli inspect assets/models/knight.glb     # tris, textures, size
npx -y @gltf-transform/cli validate assets/models/knight.glb    # spec errors
npx -y @gltf-transform/cli optimize in.glb out.glb --texture-compress webp   # shrink for web
```

Only `validate` **errors** matter. Warnings and hints (such as
`BUFFER_VIEW_TARGET_MISSING`) show up on perfectly good models, including
Poly Haven's. Over ~50k triangles or 10 MB for one prop in a web game is a
problem. Say so.

## Reading results

`playtest/screenshots/<name>/report.json` holds everything the console
summary shows. Common failures:

- **BLANK screenshot**: the canvas never drew. Look for an uncaught error
  earlier in the run, a scene that failed to load, or (Three.js) a camera
  looking at nothing or a missing light.
- **HTTP 404 on an asset**: wrong path. Vite serves `public/` at `/`, so the
  path is `assets/...`, not `public/assets/...`.
- **expect fails but the screenshot looks right**: the test hook isn't
  updated, or the step ran before the game finished loading. Add a `wait`.
- **Godot `unknown input action`**: the action isn't defined in the
  project's Input Map.
- **Godot run times out**: the game waits for input the script never sends
  (a "press any key" screen), or a `while` loop never yields.
