# Godot 4: after the download

The steps from "the GLB is on disk" to "it looks right in the game". Everything here comes from THE
ONES (Godot 4.7.2, a code-built, headless-driven project). Run Godot one process at a time: two
instances ran that machine out of memory.

## Always, after any asset batch: fix texture imports (C3)

Headless `--import` **never runs the editor's "detect 3D" pass**. Textures loaded from code, or
extracted next to a GLB (`gltf/embedded_image_handling=1`, the default for Sketchfab imports), stay
**lossless with no mipmaps**. That means shimmer at distance, VRAM bloat, and normal maps treated as
colour. THE ONES fixed this with hand-written `sed` lines copied into subagent prompts. Those only
matched `*.jpg.import`, and subagents didn't always run them, so 339 of its 409 texture `.import`
files still needed the fix. Make it one script and one step:

```bash
godot --headless --path . --import                                   # creates the .import files
node <skill>/scripts/fix_texture_imports.mjs --dry                   # what would change
node <skill>/scripts/fix_texture_imports.mjs                         # VRAM-compressed + mipmaps + normal_map flag
godot --headless --path . --import                                   # re-import with the new settings
```

It walks `assets/textures` and `assets/models` (or the dirs you pass). It only touches
`importer="texture"`, leaving 2D/UI importers set on purpose alone. It sets `compress/mode=2`,
`mipmaps/generate=true` and `detect_3d/compress_to=0`, and adds `compress/normal_map=1` for names
matching `nor_gl|normalgl|_normal|_nrm|_nor|_n.`. It's idempotent.

Related:

- `nor_gl` maps (OpenGL convention: Poly Haven, ambientCG) match Godot with
  `process/normal_map_invert_y=false`. `nor_dx` needs `true`.
- Alpha cut-outs need **PNG**. A fern downloaded as JPG lost its alpha and rendered black.
- Put a `.gdignore` in `assets/source/` (`assets.mjs get --raw` does it) and in
  `playtest/screenshots/`, so Godot doesn't import raws and screenshots.
- macOS universal and arm64 exports need `[rendering] textures/vram_compression/import_etc2_astc=true`
  and a full re-import.
- A credits screen that reads `CREDITS.md` needs `include_filter="CREDITS.md, assets/credits.json"`
  in `export_presets.cfg`.
- **Exclude unused and restricted models from the export.** Godot exports every resource in
  `res://` by default. THE ONES excluded `assets/source/*` but still shipped `alien_bossdeff`
  (Free Standard) and the unused `dog_shiba`. `assets.mjs audit` lists both kinds.

## C1: inspect a GLB headlessly before writing code for it

```bash
cp <skill>/scripts/glb_inspect.gd devtools/_glb_inspect.gd      # must be inside the project for res://
godot --headless --path . --import
godot --headless --path . -s res://devtools/_glb_inspect.gd -- res://assets/models/dog_lab107/dog_lab107.glb
rm devtools/_glb_inspect.gd devtools/_glb_inspect.gd.uid
```

It prints each skeleton (bone count plus the first 14 bones, where the root-bone candidate is),
each mesh (skinned or not, AABB size), each material (albedo, normal, transparency) and each clip
(length, loop mode, track count). The session's first version had `quit()` inside the loop and only
ever printed one model; this one doesn't.

To see the textures and materials without Godot (for UV islands before a recolour):

```bash
node <skill>/scripts/glb_textures.mjs assets/models/dog_lab107/dog_lab107.glb review/tex
# materials: 0:Coat baseColorTex=0 normalTex=-  1:Labrador_Retriever_Whiskers.002 baseColorTex=- normalTex=-
# image 0 (unnamed) -> review/tex/dog_lab107_img0.png      (1.9 MB of a 48 MB GLB: the rest is animation)
```

## C2: Sketchfab GLB facts

- **Clip names are prefixed** with the armature (`Armature|labrador_walk_fwd_01`). Match with
  `ends_with("|" + clip)`.
- **Every imported clip has `loop_mode = 0`.** Set looping in code, per clip. THE ONES keeps a
  `CLIPS := {public_name: [clip, speed, loop]}` table in `scripts/actors/kuro.gd`.
- **`*_pose_01` clips have length 0.0.** They're single-frame poses (`idle_rest_pose_01`,
  `idle_sit_pose_01`, `sneak_pose_01`) and useless as loops. Use the `idle_to_*` transitions, or a
  long one-off as the idle (`labrador_idle_one_off_smell_air_01`, 11 s).
- **Root motion:** find the root bone in the bone list (`Reference_01_7` on the Labrador,
  `Root_M_01` on the pitbull it replaced) and neutralise it with a `SkeletonModifier3D` that keeps the vertical
  bob (`scripts/actors/root_lock.gd`).
- **Scale and origin are arbitrary** (the Shiba imported with a 34×83×114 AABB). Fit by bone
  positions after waiting 2 frames (`actor_util.gd` `fit()`), not by mesh AABB, because skinned
  AABBs are the rest pose.
