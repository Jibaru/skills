# Rendering and 3D (Godot 4.7, Forward+)

## 1. SubViewport render-to-texture: four patterns

**CRT TV showing 2D content.** A 640×480 SubViewport with `UPDATE_ALWAYS`, Controls as children,
and `vp.get_texture()` passed into the screen's ShaderMaterial (`scripts/media.gd:69-72` and on):

```gdscript
_tv_vp = SubViewport.new()
_tv_vp.size = Vector2i(640, 480)
_tv_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
add_child(_tv_vp)
var bg := ColorRect.new()
bg.color = Color(0.05, 0.1, 0.22)
bg.size = Vector2(640, 480)
_tv_vp.add_child(bg)
```

**A separate 3D set** (a found-footage clip shown on the TV). Use `own_world_3d = true` so the
clip's lights and fog don't touch the house, and only render while it plays
(`scripts/news/news_clip.gd:39-44, 56-68`):

```gdscript
vp3d = SubViewport.new()
vp3d.size = VP3D
vp3d.own_world_3d = true
vp3d.msaa_3d = Viewport.MSAA_DISABLED
vp3d.positional_shadow_atlas_size = 2048
vp3d.render_target_update_mode = SubViewport.UPDATE_DISABLED
# start(): vp3d.render_target_update_mode = SubViewport.UPDATE_ALWAYS
# stop():  vp3d.render_target_update_mode = SubViewport.UPDATE_DISABLED
```

**A "reflection" in dark TV glass.** The SubViewport *shares* the world and gets its own camera
with a duplicated, brightened environment, so a dim figure reads. The figure lives on a layer only that
camera sees (`scripts/night4.gd:379-406`):

```gdscript
_refl_vp = SubViewport.new()
_refl_vp.size = Vector2i(480, 360)
_refl_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
add_child(_refl_vp)
_refl_cam = Camera3D.new()
_refl_cam.fov = 46.0
var renv: Environment = world.env.duplicate()
renv.tonemap_exposure = 4.5
renv.ambient_light_energy = 1.4
renv.volumetric_fog_density = 0.004
_refl_cam.environment = renv
_refl_vp.add_child(_refl_cam)
# … spawn the figure, wait 3 frames for its model, move its VisualInstance3Ds to GRAY_LAYER,
player.camera.cull_mask &= ~GRAY_LAYER
```

One bug here: the reflection was enabled before its viewport existed. Create it, wait a frame, then assign the texture.

**Offline bakes** (impostor textures, aged photos). Run as a mode of a preview scene:
`godot --path . res://scenes/veg_preview.tscn -- --veg-bake`. It renders, waits
`await RenderingServer.frame_post_draw`, then
`img.save_png(ProjectSettings.globalize_path(path))` (`scripts/veg_preview.gd:5, 16, 93, 135-140`). This needs a
window and GPU, not `--headless`.

## 2. Visual layers as gameplay

"Only visible through the camcorder" (`scripts/vhs/vhs_camera.gd:12, 85-94, 197-199, 245-247`):

```gdscript
const SECRET_LAYER := 1 << 10        ## capa de render 11: solo visible con la cámara levantada

static func _secretize(n: Node) -> void:
	if n is VisualInstance3D and not (n is Light3D or n is ReflectionProbe or n is VoxelGI):
		(n as VisualInstance3D).layers = SECRET_LAYER
		if n is GeometryInstance3D:
			(n as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if not n.has_meta(&"vhs_secret"):
		n.set_meta(&"vhs_secret", true)
		n.child_entered_tree.connect(func(c: Node) -> void: VhsCamera._secretize(c))
	for c in n.get_children():
		_secretize(c)

func _on_node_added(n: Node) -> void:            # connected to get_tree().node_added
	if n is Camera3D and player and n != player.camera:
		(n as Camera3D).cull_mask &= ~SECRET_LAYER
# raise the camcorder: player.camera.cull_mask |= SECRET_LAYER ; lower: &= ~SECRET_LAYER
```

- **Skip lights.** A Light3D's `layers` hides the *light itself*.
- **Turn shadows off.** A shadow would give the hidden thing away.
- **Re-secretize late children** via `child_entered_tree`. Models are built deferred.
- **Light only the secret creature** with `light.light_cull_mask = layer`.

## 3. CSG holes take the hole's material

Faces created by a `CSGBox3D` with `OPERATION_SUBTRACTION` take **that box's** material. The house's
interior walls came out white because the hollowing box had none. Pass a material on every hole
(`scripts/world.gd:552-558, 291-293`):

```gdscript
func _csg_hole(parent: CSGCombiner3D, minv: Vector3, maxv: Vector3, mat: Material = null) -> void:
	var h := CSGBox3D.new()
	h.operation = CSGShape3D.OPERATION_SUBTRACTION
	h.size = maxv - minv
	h.position = (minv + maxv) * 0.5
	h.material = mat
	parent.add_child(h)

_csg_hole(walls, Vector3(-7.3, -0.2, -18.3), Vector3(7.3, 3.6, -9.7), plaster_in)   # interior: plaster
_csg_hole(walls, Vector3(-7.0, 0.45, -9.8), Vector3(2.0, 2.45, -9.2), dark)          # shoji opening
```

## 4. Big procedural worlds

