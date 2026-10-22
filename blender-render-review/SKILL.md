---
name: blender-render-review
description: Review a 3D model headlessly with renders that can be trusted — a fixed product studio in Blender (exact background colour such as #7CFF00 for camera rays, neutral grey for reflections, shadow-calibrated floor), preview/fit/compare/close-up/turntable modes, before/after close-ups for every complaint, reference compare sheets and contact sheets, a seamless turntable encoded to MP4/GIF with a done sentinel, and a headless browser check of the web viewer. Use when the user asks for a render, turntable, 360 video, product shot, "show me the model", "compare with the reference", "it still looks wrong here", or when checking a GLB in a Three.js page.
metadata:
  author: Jibaru
  version: 1.0.0
---

# blender-render-review

You can't look at a 3D model, but you can render it and read the image. The review loop is: render from fixed,
named viewpoints, read the images, fix, then render the **same** viewpoints again. Everything here comes from
[clerk-van](https://github.com/Jibaru/clerk-van) (`tools/render_turntable.py`, `tools/compare_sheet.py`,
`tools/encode_turntable.ps1`, `web/app.js`). The generalized, tested scripts are in `scripts/`.

**Versions:** Blender 4.2 (EEVEE Next is `BLENDER_EEVEE_NEXT`; the script falls back to `BLENDER_EEVEE`), ffmpeg 6+,
Node 18+ with `playwright-core` and the system Chrome.

## Rule: answer every visual complaint with a close-up, before and after

The user caught several "fixed" claims that weren't fixed. Each time the agent had looked at a wide shot, where
the problem was a few pixels. When the user flags a spot:
1. Render a **close-up of exactly that spot** with a named camera, before touching anything.
2. Fix it.
3. Render the **same** camera again, and show both side by side (`scripts/contact_sheet.py before.png after.png
   --cols 2`).
4. Only then say it's fixed, and show the pair.

```bash
blender --background model.blend --python scripts/lime_studio.py -- --out renders --mode shot \
  --name mirror_before --loc 3.0,-3.6,1.9 --target 1.05,-1.3,1.4 --res 1024x768
```

## The studio

`scripts/lime_studio.py` generalizes `tools/render_turntable.py`. It builds the studio around whatever `.blend` it
runs on, writes only images, and **never saves the .blend**. Each part exists for a reason:

- **World: exact colour for the camera, grey for lighting** (`render_turntable.py:38-68`). A Mix Shader driven
  by Light Path → **Is Camera Ray** sends camera rays to a Background at the exact colour, and everything else
  (reflections, bounce) to a neutral grey gradient. Without the split, a lime world tints white paint green.
- **Floor: exact colour where lit, darker only in real shadows** (`render_turntable.py:70-111`). A white Diffuse
  goes through Shader to RGB, then Map Range, then multiplies the background colour, emitted only for camera rays
  (grey diffuse for everything else). `calibrate_floor()` (`:114-144`) renders a 192×108 Raw EXR first, reads the
  lit value of the open floor, and sets the Map Range so open floor maps to exactly 1.0. Light falloff across the
  floor stays the exact colour, and only the model's shadow darkens it (down to 45%).
- **Colour management**: `view_transform = "Standard"`, `look = "None"`, `dither_intensity = 0`
  (`:205-209`). Filmic and AgX shift the background colour, and dither adds ±1 noise to it.
- **Lights**: a Sun key on the **camera side** (`(5.5, -7.5, 9)` with the camera at `(8.2, -9.2, 3.6)`), plus Fill, Rim
  and Top area lights (`:160-171`). Use a sun because it's uniform across the floor. Keep the key on the camera side when
  judging relief or panel lines, so the raised edges catch light toward you.
- **Rest pose**: every action is cleared and every NLA track muted before rendering (`:26-31`). Otherwise a clip whose strip
  has the default HOLD extrapolation leaves the doors open in the turntable. The rig build also sets strip
  extrapolation to `"NOTHING"` (`build_transit_van.py:661-663`).
- **Camera helper**: point any camera with a single quaternion.
  ```python
  def aim(loc, target):
      cam.location = loc
      cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
  ```
  Blender cameras look down −Z with +Y up, which is why it's `("-Z", "Y")`.

**Tested** on the shipped `export/clerk_van.blend` (Blender 4.2, 480×270, 8 samples). The floor calibration
read a lit value of 2.869, and `scripts/check_background.py --floor` found all 7 samples (four corners plus the
open floor strip) exactly `#7CFF00`. A 6-frame 320×180 turntable was exact on every checked frame too.
The `.blend`'s md5 was unchanged afterwards.

```bash
python scripts/check_background.py renders/shot_hero.png --bg 7CFF00 --floor
# ok    renders/shot_hero.png: 7 samples = #7CFF00
```

## Modes

| Mode | Repo (`render_turntable.py`) | `lime_studio.py` | Use for |
| --- | --- | --- | --- |
| `preview` | 6 views, 1280×720 | `--mode preview` | a first look after a build |
| `fit` | orthographic sideL/sideR 1800×800 ortho 6.6, front/rear 1000² ortho 2.6, top 800×1800 | `--mode fit --length --height --width` | checking livery placement panel by panel |
| `compare` | 8 views at 768×512, lens 45, distance 9.5, matching the reference grid | `--mode shot` per view, then `compare_sheet.py` | side by side with the user's references |
| `closeup` / `spots` | named cameras at 1024×768 | `--mode shot --name … --loc … --target …` | every spot the user flags |
| `turntable` | 120 frames, root Z 0→360° | `--mode turntable --frames 120 --root-object NAME` | the 360 video |
| `stills` | three heroes at 96 samples | `--mode shot` with `--samples 96` | the final images |

Keep the viewpoints **fixed and named**. A fix is only checked when the before and after come from the same camera.

## Compare sheets against references

Ask the user for real references: photos, product shots, a physical toy (a die-cast model in this project). Put them in a grid
image. `scripts/compare_sheet.py` (from `tools/compare_sheet.py`) puts each reference cell next to the render
from the same angle:

```bash
python scripts/compare_sheet.py --ref references/views.png --grid 4x3 --renders renders/compare \
  --cells r1c1_front34L=0,0 r1c2_front=0,1 r1c4_sideL=0,3 --out renders/compare_sheet.png
```

A missing render shows as a dark cell, which is a to-do list. Sheets with more than 4 rows are also split into
`_a`/`_b` halves, because one tall image is hard to read. **Tested** with the repo's `references/clerk-van-views.png`.

## Contact sheets

`scripts/contact_sheet.py` puts many images in one labelled grid, so one Read shows them all: every close-up of a
review round, every Nth turntable frame, before/after pairs. It's pure Pillow, so ffmpeg's `drawtext` font trouble
on Windows doesn't apply. It also expands globs itself, since Windows shells don't.

```bash
python scripts/contact_sheet.py "renders/turntable/frame_*.png" --cols 6 --tile 320x180 --out renders/sheet.png
```

## Turntable: seamless loop, encode, sentinel

The root's Z rotation is keyed 0° at frame 1 and 360° at frame **FRAMES + 1**, with linear interpolation, and
frames 1…FRAMES are rendered (`render_turntable.py:292-309`). The last frame therefore isn't a copy of the first,
and the loop doesn't stutter.

```bash
bash scripts/encode_turntable.sh renders/turntable renders/model_turntable 30
# -> model_turntable.mp4 (libx264, yuv420p, crf 18, +faststart) + .gif (palettegen/paletteuse) + ENCODE_DONE
```

These are the same encode settings as `tools/encode_turntable.ps1`. **The sentinel is the point.** A half-written mp4 once
got committed (`07a3657` "Turntable video re-added after encode finished"), because the file existed before the
encode ended. Run the encode with `run_in_background`, wait for the notification, and commit or upload only after
`ENCODE_DONE` exists. The script writes it only when both encodes exit 0. In the repo the sentinel was written by hand
into `renders/encode_log.txt`; the script makes it automatic. **Tested:** a 6-frame encode produced h264 yuv420p
with 6 frames, a 344 KB GIF and the sentinel.

## The web viewer, checked like a visitor

`scripts/web_check.mjs` serves a folder on a free port with a built-in static server that has the glTF/GLB MIME
types, so there's no `python -m http.server` to start and forget to stop. It opens the page in headless Chrome,
waits for the page's own "loaded" text, screenshots it, and fails on console errors, uncaught exceptions or HTTP ≥ 400:

```bash
npm i playwright-core
node scripts/web_check.mjs --dir web --wait-text "loaded" --out renders/web.png
# PASS http://127.0.0.1:60869/index.html -> renders/web.png
```

GLTFLoader needs http, so `file://` URLs fail. **Tested** against clerk-van's `web/`: it waited for `web/app.js`'s status
line ("clerk_van.glb loaded …", `app.js:122-125`), and the screenshot shows the rigged van and the control panel.
A wrong page fails cleanly with `FAIL … HTTP 404`. Headless WebGL is SwiftShader (software rendering), so this
proves the page works, not its frame rate.

## Done means

- [ ] Background and open floor are exactly the intended colour (`check_background.py --floor` passes).
- [ ] Every point the user raised has a before/after close-up pair from the same named camera, and you've read both.
- [ ] Compare sheet reviewed against every reference angle the user provided.
- [ ] Turntable encoded, `ENCODE_DONE` present before anything is committed or uploaded.
- [ ] The web viewer passes `web_check.mjs` with zero console errors, and its screenshot was read.
