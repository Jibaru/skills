# Display settings: fullscreen by default, window mode, resolution

The request, after playing a build: *"cuando abro el juego, debería abrir por defecto en pantalla
completa, y tener settings para cambiar a ventana y ajustar la resolución"* (it should open fullscreen
by default, with settings to switch to a window and adjust the resolution).

## The settings model (`scripts/settings.gd`)

```gdscript
const RESOLUTIONS := [Vector2i.ZERO, Vector2i(1280, 720), Vector2i(1600, 900), Vector2i(1920, 1080), Vector2i(2560, 1440)]
# defaults:
	"window_mode": 0,  # 0 pantalla completa, 1 ventana
	"resolution": 0,   # índice en RESOLUTIONS
```

(`settings.gd:11, 30-31`.) Use a **new key** `window_mode` rather than reusing an old `fullscreen`
bool. Saves written before the change then start fullscreen too.

## Applying it (`settings.gd:136-157`)

```gdscript
## Modo de ventana + resolución. En ventana: tamaño elegido (cabe en la pantalla) y centrada.
## En pantalla completa: el 3D se dibuja a la resolución elegida y se escala.
static func _apply_display() -> void:
	if not _can_touch_window():
		return
	var win := Engine.get_main_loop() as SceneTree
	var root: Window = win.root if win else null
	var screen := DisplayServer.screen_get_size(DisplayServer.window_get_current_screen())
	var res: Vector2i = RESOLUTIONS[clampi(int(values.resolution), 0, RESOLUTIONS.size() - 1)]
	if int(values.window_mode) == 0:
		if DisplayServer.window_get_mode() != DisplayServer.WINDOW_MODE_FULLSCREEN:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		if root:
			root.scaling_3d_scale = 1.0 if res == Vector2i.ZERO else clampf(float(res.y) / float(screen.y), 0.25, 1.0)
	else:
		if DisplayServer.window_get_mode() != DisplayServer.WINDOW_MODE_WINDOWED:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		if root:
			root.scaling_3d_scale = 1.0
		var size := Vector2i(screen * 0.85) if res == Vector2i.ZERO else res
		size = size.min(screen - Vector2i(0, 60))
		DisplayServer.window_set_size(size)
		var origin := DisplayServer.screen_get_position(DisplayServer.window_get_current_screen())
		DisplayServer.window_set_position(origin + (screen - size) / 2)
```

- **In fullscreen, "resolution" is the 3D render scale.** The UI stays crisp at native resolution, and slow PCs
  gain fps.
- **In a window, the chosen size is clamped** to the screen minus 60 px for the taskbar, and centred.

## Never touch the window under automation (`settings.gd:168-175`)

```gdscript
## En los playtests (ventana fija para las capturas) y en headless no tocamos la ventana.
static func _can_touch_window() -> bool:
	if DisplayServer.get_name() == "headless" or Engine.get_write_movie_path() != "":
		return false
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--playtest="):
			return false
	return true
```

Headless runs, Movie Maker trailer recording (`--write-movie`) and playtests (which pass `--playtest=`
after `--`) all need a fixed window. vsync changes go through the same guard (`settings.gd:129-131`).

## Matching `project.godot`

```ini
[display]
window/size/viewport_width=1920
window/size/viewport_height=1080
window/size/window_width_override=1600
window/size/window_height_override=900
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"
```

UI labels in the options cycler are translation keys (`SET_FULLSCREEN`, `SET_WINDOWED`, `SET_NATIVE`), plus
literal sizes like `1280 × 720`.

**Verification limit:** the playtest window is fixed, so this can't be checked by an automated
playtest. Tell the user to try the fullscreen/window switch themselves.
