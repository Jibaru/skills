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
var _errors: Array = []
var _checks: Array = []
var _shots: Array = []


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
	var packed: PackedScene = load(main_path)
	_main = packed.instantiate()
	root.add_child.call_deferred(_main)
	_run.call_deferred()


func _run() -> void:
	await process_frame
	current_scene = _main
	await process_frame

	for step in _steps:
		if step.has("wait"):
			await create_timer(float(step.wait) / 1000.0).timeout
		elif step.has("frames"):
			for i in int(step.frames):
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
			_checks.append({"expect": step.expect, "pass": r.ok and r.value == true, "value": str(r.value)})
		elif step.has("eval"):
			var r := _evaluate(step.eval)
			_checks.append({"eval": step.eval, "value": str(r.value)})
		elif step.has("screenshot"):
			await _screenshot(step.screenshot)
		else:
			_errors.append("unknown step %s" % JSON.stringify(step))

	_finish()


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


# Expressions run against the main scene root: "score > 0",
# "get_node('Player').position.x > 100", "$Player" is not supported.
func _evaluate(source: String) -> Dictionary:
	var expr := Expression.new()
	if expr.parse(source) != OK:
		_errors.append("expression parse error in '%s': %s" % [source, expr.get_error_text()])
		return {"ok": false, "value": "PARSE ERROR"}
	var value = expr.execute([], _main, false)
	if expr.has_execute_failed():
		_errors.append("expression failed '%s': %s" % [source, expr.get_error_text()])
		return {"ok": false, "value": "EXEC ERROR"}
	return {"ok": true, "value": value}


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
	_shots.append({"file": file, "colors": _color_count(img), "blank": _color_count(img) <= 1})


func _color_count(img: Image) -> int:
	var seen := {}
	var step := maxi(1, int(sqrt(img.get_width() * img.get_height() / 4000.0)))
	for y in range(0, img.get_height(), step):
		for x in range(0, img.get_width(), step):
			var c := img.get_pixel(x, y)
			seen[(int(c.r * 31) << 10) | (int(c.g * 31) << 5) | int(c.b * 31)] = true
	return seen.size()


func _finish() -> void:
	var failed := _errors.size() > 0
	for c in _checks:
		if c.has("pass") and not c.pass:
			failed = true
	for s in _shots:
		if s.get("blank", false):
			failed = true
	var report := {
		"name": _name, "pass": not failed, "fps": Engine.get_frames_per_second(),
		"errors": _errors, "checks": _checks, "screenshots": _shots,
	}
	var f := FileAccess.open(_out_dir + "/report.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(report, "  "))
	f.close()
	print("PLAYTEST_DONE ", "PASS" if not failed else "FAIL")
	quit(0 if not failed else 1)