- **Stray non-skinned meshes** (the earlier pitbull model's claws, `Object_17`) float in other poses. Hide them by
  name, but inspect several poses first. On the Labrador the "white triangles" were texture-mask
  edges, not whiskers, and its `HIDE_MESHES` ended up empty.
- **Meshes with no albedo texture** (whiskers) must be skipped by any recolour loop.
- **Size:** the Labrador GLB is 48 MB, almost all of it animation (the texture is 1.9 MB). Check
  `archives.glb.size` in the search results, and consider dropping unused clips in Blender (THE ONES
  builds came out around 490 MB).

## C4: recolour shader instead of a worse model

The pattern used to turn a cream Labrador black while keeping the mouth and eyes (full file:
`shaders/dog_coat.gdshader` in THE ONES):

1. Dump the texture (`glb_textures.mjs`) and look at the UV islands.
2. Build a `ShaderMaterial` whose `source_tex` is the original `albedo_texture`, and apply it per
   surface with `set_surface_override_material(s, mat)` (skip surfaces with no texture).
3. **Measure thresholds in sRGB.** `uniform sampler2D source_tex : source_color` linearises on
   sampling (sRGB 0.5 arrives as about 0.21), so thresholds picked from an image editor flag nearly
   everything as dark. That's what made the first attempt blotchy.

```glsl
uniform sampler2D source_tex : source_color, filter_linear_mipmap, repeat_enable;

void fragment() {
    vec3 c  = texture(source_tex, UV).rgb;                 // LINEAR (because of source_color)
    vec3 cs = pow(c, vec3(1.0 / 2.2));                     // what an image editor shows
    float l = dot(cs, vec3(0.299, 0.587, 0.114));          // thresholds now match picker values
    float pink = smoothstep(0.16, 0.26, cs.r - cs.g) * smoothstep(0.2, 0.3, cs.r - cs.b);
    // inside the mouth UV rects keep only very light pixels (teeth) or pink (tongue/gums)
    // float keep = max(pink, mouth * smoothstep(0.8, 0.88, l));
    float dark_src = 1.0 - smoothstep(0.18, 0.32, l);      // already-dark areas: keep and darken
    // fur detail from a mip high-pass, so the recolour doesn't look rubbery
    float lb = dot(pow(textureLod(source_tex, UV, 3.5).rgb, vec3(1.0 / 2.2)), vec3(0.299, 0.587, 0.114));
    // float hair = clamp((l - lb) * hair_gain, -1.0, 1.0); fur *= 1.0 + hair * 0.9;
    // ALBEDO = mix(fur, c, keep);                         // output stays linear: mix with c, not cs
    // anti-plastic: SPECULAR = mix(0.22, 0.5, keep); RIM ≈ 0.22; RIM_TINT = 0.8
}
```

- For the eyeball use a tight UV circle (`step(distance(UV, eye.xy), eye.z)`) rather than a rect.
  The rect caught stray fur triangles at island edges.
- **Debug by painting the masks.** After three blind tuning rounds, temporarily setting
  `ALBEDO = vec3(keep, d, dark_src)` (R = keep, G = fur detail, B = dark source) and taking one
  screenshot found the bug in about 2 minutes. Back up the shader first, restore it in the same
  command, and never commit the debug line.

Rule: when a visual bug survives two parameter tweaks, stop tuning and visualise the intermediates.

## C5: retargeting shared animations

THE ONES used the **Quaternius Universal Animation Library 1+2** (CC0, itch.io) as its shared clip
source. It was retargeted at runtime to Mixamo, Quaternius, CC3 and Renderpeople skeletons by
renaming bones to Mixamo names (about 100 ms per model, cached).

**Bug to know about:** `npc_retarget.gd` `clean_name()` strips a trailing `_\d+` **before**
removing prefixes. So UAL `spine_01/02/03` and `neck_01` collapse to `spine` and `neck`, match
nothing, and **the spine and neck never animate**. The symptoms were "zombie walk leans back instead
of hunching", "arms trail" and "head pitch has no effect". A subagent blamed weights, then axes,
then the clip. What found it was listing the retargeted tracks: missing bones are unmapped bones.

```gdscript
for t in anim.get_track_count(): print(anim.track_get_path(t))
```

The workaround in `creature_retarget.gd` renames UAL bones to Mixamo names (`spine_01` → `Spine`,
`spine_02` → `Spine1`, `spine_03` → `Spine2`, `neck_01` → `Neck`) before mapping. The real fix is to
keep the UAL names:

```gdscript
static func clean_name(n: String) -> String:
	for p in ["mixamorig:", "mixamorig_", "CC_Base_"]:
		if n.begins_with(p): n = n.substr(p.length())
	if n in ["spine_01", "spine_02", "spine_03", "neck_01"]: return n
	return RegEx.create_from_string("_\\d+$").sub(n, "")   # strip only Sketchfab "_123" duplicates
```

If models go through the editor, prefer Godot's **import-time** retargeting (Import dock →
Skeleton3D → BoneMap with `SkeletonProfileHumanoid`). Code retargeting is for headless, code-built
projects.

Say up front: the free UAL has no wave, point, bow or laugh clips. In THE ONES those ended up
procedural and stiff. Mixamo clips baked into a CC BY Sketchfab model may still carry Mixamo's
terms, so flag it to the user.
