# Testing a Godot game: entry scenes, hooks, performance

Patterns from THE ONES (Godot 4.7.2, first-person 3D, 4 days + 4 nights, 62 playtest
scripts). They keep long tests fast and aimed at the right thing. Code below is from
that project (`scripts/main.gd`, `scenes/day2.tscn`, `scripts/veg_preview.gd`).

## One entry scene per long test

Never point a gameplay test at the story/main scene. When the story entry gained a
prologue, a day-3 test that started there froze with the player locked in the intro.
Give each long test a one-node scene that sets an exported mode on the main script:

```
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/main.gd" id="1_main"]

[node name="Main" type="Node3D"]
script = ExtResource("1_main")
mode = "day2"
```

THE ONES ended up with `day1…day4.tscn`, `night2…night4.tscn`, `explore.tscn`,
`intro_test.tscn` and `*_preview.tscn`. Only `intro_test` and the menu tests start
from the story entry. Whenever you add an intro, title card, tutorial or "press any
key", re-run the whole suite. `grep '"scene"' playtest/scripts/*.json` lists the tests
that depend on each scene.

## Debug hooks on the main root

They're safe to ship, and only playtests call them. Expressions see the root's methods
directly (`"eval": "frame_node(house.kuro, 1.5, 2.0, 0.7)"`).

```gdscript
func look_from(pos: Vector3, yaw: float, pitch := 0.0) -> void:
	player.global_position = pos
	player.rotation.y = yaw
	player.head.rotation.x = pitch


## Puts the camera `dist` metres from a node, looking at it from angle `yaw`.
## Prefer this to hand-tuned look_from: aiming the test camera by hand was the most
## common cause of false FAILs (>5 times), and frame_node ended that.
func frame_node(n: Node3D, dist: float, yaw: float, h := 1.3) -> void:
	var c := n.global_position
	var p := c + Vector3(sin(yaw), 0, cos(yaw)) * dist
	player.global_position = Vector3(p.x, c.y, p.z)
	player.look_at(Vector3(c.x, player.global_position.y, c.z))
	player.head.rotation.x = atan2(h - 1.6, dist)   # 1.6 = eye height


func spawn_debug(kind: String, pos: Vector3, yaw := 0.0) -> Node3D:
	var n: Node3D
	match kind:
		"gray":
			n = Gray.new()
		"cultist":
			n = Cultist.new()
		_:
			n = Kuro.new()
	add_child(n)
	n.global_position = pos
	n.rotation.y = yaw
	return n


func set_auto_restart(on: bool) -> void:
	GameState.auto_restart = on


func set_analog(v: float) -> void:     # a static shader uniform, set through a method
	if Night.postfx:
		Night.postfx.set_shader_parameter("analog", v)
```

Add **time skips** so a 20-minute night tests in about 4: `night.skip_to_next()`,
`night.sleep()`, `night.mark_done('ufo')`, `night.set('visitor_patience', 25.0)`. Add
feature hooks too (`debug_shoji_shadow()` spawns the real creature-silhouette walk). Set
`set_auto_restart(false)` as the first step of every night or day test, or a death
reloads the scene and the harness reports `main scene was freed`.

**Preview scenes** (`veg_preview.tscn`, `creature_preview.tscn`) with a free Camera3D and
`look(pos, target)` / `view(name)` / `solo(layer)` / `lineup(gait)` methods are good
for look-dev without booting the game.

Example script (`playtest/scripts/kuro_yard.json`):

```json
{
  "name": "kuro_yard",
  "scene": "res://scenes/day1.tscn",
  "viewport": [1600, 900],
  "steps": [
    { "wait": 6000 },
    { "eval": "frame_node(house.kuro, 1.5, 2.0, 0.7)" },
    { "eval": "hud.set('visible', false)" },
    { "wait": 1500 },
    { "screenshot": "day" },
    { "eval": "house.kuro.play('bark')" },
    { "wait": 600 },
    { "screenshot": "day-bark" },
    { "eval": "world.set_night()" },
    { "eval": "player.set_flashlight(true)" },
    { "eval": "house.kuro.play('growl')" },
    { "wait": 2500 },
    { "screenshot": "night-growl" }
  ]
}
```

With this harness, prefer `{ "until": "night != null and night.running", "timeout": 30000 }`
to boot waits of 6–10 s. One test failed because a tape took about 16 s and the script
waited 15.

## Keep tests out of the player's files

The harness sets `Engine.set_meta("playtest", true)`. Story code that calls a save
during a test would otherwise write the developer's real `user://save.cfg`:

```gdscript
static func save_path() -> String:
	return "user://playtest_save.cfg" if Engine.has_meta("playtest") else "user://save.cfg"
```

Display settings must not touch the window under test, during a `--write-movie`
recording, or headless. THE ONES (`scripts/settings.gd`) checks the harness's
`--playtest=` argument, which works with any harness version:

```gdscript
static func _can_touch_window() -> bool:
	if DisplayServer.get_name() == "headless" or Engine.get_write_movie_path() != "":
		return false
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--playtest="):
			return false
	return true
```

With this harness version, `Engine.has_meta("playtest")` is the shorter test.

## Performance through playtests

```gdscript
func stats() -> String:
	return "fps=%d prims=%d draws=%d vram=%dMB" % [
		Engine.get_frames_per_second(),
		Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576]
```

- Wait **at least 1.5 s** after each toggle before reading. `fps` is a one-second
  average and lags.
- At a vsync cap (165 Hz) fps saturates, so trust primitive and draw-call counts.
- Measure windowed. Headless has no GPU, so its numbers mean nothing.
- One parameter per measurement, and check the toggle took effect (an eval that
  printed PARSE ERROR measured nothing).

## Viewport and HUD

`"viewport": [w, h]` sets both `--resolution` and the root size. Screenshots include
CanvasLayers (HUD, subtitles, filters), so hide the HUD with
`{ "eval": "hud.set('visible', false)" }` for clean art shots.

## Suite command in the README

Keep one line in the project README and run it in the background before every commit
or release that touches shared systems (intro, save, input, UI theme):

```bash
node <skill>/scripts/playtest-godot.mjs playtest/scripts/m*.json playtest/scripts/ui_*.json \
  --project . --godot ./tools/Godot_v4.7.2-stable_win64_console.exe --summary playtest/summary.txt
```

Add `playtest/summary.txt`, `playtest/summary.json` and `playtest/screenshots/` to
`.gitignore`.
