# GDScript (Godot 4.7)

## 1. `Cannot infer the type of "x" variable because the value doesn't have a set type`

This was the most frequent script error in the session (10+ times, 6 files). The right-hand side is a
`Variant`, so `:=` has nothing to infer from. The cases and their fixes:

| Right-hand side | Fix |
| --- | --- |
| indexing an untyped array literal: `var spread := [0.85, 0.55, 0.6][kind]` | `var spread: float = [0.85, 0.55, 0.6][kind]` |
| loop variable over an untyped array: `for t in toes: var dir := (Vector2(0.5, 0.72) - t).normalized()` | typed loop variable (4.2+): `for t: Vector2 in toes:` |
| `for sgn in [-1.0, 1.0]` then arithmetic | `for sgn: float in [-1.0, 1.0]:` |
| comparison with an untyped element: `var going_down := y < st[0] - h` | `var going_down: bool = y < float(st[0]) - h` |
| `Dictionary` access, `.get()`, `Object.get("prop")` | typed declaration or a cast |
| `min` / `max` / `clamp` / `abs` / `lerp` / `sign` (they return Variant) | `minf`/`maxf`/`clampf`/`absf`/`lerpf`/`signf` (or the `i` variants). The project uses `maxf` throughout, e.g. `hold = maxf(hold, vs.get_length())` (`scripts/hud.gd:728`) |
| `Resource.duplicate()` | `stream.duplicate() as AudioStream` |
| a class that itself failed to parse (`var ver := MenuKit.osd_label(...)`) | fix the **other** file first (§2) |

## 2. Cascade compile errors: find the file that didn't parse

`Compile Error: Failed to compile depended scripts`, `Invalid call. Nonexistent function 'new' in base
'GDScript'` and `Could not resolve class "X", because of a parser error` all mean some **other** script
didn't parse. Check each candidate on its own:

```bash
for f in scripts/ui/*.gd scripts/hud.gd; do
  echo "== $f"
  godot --headless --path . --check-only -s "res://$f" 2>&1 | grep -A1 ERROR | head -4
done
```

`--check-only` is documented as "only parse for errors and quit (use with `--script`)". In the session
this found `menu_kit.gd:186 Expected expression for match pattern` hiding under six "could not resolve
MenuKit" errors.

## 3. Parser traps

- **`match` inside a multi-line lambda** passed as an argument, with the closing `)` glued to the last
  statement, gives `Parse Error: Expected expression for match pattern`. Use `if`/`elif` inside lambdas
  and put `)` on its own line:

  ```gdscript
  c.draw.connect(func() -> void:
  	if kind == "play":
  		c.draw_colored_polygon(pts, col)
  	else:
  		c.draw_rect(r, col)
  )
  ```

- **`has_method()` returns false for a `static func`** on a `class_name` script
  (`UiTheme.has_method("plain")`). Call statics directly.
- **Don't name locals after builtins** (`len`, `round`, `range`, `str`).
- **Bounds-check any index coming from UI.** An out-of-bounds `hud.pick(n)` only surfaced in the full suite.

## 4. Project setup worth copying

- **Input Map from code** instead of hand-written serialized `[input]` blocks in `project.godot`.
  Keyboard and gamepad stay in one readable place (`scripts/inputs.gd:7-68`):

  ```gdscript
  class_name Inputs
  extends RefCounted

  static var _done := false

  static func register() -> void:
  	if _done:
  		return
  	_done = true
  	_key("move_forward", KEY_W)
  	_axis("move_forward", JOY_AXIS_LEFT_Y, -1.0)
  	_key("interact", KEY_E)
  	_button("interact", JOY_BUTTON_A)
  	# …

  static func _ensure(action: String) -> void:
  	if not InputMap.has_action(action):
  		InputMap.add_action(action, 0.2)

  static func _key(action: String, code: Key) -> void:
  	_ensure(action)
  	var ev := InputEventKey.new()
  	ev.physical_keycode = code
  	InputMap.action_add_event(action, ev)

  static func _axis(action: String, axis: JoyAxis, value: float) -> void:
  	_ensure(action)
  	var ev := InputEventJoypadMotion.new()
  	ev.axis = axis
  	ev.axis_value = value
  	InputMap.action_add_event(action, ev)

  static func _button(action: String, button: JoyButton) -> void:
  	_ensure(action)
  	var ev := InputEventJoypadButton.new()
  	ev.button_index = button
  	InputMap.action_add_event(action, ev)
  ```

- **Translations**: `locale/strings.csv` becomes `strings.es.translation` / `strings.en.translation`. The **first**
  `--import` after adding the CSV prints `ERROR: Cannot open file 'res://locale/strings.es.translation'`.
  That's harmless, so import twice. Validate the CSV first: no duplicate keys, and quote any field with a comma.
