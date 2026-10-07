---
name: godot-field-notes
description: Field-tested fixes for Godot 4.x projects built by an agent — shader colours or thresholds wrong (source_color linear space), transparent materials losing shadows, black unshaded screens, fog washing out the sky, "Cannot infer the type of variable", cascade compile errors, models facing backwards or rigs left-right swapped, spine/neck not animating after retargeting, root motion drift, textures without mipmaps in code-built projects, exporting Windows and macOS (universal, ad-hoc signed) from Windows without the editor, fullscreen-by-default display settings, and Godot on Windows hanging or running out of memory. Use when any of these symptoms appear, before writing a .gdshader, retargeting animations, exporting, or running Godot headless on Windows.
metadata:
  author: Jibaru
  version: 1.0.0
---

# godot-field-notes

Notes from building and shipping **THE ONES**, a first-person 3D horror game in **Godot 4.7.2**
(Forward+, code-built scenes, no editor GUI, Windows host). The project has ~35 `.gdshader`
files, runtime retargeting across four rig families, a 24k-tree procedural forest, and Windows
plus macOS releases. Each entry is a failure that cost real time, with the fix that worked. Code is
quoted from the project (`crafter-games/the-ones`, private), cited as `file:line`. Items that
were session techniques and never committed are labelled as such.

Read the reference for the symptom in front of you. Each one is self-contained:

| Symptom | Read |
| --- | --- |
| Colours too dark, thresholds/masks select the wrong pixels, recolour blotchy | `references/shaders.md` §1 |
| A bug survives two parameter tweaks | `references/shaders.md` §2 (visualise intermediates) |
| Cut-out foliage/cloth lost its shadows, sorting artefacts | `references/shaders.md` §3 |
| `render_mode unshaded` surface renders black | `references/shaders.md` §4 |
| Full-screen post-process too blurry, swallows clicks, filters the UI | `references/shaders.md` §5 |
| Custom sky disappears or fog is brighter than the sky | `references/shaders.md` §6 |
| A shadow/silhouette must be the real animated model | `references/shaders.md` §7 |
| Render-to-texture (TV screen, clip with its own lights, reflection, offline bake) | `references/rendering.md` §1 |
| Something visible only through one camera | `references/rendering.md` §2 |
| CSG holes have the wrong material | `references/rendering.md` §3 |
| Big world at 19–60 fps, shadows or overdraw | `references/rendering.md` §4 |
| Textures in code-built materials shimmer, no mipmaps, huge VRAM | `references/rendering.md` §5 |
| Model faces backwards, `!is_inside_tree()` transform errors, skinned AABB wrong | `references/rendering.md` §6 |
| Night scene unreadable | `references/rendering.md` §7 |
| Retargeted clips: spine/neck don't move, arms trail | `references/animation.md` §1 |
| Character drifts or walks in a circle (root motion), feet slide | `references/animation.md` §2 |
| "Infinite loop detected. Check set_loops()", props not held, zero-length clips | `references/animation.md` §3 |
| `Cannot infer the type of "x" variable` | `references/gdscript.md` §1 |
| "Failed to compile depended scripts", "Could not resolve class" | `references/gdscript.md` §2 |
| Windows .exe / macOS .app export from the command line | `references/export.md` |
| Open fullscreen by default + window/resolution settings | `references/display-settings.md` |
| Godot/python/heredoc/`/tmp`/zip problems on a Windows agent | `references/windows-agent.md` |

## Three rules that would have saved the most time

1. **One Godot process at a time** on a laptop. A heavy scene is ~600 MB of VRAM per instance.
   Parallel playtests, exports or `--write-movie` runs got the background job OOM-killed with nothing
   left in its output. See `references/windows-agent.md` W13.
2. **Engine messages are localized** to the OS language ("No se puede exportar…"). Grep the English
   prefixes `ERROR:`, `WARNING:`, `SCRIPT ERROR:`, `Parse Error:`, never the message text.
3. **When a visual bug survives two tweaks, stop tuning and render the intermediate values as
   colour.** Three blind iterations on the dog coat failed. Painting the masks as RGB found the bug in
   one screenshot (`references/shaders.md` §2).

## Corrections to the gamedev-skills pack

The `godot-*` skills from `gamedev-skills/awesome-gamedev-agent-skills` are third-party and get
reinstalled over local edits, so they're not modified here. These statements in them are wrong or
incomplete for Godot 4.7, and the notes above take precedence:

- **W1 `godot-shaders`, "transparency needs opt-in (3D)"**: in a spatial `ShaderMaterial`,
  **writing `ALPHA` is the opt-in**. It moves the material to the transparent pipeline (sorted, no
  shadow casting, absent from screen/depth textures, per the spatial shader reference). For
  cut-outs write `ALPHA` **and** `ALPHA_SCISSOR_THRESHOLD`.
- **W2 `godot-shaders`, "discard is costly… prefer ALPHA"**: misleading in 3D, where `ALPHA` alone
  costs the shadows. Prefer `ALPHA_SCISSOR_THRESHOLD` in spatial shaders. The advice still applies to `canvas_item`.
- **W3 `godot-shaders`, "colour uniforms without source_color look wrong"**: half the story. *With*
  `source_color` the shader receives **linear** values. Thresholds written against colour-picker
  numbers, and small hand-typed sRGB constants, come out wrong (`references/shaders.md` §1).
- **W4 `godot-export` references, "`--quit-after <frames|seconds>`"**: it's main-loop **iterations**
  (frames). The command-line reference says "Quit after the given number of iterations".
- **W5 `godot-export`, macOS "requires signing/notarization; unsigned blocked"**: the free ad-hoc
  route works from Windows (`codesign/codesign=1`). Universal/arm64 refuse to export unless
  `import_etc2_astc=true` (`references/export.md` §2).
- **W6 `godot-export` example preset "Linux/X11"**: the 4.x platform is `Linux`. Use the exact
  `name=` from `export_presets.cfg`.
- **W7 `gamedev` Stage 4 Godot row**: omitted `godot-shaders`, `godot-audio`, `godot-resources`, `godot-multiplayer`.
  THE ONES wrote ~35 shaders without loading a shader skill.
- **W8 `godot-export` preset example**: no `binary_format/embed_pck`, no `texture_format/*` keys.
- **W9 `godot-3d-essentials` / `godot-animation`**: nothing on glTF characters facing **+Z** while
  `look_at()` aims **−Z** by default (`references/rendering.md` §6).
