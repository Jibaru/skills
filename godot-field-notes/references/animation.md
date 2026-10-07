# Animation (Godot 4.7)

## 1. Runtime retargeting across rig families

THE ONES retargets clips at runtime across Mixamo, Quaternius Universal Animation Library (UAL),
CC3 and Renderpeople skeletons (`scripts/actors/npc_retarget.gd`). The approach: a humanoid bone table,
working in global space, a per-bone delta from rest, an A-pose vs T-pose correction via the direction
to the child bone, and hips translation scaled by hip height. That's about 100 ms per model, cached.
The shared clip source was Quaternius UAL 1+2 (CC0). The free UAL has no wave, point, bow or laugh
clips, and those ended up procedural and stiff, so say that up front.

**The bug: `clean_name()` strips the `_NN` suffix first** (`npc_retarget.gd:79-85`):

```gdscript
static func clean_name(n: String) -> String:
	var re := RegEx.create_from_string("_\\d+$")
	n = re.sub(n, "")
	for p in ["mixamorig:", "mixamorig_", "CC_Base_"]:
		if n.begins_with(p):
			n = n.substr(p.length())
	return n
```

UAL's `spine_01`, `spine_02`, `spine_03` and `neck_01` become `spine` and `neck`, which match nothing.
**The spine and neck never animated** on two NPCs and the creatures. The symptoms were a "zombie walk
leans back instead of hunching", "arms trail", and "head pitch has no effect". The subagent blamed the weights,
then the axes, then the clip. What found it was listing the retargeted tracks:

```gdscript
for t in anim.get_track_count():
	print(anim.track_get_path(t))     # bones missing from this list = unmapped
```

The workaround in the project renames UAL bones and tracks to Mixamo names **before** mapping
(`scripts/actors/creature_retarget.gd:5-11`):

```gdscript
const UAL_TO_MIXAMO := {
	"pelvis": "Hips", "spine_01": "Spine", "spine_02": "Spine1", "spine_03": "Spine2",
	"neck_01": "Neck", "Head": "Head",
	# … arms, legs, fingers
}
```

The real fix (proposed, not in the repo): strip prefixes first, and spare UAL's numbered names:

```gdscript
static func clean_name(n: String) -> String:
	for p in ["mixamorig:", "mixamorig_", "CC_Base_"]:
		if n.begins_with(p):
			n = n.substr(p.length())
	if n in ["spine_01", "spine_02", "spine_03", "neck_01"]:
		return n
	return RegEx.create_from_string("_\\d+$").sub(n, "")   # only Sketchfab "_123" duplicates
```

If the models can go through the editor, prefer **import-time retargeting** (Import dock → Skeleton3D →
BoneMap with `SkeletonProfileHumanoid`). Code retargeting is for headless, code-built projects.

Licensing: Mixamo clips baked into a CC-BY Sketchfab model may still carry Mixamo's restrictions. Flag
this to the user.

## 2. Neutralise root motion with a SkeletonModifier3D

A monk's walk went in a circle, and actors drifted. Lock the root bone's horizontal position, keep the
vertical bob, and move the node yourself (`scripts/actors/root_lock.gd`):

```gdscript
class_name RootLock
extends SkeletonModifier3D
## Anula el desplazamiento horizontal del hueso raíz (root motion) para caminar en el lugar.
## El movimiento real lo hace el nodo padre.

var bone_name := ""
var _rest := Vector3.ZERO
var _ready_rest := false


func _process_modification() -> void:
	var sk := get_skeleton()
	if sk == null:
		return
	var i := sk.find_bone(bone_name)
	if i < 0:
		return
	if not _ready_rest:
		_rest = sk.get_bone_rest(i).origin
		_ready_rest = true
	var p := sk.get_bone_pose_position(i)
	sk.set_bone_pose_position(i, Vector3(_rest.x, p.y, _rest.z))
```

Usage: `var lock := RootLock.new(); lock.bone_name = ROOT_BONE; skeleton.add_child(lock)`. The root
bone names came from inspecting the GLB: `Reference_01_7` on the Sketchfab Labrador
(`scripts/actors/kuro.gd:8`), `mixamorig_Hips_2` on the cultist's Mixamo rig (`scripts/actors/cultist.gd:55`).

**4.7 API note:** the Godot 4.7 class reference marks `_process_modification()` **deprecated**. The
preferred override is `_process_modification_with_delta(delta: float)`, which "may be called … with
delta 0.0" right after the Skeleton3D initializes. The project's version still works. Write new
modifiers with the delta variant.

**Foot sliding.** Expose the walk speed in m/s at `play(1.0)`, scaled by height, and move the node at
`speed * walk_speed` (`scripts/actors/one_base.gd:239-245`):

```gdscript
## Velocidad (m/s) a la que hay que mover el nodo para que los pies no patinen, con play(speed).
var walk_speed: float:
	get:
		var g := _gaits()
		if not g.has(gait):
			return 0.0
		return float(g[gait][2]) * height / _nominal()
```

The user's complaint before this: *"el alien parece solo arrastrarse en lugar de caminar"* (the alien
looks like it's just dragging itself instead of walking).

## 3. Smaller lessons

- **`ERROR: Infinite loop detected. Check set_loops()`**: a looping tween created on the director, tweening
  a light that was later `queue_free()`d. Bind the tween to its target, so it dies with it:
  `var tw := l.create_tween().set_loops()` (`scripts/intro.gd:122`).
- **Props in hand** (*"las lámparas no están agarradas a las manos"*, the lanterns aren't held in the
  hands): attach to the hand bone with a `BoneAttachment3D`. A lantern on a bamboo pole is built from the grip:
  `grip = _hand.global_position`, `tip = grip + dir * POLE_LEN` (0.95 m), with a pendulum lantern
  hanging from the tip (`scripts/actors/cultist.gd:21, 28, 68-70, 150-157`).
- **Floating non-skinned sub-meshes** (claws, whiskers) in other poses: hide them by name, but check
  several poses first. On the Labrador the "white triangles" were texture-mask edges, not whiskers.
- **Zero-length clips** (`*_pose_01`, length 0.0) are single-frame poses. Don't use one as a looping idle.
  Pick a long one-off clip instead (`labrador_idle_one_off_smell_air_01`, 11 s).
- **Imported Sketchfab clips** are prefixed (`Armature|labrador_walk_fwd_01`), so match with
  `ends_with("|" + clip)`. Every imported clip has `loop_mode = 0`, so set looping in code per clip.
- **`Animation not found: ''`** means `play` was called with an unset gait. Guard it and fall back to idle.
- **Duck-typed actors with different `play()` signatures.** `Cultist.play(speed := 1.0)` called as
  `("talk", 1.0)` gives `Cannot convert argument 2 from String to float`. Route calls through a
  `safe_play()` that checks the signature.
- **Single-clip models**: use the rest pose or the one idle as a pose, plus procedural gait/IK layers.