24k cedar trees plus grass and pebbles on an RTX 4060 laptop. What moved it from **19–62 fps to
125–165 fps** in daylight:

- **Chunked MultiMesh.** One MultiMesh has one AABB and never culls, so the world is split into one
  `MultiMeshInstance3D` per 40 m cell per LOD (`scripts/vegetation.gd:48`, `CHUNK := 40.0`).
- **LOD by `visibility_range`** per MMI: detailed up to 45 m, big branches 45–110 m, a 6-triangle baked impostor
  beyond (`LOD0_END := 45.0`, `LOD1_END := 110.0`, lines 49-50). Fade with
  `visibility_range_end_margin` + `VISIBILITY_RANGE_FADE_SELF` (lines 826-830).
- **Shadows were 7.7M of 9.8M primitives** with a low sun. Real shadows come only from cards within
  28 m (`SHADOW_NEAR := 28.0`). Beyond that, an opaque proxy with
  `SHADOW_CASTING_SETTING_SHADOWS_ONLY` (line 832).
- **Overdraw, not triangles, capped daytime views at ~60 fps.** Alpha cards stack, so use fewer, wider cards
  and a higher alpha cut.
- **Collision** cylinders only inside the playable radius.

Profile per layer, toggling one thing at a time (`scripts/veg_preview.gd:78-84`):

```gdscript
func stats() -> String:
	return "fps=%d prims=%d draws=%d objs=%d vram=%dMB" % [
		Engine.get_frames_per_second(),
		Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576]
```

FPS is a one-second average, so wait at least 1.5 s after a toggle. At the monitor's refresh cap, trust primitives and
draw calls over fps. A silent hang turned out to be a `while` loop that never incremented. Stdout looked
buffered, so time each step with `printerr()` (stderr is unbuffered) and wrap headless runs in `timeout N`.

## 5. Textures in code-built materials need fixed `.import` files

The editor's *detect 3D* pass only runs when the **editor** sees a texture used in 3D. A code-built
project imported with `--headless --import` never triggers it. Textures loaded from code, or extracted
next to a GLB, stay **lossless with no mipmaps** (shimmer, VRAM bloat), and normal maps are treated as
colour. At the end of THE ONES, 280 texture `.import` files under `assets/textures` and
`assets/models` still had `compress/mode=0`, because a jpg-only `sed` missed the PNGs.

What a correct 3D texture import looks like (`assets/textures/asphalt_02/asphalt_02_ao_1k.jpg.import`):

```ini
compress/mode=2
compress/normal_map=0
mipmaps/generate=true
process/normal_map_invert_y=false
detect_3d/compress_to=0
```

Fix every `importer="texture"` file, PNG **and** JPG. Set `compress/normal_map=1` for normal maps, then
re-import with `godot --headless --path . --import`. The `game-assets` skill ships a script for this
(`fix_texture_imports.mjs`, with `--dry`).

- `nor_gl` maps (OpenGL convention: Poly Haven, ambientCG) match Godot with
  `process/normal_map_invert_y=false`. `nor_dx` maps need `true`.
- Alpha cut-outs need PNG. A fern downloaded as JPG lost its alpha and rendered black.

## 6. Orientation, transforms, measuring

- **glTF characters face +Z; `look_at()` aims −Z by default.** Per the `Node3D.look_at` docs,
  `use_model_front = true` treats +Z ("asset front") as forward. Use `look_at(target, Vector3.UP, true)`,
  or `rotation.y += PI` once. One model "faced −Z, every shot showed its back". An auto-rigged model
  came out left/right swapped with its feet backward, so rotate the mesh 180° **before** auto-rigging.
- **`global_*` only works after `add_child`.** Otherwise you get
  `ERROR: Condition "!is_inside_tree()" is true. Returning: Transform3D()` (21 occurrences across the
  session) and `Cannot get path of node as it is not in a scene tree`. Set `position` before adding,
  `global_position` after.
- **Skinned mesh AABBs are the rest pose.** Fit by bone positions after waiting 2 frames
  (`scripts/actors/actor_util.gd:20-30`):

  ```gdscript
  static func bounds(n: Node) -> AABB:
  	var pts: Array[Vector3] = []
  	for sk in n.find_children("*", "Skeleton3D", true, false):
  		var s := sk as Skeleton3D
  		for b in s.get_bone_count():
  			pts.append(s.global_transform * s.get_bone_global_pose(b).origin)
  	if pts.size() > 2:
  		var box := AABB(pts[0], Vector3.ZERO)
  		for p in pts:
  			box = box.expand(p)
  		return box.grow(box.size.y * 0.06)
  	# … falls back to merging VisualInstance3D AABBs
  ```

- **Apply rotation before measuring.** A fit that rotated after positioning shifted the TV and radio.

## 7. Night lighting checklist

- Ambient `Color(0.10, 0.13, 0.18)` at energy 0.55 (`scripts/world.gd:656-657`), or silhouettes vanish.
- Set the moon light's direction from the visible moon (`moon_dir`, see `shaders.md` §6).
- `light_volumetric_fog_energy` on lamps and the flashlight (0.7 on the flashlight, 1.5–4 on lanterns
  and beams in the project).
- A lantern shouldn't cast shadows from its own paper mesh.
- Volumetric fog resolution: `environment/volumetric_fog/volume_size=96` and
  `volume_depth=96` in `project.godot`.
