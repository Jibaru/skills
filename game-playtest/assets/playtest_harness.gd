# playtest_harness.gd — scripted playtest for a Godot 4 project.
#
# Run as the main loop, so the project itself is never modified:
#   godot --path <project> -s res://playtest/playtest_harness.gd -- --playtest=<script.json> --out=<dir>
#
# Loads the project's main scene, replays the steps of a JSON input script
# (same format as the web runner), saves viewport screenshots and writes
# report.json. Normally launched by scripts/playtest-godot.mjs.
extends SceneTree

const KEY_ALIASES := {
	"arrowup": "Up", "arrowdown": "Down", "arrowleft": "Left", "arrowright": "Right",
	"up": "Up", "down": "Down", "left": "Left", "right": "Right",
	"space": "Space", " ": "Space", "enter": "Enter", "return": "Enter",
	"esc": "Escape", "escape": "Escape", "shift": "Shift", "control": "Ctrl", "ctrl": "Ctrl",
	"tab": "Tab", "backspace": "Backspace",
}

var _steps: Array = []
var _name := "playtest"
var _out_dir := ""
var _main: Node
var _main_freed := false
var _errors: Array = []
var _warnings: Array = []
var _checks: Array = []
var _shots: Array = []

# Names and values Expression can see besides the main scene's own members:
# engine singletons, class_name globals, autoloads and `tree`.
var _in_names := PackedStringArray()
var _in_values: Array = []


func _initialize() -> void:
	var script_path := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--playtest="):
			script_path = arg.trim_prefix("--playtest=")
		elif arg.begins_with("--out="):
			_out_dir = arg.trim_prefix("--out=")
	if script_path == "":
		printerr("PLAYTEST missing --playtest=<script.json>")
		quit(2)
		return

	var text := FileAccess.get_file_as_string(script_path)
	var data = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY:
		printerr("PLAYTEST could not parse %s" % script_path)
		quit(2)
		return
	_steps = data.get("steps", [])
	_name = data.get("name", script_path.get_file().get_basename())
	if _out_dir == "":
		_out_dir = ProjectSettings.globalize_path("res://playtest/screenshots/%s" % _name)
	DirAccess.make_dir_recursive_absolute(_out_dir)

	# Game code can ask `Engine.has_meta("playtest")` to keep tests out of the player's
	# real save and settings files, and to leave the window alone.
	Engine.set_meta("playtest", true)

	var viewport_size = data.get("viewport", null)
	if viewport_size is Array and viewport_size.size() == 2:
		root.size = Vector2i(int(viewport_size[0]), int(viewport_size[1]))

	var main_path: String = ProjectSettings.get_setting("application/run/main_scene", "")
	var scene_override: String = data.get("scene", "")
	if scene_override != "":
		main_path = scene_override
	if main_path == "":
		printerr("PLAYTEST project has no main scene; set application/run/main_scene or \"scene\" in the script")
		quit(2)
		return
	if not ResourceLoader.exists(main_path):
		_errors.append("scene not found: %s" % main_path)
		printerr("PLAYTEST scene not found: %s" % main_path)
		_finish()
		return
	var packed: PackedScene = load(main_path)
	_main = packed.instantiate()
	# A reload_current_scene() (auto-restart on death, a new day) frees this node, and every
	# expression after that would fail against nothing.
	_main.tree_exiting.connect(_on_main_exiting)
	root.add_child.call_deferred(_main)
	_run.call_deferred()


func _on_main_exiting() -> void:
	if _main_freed:
		return
	_main_freed = true
	_errors.append("main scene was freed (scene reload?) — disable auto-restart under test, e.g. check Engine.has_meta('playtest') in the game")


