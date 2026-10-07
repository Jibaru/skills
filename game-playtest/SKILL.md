---
name: game-playtest
description: Verify a game actually works by playing it — drive a web game (Phaser, Three.js, PixiJS, Kaplay, any canvas) through Playwright or a Godot 4 project through a headless-capable harness with a scripted JSON input sequence, capture screenshots, assert on game state, catch console and script errors, flag blank frames, and validate glTF models. Use after implementing or changing gameplay, when the user says "test the game", "playtest", "does it work", "take a screenshot of the game", "check for errors", "the screen is black", or before declaring any game milestone done.
metadata:
  author: Jibaru
  version: 1.1.0
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
3. **Read every screenshot** with the Read tool, after the run has finished
   (never in the same parallel batch as the command that creates it). A PASS
   only means nothing crashed and no frame was blank; it can't tell that the
   player sprite is the wrong tile or the HUD is off-screen. You can.
   Composites, contact sheets and A/B comparisons: `references/visual-review.md`.
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
| `until: expr, timeout` | Godot only: wait until `expr` is `true` (default 20000 ms), else fail. Use instead of guessed `wait`s |
| `gd: "source"` | Godot only: run real GDScript (assignment, lambdas, loops, `await`); `root` = main scene, `tree` = SceneTree; `return` a value to record it |
| `screenshot: label` | save `NN-label.png`; flagged BLANK if one flat colour, `= SAME` if identical to the previous shot (Godot) |

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
  Add debug hooks to the root script (`look_from`, `frame_node`, `stats()`,
  time skips) and one entry scene per long test: `references/godot-testing.md`.

### Godot expressions: what works and what doesn't

`expect`, `eval` and `until` use Godot's `Expression` class, which is **not**
GDScript. Verified on Godot 4.7.2:

| Works | Fails → do this instead |
| --- | --- |
| `score > 0`, `clock == '21:00'`, `house.boarded['side'] == true` | `a = b`, `a += 1` → PARSE ERROR "Expected '='" → `obj.set('prop', v)`, the game's own setter (`player.set_flashlight(true)` — setting the var directly skips the light), or a `gd` step |
| method calls with args: `look_from(Vector3(6.6, 0.05, -16.0), 0.0, -0.7)`; void methods return `<null>` | lambdas `func(x): …` → PARSE ERROR → a helper method, or a `gd` step |
| arrays: `[fps, draw_calls, prims]` | `$Player` → `get_node('Player')` |
| engine singletons: `AudioServer.get_bus_count()`, `Engine.has_meta('playtest')` | |
| `class_name` globals, incl. static funcs **and static vars**: `Night.double(4)`, `Night.level` | |
| autoloads by name: `GameState.auto_restart`; `tree` = the SceneTree | |
| `find_children('*','ScrollContainer',true,false)[0].set('scroll_vertical', 520)`; `hud.set('visible', false)` | |

**An eval that returns PARSE ERROR or EXEC ERROR did nothing.** Every
screenshot and measurement after it is invalid. The runner prints it as `✗`
with a hint. The root node differs per scene (`hud` doesn't exist on a menu
scene), so an expression that works in one test can fail in another.

When you need assignment or a lambda, use a `gd` step:

