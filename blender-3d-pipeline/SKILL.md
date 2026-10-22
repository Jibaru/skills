---
name: blender-3d-pipeline
description: Plan and route a headless Blender 3D job — a realistic model of a real object (vehicle, product, prop) with a custom paint/livery, usable in Blender, Three.js and Godot, optionally 3D-printable. Decides asset vs hand-modelling vs AI generation, covers licences for downloaded models, official logo rasterisation, reference photos and compare sheets, Blender 4.2 API and Windows/Python gotchas, and hands off to the teardown, rig, livery, print and render-review skills. Use when the user says "make a 3D model of", "realistic model of a van/car", "put our logo on a model", "model it in Blender", "should I sculpt this", "generate a 3D model with AI", "3D print our van", or starts any multi-step Blender job.
metadata:
  author: Jibaru
  version: 1.0.0
---

# blender-3d-pipeline

This skill is the entry point. It decides the approach, gets the inputs right, and routes each stage to its
skill. The whole pipeline comes from the Clerk Van ([Jibaru/clerk-van](https://github.com/Jibaru/clerk-van)):
a real Ford Transit asset repainted in a Clerk livery, rigged for Three.js and Godot, rendered as a turntable,
and exported as a 1:24 STL with raised lettering. All of it runs headless and re-runnably from `tools/`.

## Route

| Stage | Skill | What it produces |
| --- | --- | --- |
| understand and clean the asset | `blender-asset-teardown` | inventory, metres, clutter gone, broken parts mirrored, holes patched |
| doors, wheels, lights, clips | `vehicle-rig-gltf` | named pivots, NLA clips, KHR lights; GLB proven by `glb_rig_report` |
| paint, logos, text, QR | `livery-atlas-painting` | metre-based livery atlas + box projection, from a profile JSON |
| check what it looks like | `blender-render-review` | studio renders, compare sheets, close-ups, turntable |
| 3D print | `print-ready-export` | watertight-enough STL, raised logos and letters, verified on the bytes |

Downloading, licences and credits for every asset are covered by `game-assets`. It has a Sketchfab source
and script, a licence policy and `CREDITS.md`. This skill only adds what's specific to realistic models.

## 1. Choose the approach: asset, hand-model, or generate

In the order that worked:

1. **A real, downloadable, permissively licensed asset that you repaint.** The user accepted this. A
   149k-triangle Sketchfab Transit (CC BY 4.0), cleaned and repainted, beat everything else.
2. **Hand-modelling**, only for what no asset provides.
3. **AI generation**, for silhouettes and blockouts only.

What the user rejected, and why:

- **Projecting photos onto the model**: "se ve horrible" (it looks horrible). Generate the livery as
  vectors in vehicle metres instead (`livery-atlas-painting`).
- **A fully procedural body** (`tools/build_van.py`: lofted sections, boolean wheel arches, bevels) looked
  toy-like ("no se ve realista", it doesn't look realistic). A procedural body needs real panel detail to pass.
- **An AI-generated body**: blob-like. Fine for silhouette, bad for panel lines.

### When to sculpt or box-model

The user once demanded it ("si tienes que esculpir miles de polígonos, está bien": if you have to sculpt
thousands of polygons, fine). `PLAN.md` laid out a subdivision box-model:

- a quad cage of about 3-5k quads with Mirror + SubSurf, lofted from master curves measured on the captures
- panel loops placed on the real seams
- windows, grille and lamps opened as **insets/loops in the cage, not booleans**, so SubSurf doesn't break
- wheels, mirrors, handles, hinges and interior reused from another asset (`tools/extract_parts.py`)

That plan was superseded the moment a real Transit asset turned up. Rules of thumb:

- **Vehicles, products, anything that exists:** look for a CC0/CC BY asset first, and repaint it.
- **Organic or unique shapes:** generate a blockout (Hunyuan3D, TripoSR), then retopologise.
- **Sculpt only the parts nothing provides**, and reuse the rest from assets.

## 2. Sourcing details specific to realistic models

General Sketchfab API use, licence filtering, red flags and credits are in
`game-assets/references/sketchfab.md` and `game-assets/references/sources.md`. Read those first. Added here:

- **Filter for downloadable.** Many good models are **Editorial** or simply not downloadable
  (a "Ford Transit Custom School Van" had no download button). Search with `features=downloadable`.
  Through the API: `https://api.sketchfab.com/v3/search?type=models&q=ford+transit&downloadable=true&count=24`.
- **Never extract a non-downloadable model** (viewer files like `model_file.binz`, or the viewer API). The
  session refused it as unauthorised, which is correct: it's the licensor's content, served for viewing only.
- **Downloads need the user's own login.** The user downloaded the zip
  (`ford-transit-with-light-bar.zip`) and extracted it to `references/transit/`. Git-ignore the zip and
  the source folder for **size**. CC BY allows redistribution with credit.
- **Free Standard is not redistributable.** Don't commit it to a public repo, including its textures. In
  the source project, `references/crafter/textures/` (27 files, about 4.7 MB) from the Free Standard
  "Volkswagen Crafter" **is committed to the public repo**, although its `.blend` and zip are ignored.
  Check `git ls-files` on every third-party folder, not just the `.gitignore`.
- **Blueprints:** there was no free blueprint for a 2015+ Transit. getoutlines.com sells vectors (about $24),
  and the-blueprints.com has older models. Ask the user for real photos and a physical reference instead
  (they supplied a die-cast toy photo, `references/target-diecast.png`).
- **Credit text** that went in the README and on the page:
  `"Ford Transit With Light Bar" by circlegent, CC BY 4.0, https://sketchfab.com/3d-models/aa98280d18014f3491fc528b6efdefe3`.

### AI generation (Hunyuan3D-2mv), measured

- Space `tencent/Hunyuan3D-2mv` (multi-view images → mesh) via `gradio_client`. The parameters used:
  50 steps, guidance 5, octree 512, seed 7, with four orthographic views from `references/views/`.
  Two runs took 29 s and 27 s and produced 38-39 MB GLBs (`references/gen/gen_jobs.log`).
- **Quota:** the free ZeroGPU allows two or three runs a day without a token. The textured mode failed with:
  `You have exceeded your ZeroGPU quota (135s requested vs. 129s left). Try again in 23:57:30. Authenticate with a Hugging Face token for more quota`.
- **Scale is arbitrary.** Measure on a metric grid before using the mesh: `tools/gen_measure.py` scales to
  target length, width and height (5.45 × 2.03 × 2.12 m), stretches only between the wheel arches, and
  renders orthographic views on a 0.5 m grid.

## 3. Brand assets: official, never redrawn

- Use the **official SVGs** from the brand's asset page (clerk.com/brand-assets). Never redraw a logo by hand.
- **Rasterise SVG with Chrome**, so the renderer is the browser's. `tools/rasterize_logos.js` does it
  with `playwright-core` and the system Chrome:
  - recolour by replacing hex strings in the SVG text (white versions for dark panels, a purple-text
    version for the white hood)
  - read the size from `viewBox`
  - `page.setContent(svg)`, then `page.screenshot({ omitBackground: true })` at 3000 px wide for the
    lockup and 1200 px for the symbol
- **Fonts:** take OFL fonts from the source (Inter from https://github.com/rsms/inter). Bold for headlines,
  SemiBold for copy, Medium for footnotes.

## 4. References and the compare sheet

Ask the user for real photos from several angles, plus a physical reference if one exists. Build a
**compare sheet** that puts each reference cell next to your render from the same angle.
`tools/compare_sheet.py` maps render names to cells of a 4×3 reference grid
(`"r1c2_front": (0, 1)`, …) and composites them with PIL. Iterate until the user accepts the sheet. The
renders come from `blender-render-review` in `compare` mode.

## 5. Environment: Blender 4.2 and Windows

Checked on Blender **4.2.19 LTS** (bundled Python 3.11.7):

- **The bundled Python has numpy (1.24.3) but no `cv2` and no `PIL`.** Do OpenCV and Pillow work (atlas
  generation, contour vectorising, QR verification) in a **system-Python step that writes JSON or PNG**,
  then read the result inside Blender. That's the clerk-van split: `gen_textures.py` and `print_mask_polys.py`
  run in system Python, `build_*` in Blender.
- **System Python on Windows:** find a real interpreter with `py -0p` (Python 3.13 and 3.10 here), and
  ignore the Microsoft Store `python.exe` stub, which hangs (see `godot-field-notes/references/windows-agent.md`).
  The clerk-van README lists `Pillow`, `qrcode`, `numpy`, `opencv-python-headless` and `gradio_client`. Install
  them into a venv rather than assuming they exist: on this machine Python 3.13 had **no** `qrcode`. Never run the
  generator with `python -I`, because it needs site-packages. **Do** use `-I` for untrusted downloaded scripts.
- **Which Blender:** call `"C:/Program Files/Blender Foundation/Blender 4.2/blender.exe"` by full path. A
  `Blender 4.4` folder on this machine has no `blender.exe` in it.
- **API names that differ from older docs:**
  - Mesh to Volume inputs are `Mesh, Density, Voxel Size, Voxel Amount, Interior Band Width`, with
    `resolution_mode` `VOXEL_AMOUNT`/`VOXEL_SIZE`.
  - Volume to Mesh inputs are `Volume, Voxel Size, Voxel Amount, Threshold, Adaptivity`, with
    `resolution_mode` `GRID`/`VOXEL_AMOUNT`/`VOXEL_SIZE`.
  - `wm.stl_export` takes `filepath, ascii_format, export_selected_objects, global_scale, forward_axis, up_axis, apply_modifiers`.
  - Principled has `Coat Weight`, `Coat Roughness`, `Emission Color` and `Emission Strength`. Guard with
    `try/except KeyError` for older versions, as `build_transit_van.py`'s `new_mat` does.
  - `material.surface_render_method` (`BLENDED`/`DITHERED`) replaces `blend_method`.
  - The render engine is `BLENDER_EEVEE_NEXT`. `tools/inspect_transit.py` falls back to `BLENDER_EEVEE` for older builds.
- **Module-level scripts:** a temporary named like a helper (`parent`, `key`) shadows it, giving
  `'list' object is not callable`. Prefix temporaries (`uf_par`).
- **Editing files from a shell:** backslashes don't survive heredocs (a `\b` became a backspace byte, and
  `\n` in JS became real newlines). Use the Write/Edit tools (`shell-safe-patching`). The repo's files are
  CRLF, so preserve that with `newline=""` in Python reads and writes.
- **Publishing on GitHub Pages:** keep each artefact under 50 MB (warning) and 100 MB (hard limit), and
  git-ignore source zips, regenerable .blend files and AI outputs. To verify a deploy, poll the live file's
  `Content-Length` until it equals the local size: the Pages run list can show the previous run as
  completed before the new one starts.

## 6. Re-runnable by construction

Every step is a script with arguments. The source project's full rebuild:

```text
python tools/gen_textures.py --profile transit                    -> livery atlas (4096 px) + relief masks
python tools/print_mask_polys.py --profile transit                -> relief outlines (OpenCV) as JSON
blender --background --python tools/build_transit_van.py -- <root>  -> export/clerk_van.glb/.blend
blender --background export/clerk_van.blend --python tools/render_turntable.py -- <root> turntable 120
powershell tools/encode_turntable.ps1                             -> mp4 + gif
blender --background export/clerk_van.blend --python tools/build_print_van.py -- <root> 15 24
```

Every user correction became a **profile edit** (`tools/profiles/transit.json`), never a code change. That
keeps a 30-round feedback loop cheap. Never fix a model by hand in the UI: the next rebuild erases the fix.

## Done means

- [ ] The approach (asset / hand-model / generate) is chosen for a stated reason, and the asset's licence allows the use.
- [ ] Every third-party file in the repo passes `git ls-files` review against its licence.
- [ ] The pipeline rebuilds from scripts and a profile with no manual Blender steps.
- [ ] Each stage's own "Done means" in the routed skill is met.
