# Template anatomy

A template is three files, copied into each project by `scaffold.mjs`:

- `template.html` — stage markup, CSS, the SVG map (`<g id="map-def">` with
  `<g id="map-art">` inside), the fold machinery, and script tags.
- `animation.js` — the choreography: phase table + `window.seek(t)`.
- `motion.js` — shared helpers (`window.MOTION`): easings, camera math, scene
  builders, the `#dev` scrubber. Identical across templates; fix bugs in
  `assets/templates/shared/motion.js`, not per-project.

## The seek contract

```
window.DURATION   seconds (from config)
window.seek(t)    pure function of t — paints the exact state at time t
window.READY      true once fonts + sticker images are loaded
```

Both renderers (Remotion iframe, capture loop) only ever call `seek`.

## Coordinate system

Authored at **1920×1080 stage units**; `MOTION.fitStage` letterboxes/scales
`#stage` to the real viewport, so 720p previews and 4K renders are the same
layout. Location `x`/`y` in config are **percent** of the stage. Raster
stickers are the only resolution-sensitive asset (see design-language.md).

## The unfold machinery (both map templates)

DOM: `#paper` → `#left-unit` (static) + `#right-unit` (flap, `rotateY`), each
containing a static top quarter and a bottom-quarter flap (`rotateX`). Each
quarter crops the shared map via a nested `<svg viewBox>` + `<use #map-def>`.

Two subtleties earned by debugging — do not undo them:

1. **Fold signs**: bottoms fold `+180°` (up, in front), right unit `-180°`
   (over the left). This combination is what shows paper *backs* while folded;
   other sign choices show mirrored map faces at t=0.
2. **`translateZ` layer lift**: folded layers get a few px of Z separation to
   prevent z-fighting; the lift scales with `(1 - unfoldProgress)` so it is
   exactly 0 when flat (no parallax misalignment on the open map).

After the unfold, `#paper-scene` is swapped for `#flat` (single full-map SVG +
`#route-layer` + `#marker-layer` + HTML `#sticker-layer`), where markers,
stickers, route and the final zoom live.

## Phase tables

Defaults are fractions of `durationSeconds` (so duration changes rescale the
whole choreography); `cfg.phases` overrides any window with absolute seconds,
e.g. `"phases": { "wiggle": [1.3, 1.8] }`.

- `map-reveal` (2.0 s): unfold1 → unfold2 → markers → pop → wiggle → zoom → flash.
- `map-travel` (3.5 s): compressed unfold → markers/popA → draw (route mask
  dash-offset) → travel (`getPointAtLength`, bob + lean) → popB/wiggle → zoom → flash.

## Config schema (superset)

```jsonc
{
  "template": "map-reveal | map-travel",
  "name": "lima-cusco",
  "size": { "width": 3840, "height": 2160 },   // output; stage stays 1920x1080
  "fps": 60,
  "durationSeconds": 3.5,
  "phases": { /* optional absolute-seconds overrides */ },
  "style": { "paper": "…", "ink": "…", "route": "…", "fontFamily": "…" },
  "camera": { "pushIn": 1.08, "followZoom": 1.45, "finalZoom": 2.6 },
  "wiggle": { "degrees": 6, "cycles": 3 },
  "travel": { "bobs": 5, "bobPx": 9 },          // map-travel only
  "route":  { "from": "id", "to": "id", "curvature": 0.18, "width": 10, "dash": [30, 22] },
  "locations": [
    { "id": "lima", "label": "Lima", "x": 24, "y": 62,
      "labelDx": 0, "labelDy": 62, "labelSize": 46,
      "stickers": [ { "src": "assets/face.sticker.png", "width": 300,
                      "scale": 1, "rotate": -4, "offsetX": 0, "offsetY": 0 } ] }
  ]
}
```

`map-reveal` treats `locations[0]` as the primary (sticker + final zoom
target). `map-travel` moves the `route.from` stickers along the path and pops
`route.to` stickers on arrival.

## Adding a new template to the family

1. Copy `map-reveal/` inside the skill's `assets/templates/` as a starting
   point; keep the seek contract, `fitStage`, camera helpers, flash-out ending
   and the style pack (design-language.md).
2. Put timing in a phase table derived from `D`; keep `seek` pure (rules in
   render-pipeline.md).
3. Add the template name to the `templates` array in `scripts/scaffold.mjs`
   and document it in SKILL.md.
4. Smoke-test with agent-browser screenshots across the whole timeline before
   first use — especially frame 0 and the final frame.
