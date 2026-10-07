# Visual review: composites, contact sheets, A/B

A PASS means nothing crashed. Screenshots, not asserts, caught the failures that
mattered in THE ONES: the camera aimed at nothing, an NPC standing in paddy water, the
wrong model in the shadow scene, a filter "too blurry" to read. So open every image.

## Order matters

- **Never Read an image in the same parallel batch as the command that creates it.**
  The Read runs first and gets "File does not exist", or worse, the *previous* image
  with the same name, which you then review as if it were new.
- Run → confirm PASS (or at least that the shot exists) → Read.
- Don't review composites built from a FAILed run. Its shots may be stale or partial.
- If a Write failed ("modified since read"), any screenshot taken afterwards shows the
  OLD version. Confirm writes before trusting a capture.

## Composites with ffmpeg

Write composites to `build/review/` (gitignored) or the scratchpad, never into a
folder Godot imports (`res://`).

```bash
P=playtest/screenshots/kuro_yard; mkdir -p build/review
# three side by side
ffmpeg -hide_banner -loglevel error -y -i $P/01-day.png -i $P/02-day-bark.png -i $P/03-night-growl.png \
  -filter_complex "[0]scale=640:-2[a];[1]scale=640:-2[b];[2]scale=640:-2[c];[a][b][c]hstack=3" build/review/kuro_yard.jpg
# 2x2 grid
ffmpeg -y -loglevel error -i 1.png -i 2.png -i 3.png -i 4.png \
  -filter_complex "[0]scale=800:-2[a];[1]scale=800:-2[b];[2]scale=800:-2[c];[3]scale=800:-2[d];[a][b]hstack[t];[c][d]hstack[u];[t][u]vstack" grid.jpg
# contact sheet of a video (one frame every 4 s)
ffmpeg -y -loglevel error -i trailer.avi -vf "fps=1/4,scale=320:180,tile=5x4" -frames:v 1 sheet.png
# only a time window (30–42 s)
ffmpeg -y -loglevel error -i trailer.avi -vf "fps=1,select='between(t,30,42)',scale=320:180,tile=6x2" -frames:v 1 window.png
# pixel zoom on a detail
ffmpeg -y -loglevel error -i shot.png -vf "crop=120:90:740:550,scale=480:360:flags=neighbor" zoom.png
```

**Check every input exists before a many-input stack.** One missing tile fails the
whole sheet. In THE ONES the cause was `while read uid url < list.txt` skipping a last
line with no trailing newline. Write lists with a trailing newline, or use
`while read -r a b || [ -n "$a" ]`.

## Numbered labels on Windows

`drawtext` without `fontfile=` spams `Fontconfig error: Cannot load default config file`
(there's no fontconfig on Windows) and draws nothing. A `C:` path inside a filter breaks
it, because `:` separates filter options. Copy a TTF next to the images and use a
relative path:

```bash
cp assets/fonts/CourierPrime-Bold.ttf "$S/th/f.ttf"; cd "$S/th"
ffmpeg -y -loglevel error -i 1.jpg -vf "scale=400:225:force_original_aspect_ratio=increase,crop=400:225,drawtext=fontfile=f.ttf:text='1':fontcolor=yellow:fontsize=34:x=8:y=6:box=1:boxcolor=black@0.6" n1.png
```

`scale=…:force_original_aspect_ratio=increase,crop=W:H` is safer than
`decrease,pad`, which fails with "Padded dimensions cannot be smaller than input
dimensions" on some inputs. Mixed PNG and JPEG tiles need `format=yuvj420p` per tile
before `tile`/`xstack`.

## A/B look tuning

Change one parameter per shot, then compare:

```json
{ "eval": "set_analog(0.0)" }, { "wait": 500 }, { "screenshot": "analog-0" },
{ "eval": "set_analog(0.7)" }, { "wait": 500 }, { "screenshot": "analog-70" },
{ "eval": "set_analog(1.0)" }, { "wait": 500 }, { "screenshot": "analog-100" }
```

then `hstack=3`. If the runner marks shots `= SAME as previous`, or the stacked
frames look identical, the parameter never applied. In THE ONES the first attempt
tried to set a static shader uniform directly in an expression, and the fix was a
`set_analog(v)` method on the root. Show before/after stills to the user before
asking for an opinion.

## Shader debugging: render the masks as colour

When a visual bug survives two parameter tweaks, stop tuning and look at the
intermediate values. Temporarily write the masks to the output, take one screenshot,
and restore the shader:

```glsl
// TEMPORARY, never commit: R = keep mask, G = fur-detail weight, B = dark-source mask
ALBEDO = vec3(keep, d, dark_src);
```

```bash
cp shaders/dog_coat.gdshader "$S/dog_coat.bak"
# edit the ALBEDO line (Edit tool), run one playtest screenshot, then restore:
cp "$S/dog_coat.bak" shaders/dog_coat.gdshader
```

In THE ONES this found in about 2 minutes what three blind iterations hadn't: the
thresholds were being compared in **linear** space (a `source_color` texture is
linearized on sampling, so sRGB 0.5 arrives as about 0.21).
