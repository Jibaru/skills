---
name: vlog-transitions
description: Generate 4K vlog transitions in the "paper map" family — a folded vintage paper map unfolds full-screen and the creator's face pops in as a die-cut sticker (map-reveal), or travels along a dashed route between two places (map-travel). Use when the user asks for a "map transition", "vlog transition", "transición de mapa", "paper unfold intro", a travel/route animation between places, or wants to regenerate/tweak a transition project created by this skill.
metadata:
  author: Jibaru
  version: 1.0.0
---

# vlog-transitions

Cinematic 3840×2160@60fps vlog transitions rendered from an HTML/CSS/JS
animation. Two templates: **map-reveal** (~2.0 s) and **map-travel** (~3.5 s).
Every transition is a regenerable project folder; the videos are mute (sound
is added in the user's editor).

Read `references/design-language.md` before producing anything visual — it is
what keeps separately generated transitions looking like one vlog.

## Architecture in one paragraph

`template.html` + `animation.js` are the single source of truth: a
deterministic `window.seek(t)`. Remotion (shared runtime in
`<workspace>/_renderer/`) renders it frame-perfect via an iframe; if Remotion
gets in the way, `scripts/capture.mjs` renders the *same* files with
agent-browser screenshots + ffmpeg. agent-browser is also your eyes: you look
at frames while designing, before ever paying for a 4K render.

## Workflow

### 1. Gather inputs

From the user: template, transition name (kebab-case), place names, face
photo path(s), and any overrides (duration, colors, more faces). Photos should
be ≥1000 px on the face. Missing photo? Scaffold anyway and leave the sticker
step pending.

### 2. Scaffold

```bash
node <skill>/scripts/scaffold.mjs --template map-travel --name lima-cusco --dir ./transitions
cd transitions/_renderer && npm install   # first workspace only
```

This creates `transitions/<name>/` (template.html, animation.js, motion.js,
transition.config.json, bundled font, assets/, out/) and the shared
`_renderer/` once per workspace.

### 3. Stickers

```bash
node transitions/_renderer/tools/sticker.mjs photo.jpg transitions/<name>/assets/face.sticker.png
```

Automatic background removal + white die-cut border. **Look at the result**
(composite on gray, or screenshot it in the template). If the cutout is bad,
ask the user for a pre-cut transparent PNG and re-run with `--no-cut`. Never
bake shadows into the PNG.

### 4. Config + map art

Edit `transition.config.json`: locations (percent coordinates, 20–80% range),
labels, sticker entries, durations. Then replace the placeholder geography in
`<g id="map-art">` in `template.html` with stylized art of the real places —
process and rules in `references/authoring-map-art.md` (look at a real map
with agent-browser first; save the resolved positions so the user can hand-tune
and regenerate).

### 5. Iterate with your eyes

```bash
agent-browser open "file://$(pwd)/transitions/<name>/template.html#dev"
agent-browser set viewport 1280 720
agent-browser eval 'window.seek(0.7)' && agent-browser screenshot check.png
```

Read the screenshots at t=0, mid-unfold, pop, mid-travel, and the final frame.
Fix defects (overlaps, unreadable labels, camera showing the desk) before
showing the user anything.

### 6. Preview gate (default — skip only if the user says render directly)

```bash
node <skill>/scripts/stage.mjs transitions/<name>
cd transitions/_renderer
npx remotion render Transition ../<name>/out/preview.mp4 --scale=0.3333 --crf=28
```

Show the user the 720p preview plus 2–3 keyframes and wait for their OK —
motion (wiggle timing, travel speed) can only be judged in video.

### 7. Final render

```bash
npx remotion render Transition ../<name>/out/<name>.mp4    # 4K60 H.264, crf 16
```

Alpha (ProRes 4444) and the agent-browser/ffmpeg fallback pipeline:
`references/render-pipeline.md`.

### 8. Regenerating

Everything is in the project folder. To tweak later: edit
`transition.config.json` (or the map art), re-run `stage.mjs`, re-render. The
config is the contract — never hardcode into animation.js what belongs there.

## Templates

| Template | Beat sheet |
| --- | --- |
| `map-reveal` | folded paper back full-frame → 4-quadrant unfold with fold shadows → camera settles → marker + sticker pop with ±6° wiggle → fast zoom into the place + white flash |
| `map-travel` | compressed unfold → both markers pop, origin sticker pops → dashed red route draws itself → sticker rides the route (bob + lean), camera follows → arrival wiggle, destination stickers pop → zoom + flash |

Timing, config schema, and how to add a third template:
`references/template-anatomy.md`.

## Dependencies

- **node + npm** — scripts and the Remotion runtime (installed per workspace).
- **agent-browser** — design iteration and the fallback capture
  (`npm i -g agent-browser && agent-browser install`).
- **ffmpeg** + **ImageMagick (`magick`)** — capture assembly / sticker border.
- Background removal downloads its model on first `sticker.mjs` run (network).
- Optional reading if installed: the official `remotion-*` skills, for deep
  Remotion debugging only — this skill is self-contained.

## Hard rules

- `seek(t)` stays pure — no clocks, no randomness, no free-running animation.
- Frame 0 fully papered; ending always zoom + flash (clean editor cuts).
- Look at frames before the user does; the 4K render is the expensive step,
  everything before it is where mistakes get caught.
