extends SceneTree
## Inspect imported glTF/GLB models headlessly: skeletons (first bones = root-bone candidates),
## meshes (skinned or not, AABB), materials (albedo/normal/transparency), clips (length, loop, tracks).
##
## Must live inside the project (res:// paths), so copy it in, run it, delete it and its .uid:
##   cp <skill>/scripts/glb_inspect.gd devtools/_glb_inspect.gd
##   godot --headless --path . --import
##   godot --headless --path . -s res://devtools/_glb_inspect.gd -- res://assets/models/dog/dog.glb [more.glb]
##   rm devtools/_glb_inspect.gd devtools/_glb_inspect.gd.uid
##
## From the THE ONES session (tested on a 116-bone Sketchfab Labrador with 107 clips).
func _init() -> void:
	for p in OS.get_cmdline_user_args():
		var ps := load(p) as PackedScene
		if ps == null:
			print("!! cannot load ", p, " (run --import first)")
			continue
		var n := ps.instantiate()
		print("== ", p)
		for sk in n.find_children("*", "Skeleton3D", true, false):
			var s := sk as Skeleton3D
			var names := PackedStringArray()
			for b in mini(s.get_bone_count(), 14):
				names.append(s.get_bone_name(b))
			print("  skeleton ", s.name, " bones=", s.get_bone_count(), " first: ", ", ".join(names))
		for mi in n.find_children("*", "MeshInstance3D", true, false):
			var m := mi as MeshInstance3D
			if m.mesh == null:
				print("  mesh ", m.name, " (no mesh resource)")
				continue
			var skinned := m.skin != null or not m.skeleton.is_empty()
			print("  mesh ", m.name, " surfaces=", m.mesh.get_surface_count(), " skinned=", skinned, " aabb=", m.get_aabb().size)
			for si in m.mesh.get_surface_count():
				var mat := m.mesh.surface_get_material(si)
				if mat is BaseMaterial3D:
					var bm := mat as BaseMaterial3D
					print("    mat ", bm.resource_name, " albedo_tex=", bm.albedo_texture != null, " normal_tex=", bm.normal_texture != null, " transparency=", bm.transparency)
		for a in n.find_children("*", "AnimationPlayer", true, false):
			var ap := a as AnimationPlayer
			var clips := ap.get_animation_list()
			print("  clips ", clips.size())
			for c in clips:
				var an := ap.get_animation(c)
				print("    ", c, "  len=", snappedf(an.length, 0.01), "s loop=", an.loop_mode, "  tracks=", an.get_track_count())
		n.free()
	quit()