func _run() -> void:
	await process_frame
	current_scene = _main
	await process_frame
	_build_inputs()

	for i in _steps.size():
		var step = _steps[i]
		print("PLAYTEST_STEP %d/%d %s" % [i + 1, _steps.size(), JSON.stringify(step)])
		if _main_freed:
			break
		if step.has("wait"):
			await create_timer(float(step.wait) / 1000.0).timeout
		elif step.has("frames"):
			for f in int(step.frames):
				await process_frame
		elif step.has("press"):
			_key(step.press, true)
			await process_frame
			await process_frame
			_key(step.press, false)
		elif step.has("hold") or step.has("keys"):
			var keys = step.get("hold", step.get("keys"))
			if keys is String:
				keys = [keys]
			for k in keys:
				_key(k, true)
			await create_timer(float(step.get("ms", 500)) / 1000.0).timeout
			for k in keys:
				_key(k, false)
		elif step.has("action"):
			var actions = step.action if step.action is Array else [step.action]
			for a in actions:
				if not InputMap.has_action(a):
					_errors.append("unknown input action '%s'" % a)
				_action(a, true)
			await create_timer(float(step.get("ms", 100)) / 1000.0).timeout
			for a in actions:
				_action(a, false)
		elif step.has("click"):
			await _click(Vector2(step.click[0], step.click[1]))
		elif step.has("move"):
			var motion := InputEventMouseMotion.new()
			motion.position = Vector2(step.move[0], step.move[1])
			motion.global_position = motion.position
			Input.parse_input_event(motion)
			await process_frame
		elif step.has("expect"):
			var r := _evaluate(step.expect)
			_checks.append({"expect": step.expect, "pass": r.ok and _is_true(r.value), "value": str(r.value)})
		elif step.has("eval"):
			var r := _evaluate(step.eval)
			_checks.append({"eval": step.eval, "value": str(r.value)})
		elif step.has("gd"):
			var r: Dictionary = await _run_gd(str(step.gd))
			_checks.append({"gd": step.gd, "value": str(r.value)})
		elif step.has("until"):
			await _until(str(step.until), int(step.get("timeout", 20000)))
		elif step.has("screenshot"):
			await _screenshot(step.screenshot)
		else:
			_errors.append("unknown step %s" % JSON.stringify(step))
		# A killed run still leaves the checks and shots taken so far.
		if _records(step) or (i + 1) % 10 == 0:
			_write_report(false)

	_finish()


func _records(step: Dictionary) -> bool:
	for k in ["expect", "eval", "gd", "until", "screenshot"]:
		if step.has(k):
			return true
	return false


func _key(name: String, pressed: bool) -> void:
	var key_name: String = KEY_ALIASES.get(name.to_lower(), name.to_upper() if name.length() == 1 else name)
	var code := OS.find_keycode_from_string(key_name)
	if code == KEY_NONE:
		_errors.append("unknown key '%s'" % name)
		return
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = pressed
	Input.parse_input_event(ev)


# An event, not Input.action_press: _input/_unhandled_input handlers only see events.
func _action(action: String, pressed: bool) -> void:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = pressed
	ev.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(ev)


func _click(pos: Vector2) -> void:
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.position = pos
		ev.global_position = pos
		ev.pressed = pressed
		Input.parse_input_event(ev)
		await process_frame


# Built once the main scene is in the tree, so autoloads resolve.
func _build_inputs() -> void:
	for s in Engine.get_singleton_list():
		_in_names.append(s)
		_in_values.append(Engine.get_singleton(s))
	for c in ProjectSettings.get_global_class_list():
		_in_names.append(c["class"])
		_in_values.append(load(c["path"]))
	for p in ProjectSettings.get_property_list():
		var n: String = p.name
		if n.begins_with("autoload/"):
			var an := n.trim_prefix("autoload/")
			_in_names.append(an)
			_in_values.append(root.get_node_or_null(an))
	_in_names.append("tree")
	_in_values.append(self)


# Expressions run against the main scene root: "score > 0",
# "get_node('Player').position.x > 100". Engine singletons, class_name globals and
# autoloads are in scope by name. No assignment, no lambdas, no `$Node`: use a `gd` step.
func _evaluate(source: String, record := true) -> Dictionary:
	var expr := Expression.new()
	if expr.parse(source, _in_names) != OK:
		if record:
			_errors.append("expression parse error in '%s': %s%s" % [source, expr.get_error_text(), _hint(source)])
		return {"ok": false, "value": "PARSE ERROR"}
	var value = expr.execute(_in_values, _main, false)
	if expr.has_execute_failed():
		if record:
			_errors.append("expression failed '%s': %s" % [source, expr.get_error_text()])
		return {"ok": false, "value": "EXEC ERROR"}
	return {"ok": true, "value": value}


# Exactly `true`, like the web runner: 1, "yes" or a non-empty array don't pass an expect.
func _is_true(v) -> bool:
	return typeof(v) == TYPE_BOOL and v


func _is_error_value(v) -> bool:
	return typeof(v) == TYPE_STRING and (v == "PARSE ERROR" or v == "EXEC ERROR")


