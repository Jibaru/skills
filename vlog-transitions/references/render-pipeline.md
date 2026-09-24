# Render pipeline

Two backends drive the **same** `template.html` + `animation.js`. Remotion is
the default; the agent-browser capture loop is the fallback when Remotion gets
in the way (dependency trouble, a CSS feature its bundler chokes on, etc.).

## Primary: Remotion

One shared runtime per workspace: `<workspace>/_renderer/` (`npm install` once).
`HtmlTransition.tsx` mounts `public/current/template.html` in an iframe and
drives `window.seek(frame / fps)` with a delayRender/continueRender handshake —
frame-perfect and deterministic.

```bash
node <skill>/scripts/stage.mjs <project-dir>     # after EVERY config/template edit
cd <workspace>/_renderer

# 720p preview for the user gate (fast):
npx remotion render Transition ../<name>/out/preview.mp4 --scale=0.3333 --crf=28

# Final 4K60 H.264:
npx remotion render Transition ../<name>/out/<name>.mp4

# With alpha (ProRes 4444), verified flags:
npx remotion render Transition ../<name>/out/<name>-alpha.mov \
  --image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444
```

Defaults live in `remotion.config.ts` (h264, crf 16, overwrite). Composition
size/fps/duration come from `src/current-config.json`, written by `stage.mjs`.

For alpha output the template must not paint an opaque background — the desk
gradient on `#stage` and the `#000` on `body`/`AbsoluteFill` make the default
templates opaque by design (they cover the frame). Alpha only makes sense for
custom variants that leave transparency; don't offer it otherwise.

## Fallback: agent-browser capture

```bash
node <skill>/scripts/capture.mjs <project-dir> [--width 3840 --height 2160] [--fps 60] [--keep-frames]
```

Opens `template.html` over `file://`, sets the viewport, waits for
`window.READY`, then per frame: `eval seek(t)` → `screenshot` → ffmpeg
assembles H.264 (crf 16, yuv420p). ~1–3 s per 4K frame; a 3.5 s @ 60 fps
transition is 210 frames, so expect minutes, not seconds. Capture output is
**opaque only** (no alpha screenshots).

Requires `agent-browser` (`npm i -g agent-browser && agent-browser install`)
and `ffmpeg`.

## Determinism rules (both backends depend on them)

`animation.js` must render as a **pure function of `t`**:

- No free-running `requestAnimationFrame`, CSS animations/transitions, videos.
- No `Date.now()`, `Math.random()`, network fetches at seek time.
- `feTurbulence` must keep fixed `seed` attributes.
- Everything asynchronous (fonts, sticker images) happens once at load and is
  gated behind `window.READY` — both renderers wait for it.

## Troubleshooting

- **Blank/black frames in Remotion**: `stage.mjs` not re-run (stale
  `public/current`), or `READY` never fires — open the template standalone
  with `#dev` and check the browser console via `agent-browser errors`.
- **Font renders as fallback**: `assets/fonts/PatrickHand-Regular.ttf` missing
  from the project (re-run scaffold) or the `@font-face` path was edited.
- **Sticker missing**: `src` path in config is relative to the project root;
  after staging it must exist under `_renderer/public/current/`.
- **Remotion install/render breaks**: don't fight it — use `capture.mjs`; the
  templates are the source of truth and both backends produce the same frames.
- If the `remotion-*` skills from remotion-dev/skills are installed, they are
  good deep-dive references for Remotion-side debugging; this skill does not
  depend on them.