```json
{ "gd": "root.player.flashlight_on = true" }
{ "gd": "return root.gray.skeleton.get_children().map(func(c): return c.get_class())" }
{ "gd": "AudioServer.set_bus_mute(0, false)\nreturn AudioServer.get_bus_peak_volume_left_db(AudioServer.get_bus_index('Music'), 0)" }
```

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
# full suite: sequential, one Godot, one import, progressive summary
node <skill>/scripts/playtest-godot.mjs playtest/scripts/*.json --project . --godot <path> --summary playtest/summary.txt
```

- Finds Godot from `--godot`, then `$GODOT`, then `godot`/`godot4` on PATH.
  On Windows use the `*_console.exe` binary, or no output is captured.
- The harness (`assets/playtest_harness.gd`) is copied to
  `playtest/playtest_harness.gd` and runs as the main loop with `-s`. It
  loads the main scene itself, so **the project is never modified**. Set
  `"scene": "res://levels/level_2.tscn"` in a script to test another scene
  (a wrong path reports `scene not found: <path>`).
- The project is imported headless first, so newly added assets work. If the
  first import prints errors (normal right after adding a translation CSV:
  `Cannot open file 'res://….translation'`), it imports again and only errors
  that survive the second pass count. `--skip-import` skips it when nothing
  changed.
- **Screenshots need a window**: the default mode opens one for a few
  seconds, with audio off. `--headless` skips screenshots and is fine for
  logic checks and CI.
- `SCRIPT ERROR` lines from the engine are reported with their file and
  line. `godot.log` next to the screenshots has the full output.
  **`N resources still in use at exit`, `ObjectDB instances leaked at exit`
  and `RID … leaked` are warnings, not failures.** Godot prints them when
  statics or caches hold Resources at quit. `--explain-log <godot.log>`
  re-classifies an old log the same way.
- `playtest/screenshots/.gdignore` is created so Godot doesn't import every PNG.
- While the harness runs, `Engine.has_meta("playtest")` is `true`. Use it in
  the game to keep tests out of the player's real save and settings and to
  leave the window alone:
  `return "user://playtest_save.cfg" if Engine.has_meta("playtest") else "user://save.cfg"`.
  If the game reloads its scene (auto-restart on death or dawn), the harness
  reports `main scene was freed`. Disable auto-restart under test.

### One Godot at a time, and the time budget

- **The runner holds a machine-wide lock** (`playtest-godot.lock` in the OS
  temp folder). A second runner, including a subagent's, waits and says so. A
  heavy 3D scene takes ~600 MB of VRAM, and two Godot processes ran a laptop
  out of memory and killed a background suite with nothing saved. Exports and
  `--write-movie` recordings are Godot too: **one Godot process of any kind at
  a time.** `--no-lock` is for CI with dedicated runners.
- **The timeout is derived from the script** (its waits × 1.5 + 2 min, at
  least 60 s). Override it with `"timeout": 600000` in the JSON or
  `--timeout`. When the runner kills a run, it says so with the step it was on
  (`killed by the runner after … at step 7/12 {"wait":21000}`). That means the
  script is longer than the budget, or the game is waiting for input the
  script never sends. It is not a crash, and checks and screenshots up to that
  step are kept in report.json.
- A story test can take longer than the Bash tool's limit (120 s default,
  600 s max). Run it with `run_in_background: true` and wait for the
  notification. Don't `sleep` or poll the output file, and don't pipe a long
  background run through `grep` or `head`: the output is buffered and lost if
  the process is killed. `--summary` writes one line per test as each
  finishes, so a killed suite still leaves its results.
- `--quiet` prints only verdicts, `✗` lines and screenshot paths. Use it
  instead of `| grep -E "PASS|FAIL"`, which has hidden real errors in practice.

### Delegating to subagents

A `SCRIPT ERROR` in a file you didn't touch may be a subagent mid-edit, so
check before "fixing" it. When delegating, tell subagents: one Godot at a
time (the lock enforces it), no full-suite runs, scratch files in the
scratchpad rather than the project root (Godot imports stray PNGs), and don't
commit.

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
  updated, or the step ran before the game finished loading. Use an `until`
  (Godot) or a `wait`.
- **`= SAME as previous`**: the step between the two shots changed nothing.
  Usually an eval returned PARSE/EXEC ERROR, or a parameter never reached
  the shader.
- **Godot `unknown input action`**: the action isn't defined in the
  project's Input Map.
- **`killed by the runner … at step k/n`**: raise the timeout, or the game is
  waiting for input the script never sends (a "press any key" screen, an
  intro that freezes the player), or a `while` loop never yields.
- **A story test broke after adding an intro, title card or tutorial**: it
  points at the story's entry scene. Give long tests their own entry scenes
  (`references/godot-testing.md`), and grep `playtest/scripts/*.json` for
  `"scene"` to find the tests that depend on one.
- **`main scene was freed`**: the game reloaded its scene mid-test.
- **`scene not found: <path>`**: wrong `"scene"` path in the script.
