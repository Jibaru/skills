---
name: livery-atlas-painting
description: Paint a custom livery, wrap or decal set onto a 3D model (vehicle, product, prop) as a procedural texture atlas drawn in real-world metres and box-projected in Blender — panels per side, logos from official SVGs, text, verified QR codes, a profile JSON so every correction is a number, and a fit/compare render loop. Use when the user says "paint this van/car/truck with our brand", "add a livery", "put our logo on the model", "wrap", "decals", "the logo should be bigger/lower", "the texture looks stretched/horrible", or when projecting a photo onto a model looks wrong.
metadata:
  author: Jibaru
  version: 1.0.0
---

# livery-atlas-painting

A livery is **drawn**, not photographed. Draw it as flat 2-D panels in the object's own metres, pack them
into one atlas, and box-project that atlas onto the mesh by face position. Everything here comes from
[clerk-van](https://github.com/Jibaru/clerk-van): a Ford Transit (a CC-BY Sketchfab asset) repainted in a
Clerk livery with "FREE COOKIES", logos and QR codes. Paths like `tools/gen_textures.py:129` are in that repo.
The generalized, tested scripts are in `scripts/`.

**Versions:** Blender 4.2 (`Coat Weight`, `surface_render_method`), Pillow 10+ (`set_variation_by_name` for variable
fonts), Python 3.10+. In older Blender use `blend_method` instead of `surface_render_method`.

## Rule 0: no photo projection

Projecting reference photos onto the model was tried and rejected outright by the user: "se ve horrible"
("it looks horrible"). Photos bake in perspective, reflections and lighting, and they smear across panel
seams. Draw clean vector-like shapes instead (polygons, text, pasted logos), placed by measurement. Start from a
**real** model (a downloadable, permissively licensed asset) and repaint it. The user rejected an AI-generated
body and a procedural one as "no se ve realista" ("it doesn't look realistic").

## The pipeline

1. **Measure the object** in metres in the Blender frame: front = -Y, rear = +Y, driver side (left) = +X,
   Z up, ground at z = 0. Use axle positions, wheel radius, belt line (window sill), sill height, pillars,
   roof edge.
2. **Write a profile JSON** with those numbers and every graphic's position and size
   (`tools/profiles/transit.json`). The generator reads it with `globals().update(PROFILE)`
   (`tools/gen_textures.py:96`).
3. **Draw each panel with a `View`** (`scripts/livery_view.py`, from `gen_textures.py:129-191`). A View maps
   `(a, b)` metres to pixels of one panel image, and has `rect`, `poly`, `ellipse`, `paste` (an RGBA layer
   centred on a point, optionally rotated) and `text` (size in metres).
4. **Pack the atlas and write the layout JSON**: the pixel rect of each panel plus the metre extents of
   each projection (`gen_textures.py:479-517`, `textures/atlas_layout_transit.json`). Blender reads the same
   JSON, so the picture and the UVs can't disagree.
5. **Box-project in Blender**: `scripts/project_uv.py` (from `build_transit_van.py:84-131`).
6. **Render orthographic fit views and perspective compare views** against the references (the
   `blender-render-review` skill). Fix by editing the profile, then regenerate and re-render.

## Panels and their mappings

| Panel | a (screen left → right) | b (bottom → top) | View |
| --- | --- | --- | --- |
| `side_left` (driver, +X) | y, nose on the left | z | `View(SIDE_W, SIDE_H, *EXT_SIDE)` |
| `side_right` (passenger, −X) | y mirrored, nose on the right | z | same View, drawn with `S = lambda y: -y` (`gen_textures.py:248-249`) |
| `front` | x, passenger side on the left | z | `View(FRONT_W, FRONT_H, *EXT_FRONT)` |
| `rear` | x reversed, driver side on the left | z | `View(..., flip_a=True)` |
| `top` | x reversed (driver on the left) | −y, nose at the top | `View(TOP_W, TOP_H, x0, x1, -y1, -y0, flip_a=True)` drawn with `P(x, y) = (x, -y)` (`gen_textures.py:360-363`) |

Resolution: the Transit's side panel is `SIDE_W = 2900` px for 6.2 m, so **468 px/m**, about 2 mm per pixel. Text
5 cm high is about 23 px tall, which is legible. Atlas 4096² with side 2900×1310 (×2), front and rear 1200×1400,
top 960×2480, plus wheel, plate, headlight and taillight swatches (`textures/atlas_layout_transit.json`).

## Every correction is a profile edit

Each piece of user feedback was answered by changing numbers in `tools/profiles/transit.json`, never code. The
git history shows it: these commits touched only the profile and regenerated outputs.

| Feedback | Commit | What changed |
| --- | --- | --- |
| "the diagonal must be parallel" | `fc00c83`, `1409982` | `DIAG` / `DIAG_TOP_Z`: the cab-door diagonal at 45°, from the mirror base |
| "the logo should fill this rectangle" (the user drew one) | `5515147` | `LOGO_H 0.62`: a 62 cm symbol |
| the hood lockup sat on the louvres | `f0e9944` | `HOOD_LOGO_Y` moved forward to −2.72 |
| the roof lockup should be centred and big, like the die-cast | `294dfa7` | `ROOF_LOGO [1.0, 0.85]`, allowed to cross the purple/black line |
| the passenger claim block hit the sliding-door seam | `6b4fd04` | `PASS_DY` |

Design rules learned along the way, now encoded as profile values:
- **Every diagonal shares one angle.** The purple band is `diag_y(z) = Y_PURPLE_ROOF + (ROOF_Z - z)`, exactly
  45° (`gen_textures.py:107-109`), anchored at the **real** roof edge `ROOF_Z = 2.62`, not the top of the painted
  area. The cab-door diagonal is built parallel to it.
- **Above the belt line, the black band starts at the window glass, not the door edge.** The window posts are
  about 15 cm wide (`PILLAR_DX = 0.19`; the comment at `gen_textures.py:69` says "covers the door's rear window post").
- **Scale graphics to the actual body**, not to a reference of a different variant. On the high-roof van the
  whole FREE COOKIES block is `GFX = 1.45`.
- **Different copy per side is allowed**: `SIDE_R_LINES` puts "Auth as easy as / <SignIn/> / clerk.com"
  on the passenger side.

## Box projection by position

The panel for each face is chosen by **where the face is first**, and only then by its normal. In real meshes
many thin edge faces have sideways normals while sitting on the roof or the nose. Classified by normal alone,
they pick the wrong panel. The shipped rules (`build_transit_van.py:101-112`):

```python
if c.z > ROOF_Z - 0.10 and az > 0.4:                      mode = "top"     # roof
elif abs(c.x) > 0.74 and c.z < ROOF_Z - 0.05:             mode = "side"
elif c.y > YR_Z - 0.45 and c.z > 0.3:                     mode = "rear"
elif c.y < YF_Z + 0.9 and c.z < 1.45 and n.z > 0.3:       mode = "top"     # hood
elif c.y < YF_Z + 0.7:                                    mode = "front"
else:                                                     # fallback: dominant normal axis
    mode = "side" if ax >= ay and ax >= az else ("front" if n.y < 0 else "rear") if ay >= az else ("top" if n.z > 0 else "bottom")
```

`c` is the face centre in world space (`mw @ poly.center`), and `n` is the world normal
(`mw.to_3x3().inverted().transposed() @ poly.normal`). For side faces, which side panel to use is also decided by
position (`c.x > 0`), not by the normal. This replaced an older normal-only projection, which sat unreachable after
a `continue` until clerk-van `b54a0d6` deleted it. The rebuilt GLB was byte-identical, which proves it was dead.

`scripts/project_uv.py` exposes the thresholds as a `Zones` dataclass (`Zones.from_mesh(body)` reads roof and
nose/tail from the bounding box). **Tested:** run on the shipped `export/clerk_van.blend` Body, it reproduces the
build's UVs on 108,642 of 108,648 loops (99.99%). The 6 that differ come from measuring the bounding box after
the doors were split off, instead of before.

Call it **before** splitting doors or other parts off the body, so the bounding box and the projection see the
whole shell.

## Faces that point inward get an interior material

Game meshes carry inward-facing copies (the inner door skins). With the livery on them, the logo shows inside the
cab. The build sends livery faces whose normal points **into** the body to a near-black `DoorInner` material
(`build_transit_van.py:291-314`):

```python
M_INNER = new_mat("DoorInner", (0.03, 0.03, 0.034), rough=0.85)
...
c = mw @ p.center; n = (nm @ p.normal).normalized()
d = Vector((c.x, 0.0, c.z - 1.3)); d.y = 0.0          # outward = away from the body's long axis (z = 1.3 m)
if c.y > 2.6:  d = Vector((0.0, 1.0, 0.0))            # rear end: outward is +y
elif c.y < -2.6: d = Vector((0.0, -1.0, 0.0))         # nose: outward is -y
if d.length > 0.2 and n.dot(d.normalized()) < -0.35:
    p.material_index = inner
```

## Materials that read as paint

From `build_transit_van.py:60-82` and `308-403`:

| Material | Values |
| --- | --- |
| `Livery` | the atlas as Base Color (image colorspace **sRGB**), roughness 0.30, Coat Weight 0.25, Coat Roughness 0.08 |
| `Cladding` | (0.045, 0.047, 0.052), roughness 0.6 |
| `DoorInner` | (0.03, 0.03, 0.034), roughness 0.85 |
| `Glass` | (0.05, 0.06, 0.08), roughness 0.03, **alpha 0.45**, `surface_render_method = "BLENDED"`, `show_transparent_back = False` |
| `Headlight_Lens` / `Taillight_Lens` | the asset's lens materials renamed by role (`retag`), Emission Strength **0** (a viewer raises it to switch the lights on), `surface_render_method = "DITHERED"` |

Wrap `Coat Weight` in `try/except KeyError`, because the input doesn't exist before Blender 4.0. Retagging by role
(`retag("Lights", "Headlight_Lens", ...)`) is what lets a web or Godot viewer find the lamps by name.

## Logos: official SVGs, rasterized by a browser

Never redraw or trace a logo. Take the brand's own SVG (clerk.com/brand-assets in this case) and rasterize it
with Chrome, so curves and kerning are exact. `scripts/rasterize_svg.mjs` (from `tools/rasterize_logos.js`) swaps
fill colours as literal strings and screenshots with a transparent background:

```bash
grep -o '#[0-9A-Fa-f]\{6\}' brand/symbol-primary.svg | sort -u           # -> #6C47FF #BAB1FF
node scripts/rasterize_svg.mjs brand/symbol-primary.svg out/symbol_white.png --width 1200 \
  --replace "#6C47FF=#FFFFFF" --replace "#BAB1FF=#FFFFFF"
```

**Tested:** the output is byte-for-byte pixel-identical (max channel difference 0) to the committed
`textures/brand/symbol_white.png`. Rasterize big (logo 3000 px wide, symbol 1200) and downscale with LANCZOS
when pasting (`load_logo`). Use the white version on dark or purple and the colour version on white (the purple-text
lockup on the white hood). Rotate with `Image.rotate(angle, expand=True)`: 45° for the side lockup along the
diagonal (−45 on the driver side, +45 on the passenger side), 90° on the roof, 180° on the hood so it reads from the front.

Keep **brand colours** apart from **livery colours sampled from the reference**. The logo SVG's purple is `#6C47FF`,
while the van's painted purple band was sampled from the reference photos as `#5B30E6` (`gen_textures.py:41`).

Fonts: Inter variable (OFL), with weights picked by name: `("Inter.ttf", "Bold")` for headlines, `"SemiBold"` for
copy, `"Medium"` for footnotes.

## QR codes: generate, then prove they decode

`qr_layer` in `scripts/livery_view.py` (from `gen_textures.py:213-224`) uses error correction **M**,
border **1**, and white modules on a **transparent** ground (black pixels made transparent), resized with
`NEAREST` so module edges stay crisp. Paste it onto any dark panel.

**Verify every generation.** Livery QRs are light-on-dark, and OpenCV's detector expects dark modules on light,
so **invert first**:

```bash
python scripts/verify_qr.py textures/panel_side_left_transit.png textures/panel_side_right_transit.png \
  textures/panel_rear_transit.png --expect https://clerk.com
# ok    textures/panel_side_left_transit.png: 'https://clerk.com' (inverted @ 1x)
```

**Tested:** all three regenerated panels decode inverted, and **none** decode without the inversion, so the step is
required, not cosmetic. The script also tries 0.5× scale. Make verification part of generation, not a separate
habit. clerk-van's README claimed the codes were checked on every generation before any code did it. Since
`b54a0d6`, `gen_textures.py` calls `tools/verify_qr.py` after writing the atlas: inverted panels, scales
1.0/0.5/0.75, exit 1 on failure, and a notice instead of a failure when cv2 is missing. Do the same at the end of
your own generator.

## Regenerate, and check it's deterministic

```bash
python tools/gen_textures.py --profile transit
```

**Tested** on a scratch copy with Pillow 13: the layout JSON is identical to the committed one, and the atlas
matches except for 118 pixels off by 1 (resampling differences between Pillow versions, in the taillight swatch).
If the atlas changes everywhere after a "no-op" run, something in the profile or fonts changed.

Generating also writes **relief masks** (`textures/print_mask/<panel>.png`). Every `paste()` and `text()` also
draws white into `View.mask`, and base paint doesn't. That's the exact outline source for raised lettering in the
printable model (see `print-ready-export`).

## Corrections to the source notes

Where the session notes this skill was built from disagree with the repo, the repo wins:
- Glass alpha is **0.45** (`build_transit_van.py:315`), not 0.25.
- The QR is white modules on **transparent**, not "white on dark". The dark comes from the panel underneath.
- The hood rule is `c.y < YF + 0.9 and c.z < 1.45 and n.z > 0.3`. The front rule `c.y < YF + 0.7` comes after it.
- The hood-logo fix moved the lockup **forward** (`f0e9944`), not lower.
- The QR-decode verification and photo-projection attempts were session work, not committed scripts.

## Done means

- [ ] Every graphic's position and size lives in the profile JSON, with no magic numbers in drawing code.
- [ ] `verify_qr.py` passes on every panel with a QR, decoding the expected URL.
- [ ] The UVs come from the same layout JSON the generator wrote, regenerated in the same run.
- [ ] No livery visible inside the model (`DoorInner` check), seen in an interior close-up.
- [ ] Fit renders (orthographic) and compare renders (reference angles) reviewed, and every spot the user
      flagged has its own close-up before and after (`blender-render-review`).