func _hint(source: String) -> String:
	if RegEx.create_from_string("[^=!<>]=[^=]|\\+=|-=|\\*=|/=").search(source):
		return " — Expression can't assign. Use obj.set('prop', v), the game's own setter, or a {\"gd\": ...} step"
	if source.contains("func("):
		return " — Expression has no lambdas. Add a helper method, or use a {\"gd\": ...} step"
	if source.contains("$"):
		return " — `$Node` isn't supported. Use get_node('Node')"
	return ""


# Real GDScript: assignment, lambdas, loops, await. `root` is the main scene, `tree` the SceneTree.
func _run_gd(src: String) -> Dictionary:
	var body := ""
	for line in src.split("\n"):
		body += "\t" + line + "\n"
	var s := GDScript.new()
	s.source_code = "extends RefCounted\nfunc run(root: Node, tree: SceneTree):\n%s\treturn null\n" % body
	if s.reload() != OK:
		_errors.append("gd step failed to compile: %s" % src)
		return {"ok": false, "value": "COMPILE ERROR"}
	var v = await s.new().run(_main, self)
	return {"ok": true, "value": v}


# Waits for a condition instead of guessing a duration. Fails the check on timeout.
func _until(source: String, timeout_ms: int) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	var ok := false
	var last := {}
	while Time.get_ticks_msec() < deadline and not _main_freed:
		last = _evaluate(source, false)
		if last.ok and _is_true(last.value):
			ok = true
			break
		if not last.ok and _is_error_value(last.value) and last.value == "PARSE ERROR":
			break
		await process_frame
	if not ok and not last.is_empty() and not last.ok:
		_evaluate(source)  # record the real error once, with its hint
	_checks.append({"expect": "until " + source, "pass": ok, "value": "true" if ok else "timeout after %d ms" % timeout_ms})


func _screenshot(label: String) -> void:
	var file := "%s/%02d-%s.png" % [_out_dir, _shots.size() + 1, label]
	# The headless display never draws, so frame_post_draw would never fire.
	if DisplayServer.get_name() == "headless":
		_shots.append({"file": file, "skipped": "headless run"})
		return
	await RenderingServer.frame_post_draw
	var img := root.get_texture().get_image()
	if img == null or img.is_empty():
		_shots.append({"file": file, "skipped": "no image (headless run?)"})
		return
	img.save_png(file)
	var n := _color_count(img)
	var sig := _signature(img)
	var same := false
	for i in range(_shots.size() - 1, -1, -1):
		if _shots[i].has("sig"):
			same = _shots[i].sig == sig
			break
	_shots.append({"file": file, "colors": n, "blank": n <= 1, "sig": sig, "same_as_previous": same})


# Two identical frames in a row usually mean the step between them changed nothing.
func _signature(img: Image) -> int:
	var small := img.duplicate() as Image
	small.resize(64, 36, Image.INTERPOLATE_NEAREST)
	return hash(small.get_data())  # PackedByteArray has no .hash() in 4.x; the global hash() does


func _color_count(img: Image) -> int:
	var seen := {}
	var step := maxi(1, int(sqrt(img.get_width() * img.get_height() / 4000.0)))
	for y in range(0, img.get_height(), step):
		for x in range(0, img.get_width(), step):
			var c := img.get_pixel(x, y)
			seen[(int(c.r * 31) << 10) | (int(c.g * 31) << 5) | int(c.b * 31)] = true
	return seen.size()


func _failed() -> bool:
	if _errors.size() > 0:
		return true
	for c in _checks:
		if c.has("pass") and not c.pass:
			return true
	for s in _shots:
		if s.get("blank", false):
			return true
	return false


func _write_report(done: bool) -> void:
	var report := {
		"name": _name, "pass": not _failed(), "done": done, "fps": Engine.get_frames_per_second(),
		"errors": _errors, "warnings": _warnings, "checks": _checks, "screenshots": _shots,
	}
	var f := FileAccess.open(_out_dir + "/report.json", FileAccess.WRITE)
	if f == null:
		return
	f.store_string(JSON.stringify(report, "  "))
	f.close()


func _finish() -> void:
	_write_report(true)
	var failed := _failed()
	print("PLAYTEST_DONE ", "PASS" if not failed else "FAIL")
	quit(0 if not failed else 1)
