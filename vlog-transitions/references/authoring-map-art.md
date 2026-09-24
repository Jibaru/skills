# Authoring the map art

The scaffolded `template.html` ships with **placeholder geography**. For a real
transition you replace the contents of `<g id="map-art">` with stylized art of
the actual places — this is agent work, done by hand in SVG, not by an image
model.

## Workflow

1. **Look at the real geography first.** Open a reference with agent-browser
   and actually look at it before drawing:

   ```bash
   agent-browser open "https://es.wikipedia.org/wiki/Per%C3%BA"   # or an OSM permalink
   agent-browser screenshot ref.png
   ```

   Read the screenshot. You need: the coastline direction, where the places sit
   relative to each other, and one or two recognizable shapes (a bay, a lake, a
   mountain range). That's all the fidelity this style wants.

2. **Place the locations before drawing.** Decide `x`/`y` (percent of the
   1920×1080 stage) for every location in `transition.config.json` so their
   *relative* positions match reality (Cusco is east-southeast of Lima, etc.).
   Keep them **20–80% in both axes** — the final zoom centers on a location and
   clamps to the map edge, and for `map-travel` the route needs room to breathe.

3. **Draw inside `<g id="map-art">`** (coordinates 0..1920 × 0..1080), using
   the placeholder as the idiom to imitate:
   - Sea: one filled region (`#dde6da`) with a hand-wavy coast path
     (`#8fa08e`, ~5px, `stroke-linecap="round"`) plus a dotted offset echo line.
   - Terrain: `^` / `^^` peak doodles in ink (`#7a6a50`, ~4.5px), clustered
     where the real mountains are.
   - One river or road max, muted blue (`#9fb4c8`).
   - Keep the compass rose (move it to an empty corner).
   - Region names (optional): Patrick Hand, large, low-opacity ink — but do
     NOT hand-draw the location labels/markers; those are generated from
     `locations[]` by the animation.
   - Curved/rotated text (optional flourish): `<text>` on a `<textPath>`.

4. **Verify against the fold.** The map is shown quartered during the unfold —
   avoid putting critical art exactly on the center lines (x≈960, y≈540) where
   the crease shading sits.

5. **Look at your drawing.** Stage nothing yet — open the file directly and
   scrub:

   ```bash
   agent-browser open "file://<project>/template.html#dev"   # slider UI
   agent-browser set viewport 1280 720
   agent-browser eval 'window.seek(1.2)'
   agent-browser screenshot check.png
   ```

   Read the screenshot and fix what looks wrong (proportions, collisions with
   markers/route, unreadable doodles). Iterate until it reads instantly.

## Sticker prep (before or after the art)

```bash
cd <workspace>/_renderer && npm install        # first time only (downloads the bg-removal model on first run)
node tools/sticker.mjs photo.jpg ../<name>/assets/face.sticker.png            # auto cutout + white border
node tools/sticker.mjs cut.png   ../<name>/assets/face.sticker.png --no-cut   # user-provided transparent PNG
```

**Always look at the produced sticker** (composite it on gray with ImageMagick
or screenshot it in the template) before continuing. If the automatic cutout
mangled hair/edges, ask the user for a manually cut PNG and use `--no-cut`.
