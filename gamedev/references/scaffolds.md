# Scaffolds

Minimal, verified starting points: Phaser 4.2, Three.js r186, Vite 8,
Godot 4.7. Each one boots to something visible and exposes the test hook
that `game-playtest` asserts on. Replace the placeholder art, keep the structure.

## Web (shared)

```bash
mkdir my-game && cd my-game
npm init -y
npm i phaser            # or: npm i three
npm i -D vite playwright && npx playwright install chromium
```

`package.json` scripts:

```json
{ "dev": "vite", "build": "vite build --base ./", "preview": "vite preview" }
```

`--base ./` makes the build work from any subfolder (itch.io, GitHub Pages,
Tauri). Put assets in `public/assets/` and load them as `assets/...`. With
`game-assets`, pass `--assets public/assets`.

`.gitignore`: `node_modules/`, `dist/`, `playtest/screenshots/`

## Phaser 4 (2D)

`index.html`

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>My Game</title>
<style>html,body{margin:0;background:#1b1320;height:100%;display:grid;place-items:center}</style></head>
<body><script type="module" src="/src/main.js"></script></body></html>
```

`src/main.js`

```js
import Phaser from "phaser";
import { TUNING } from "./tuning.js";

const W = 320, H = 180; // pixel-art base resolution, scaled up by FIT

class Game extends Phaser.Scene {
  constructor() { super("game"); }

  preload() {
    // this.load.spritesheet("tiles", "assets/sprites/<pack>/tilemap_packed.png", { frameWidth: 16, frameHeight: 16 });
    // this.load.audio("jump", "assets/audio/jump.wav");
  }

  create() {
    // Placeholder texture, same key the real sprite will use later.
    this.add.graphics().fillStyle(0xff6b35).fillRect(0, 0, 12, 16).generateTexture("player", 12, 16).destroy();

    this.player = this.physics.add.sprite(W / 2, H / 2, "player").setCollideWorldBounds(true);
    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE");
    this.state = { score: 0, hp: 3, over: false };

    window.__TEST__ = {
      state: () => ({ ...this.state, x: Math.round(this.player.x), y: Math.round(this.player.y) }),
    };
  }

  update() {
    const k = this.keys;
    const v = new Phaser.Math.Vector2(
      (k.D.isDown || k.RIGHT.isDown) - (k.A.isDown || k.LEFT.isDown),
      (k.S.isDown || k.DOWN.isDown) - (k.W.isDown || k.UP.isDown),
    );
    if (v.lengthSq()) v.normalize();
    this.player.setVelocity(v.x * TUNING.speed, v.y * TUNING.speed);
  }
}

new Phaser.Game({
  type: Phaser.AUTO, width: W, height: H, pixelArt: true, backgroundColor: "#1b1320",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, zoom: 4 },
  physics: { default: "arcade" },
  scene: Game,
});
```

`src/tuning.js`: `export const TUNING = { speed: 90 };`

Phaser 4 gotchas seen in practice:

- `group.children.each(...)` is gone. Use `group.getChildren().forEach(...)`.
- Kenney packed tilesheets (`Tilemap/tilemap_packed.png`) have **no spacing**.
  The unpacked `tilemap.png` has 1 px spacing, so pass `spacing: 1` for it.
- Check frame indices with a screenshot. A wrong index is often an empty tile,
  which leaves an invisible sprite and no error.

## Three.js (3D)

`index.html`

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>My Game</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block}</style></head>
<body><script type="module" src="/src/main.js"></script></body></html>
```

`src/main.js`

```js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js"; // RGBELoader is deprecated

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
const state = { loaded: false, x: 0, z: 0 };

// Sky + image-based lighting from a Poly Haven HDRI (game-assets: polyhaven:<id> --type hdri)
new HDRLoader().load("assets/textures/<hdri>/<hdri>_1k.hdr", (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = scene.environment = hdr;
});
const sun = new THREE.DirectionalLight(0xffe0b0, 2.5);
sun.position.set(20, 30, 10);
sun.castShadow = true;
scene.add(sun, new THREE.HemisphereLight(0xbfd8ff, 0x404020, 0.4)); // fallback light before the HDRI loads

const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x5a7d3a }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Models: new GLTFLoader().load("assets/models/<id>/<id>.gltf", (gltf) => { scene.add(gltf.scene); state.loaded = true; });
state.loaded = true;

const player = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 12), new THREE.MeshStandardMaterial({ color: 0xff6b35 }));
player.position.y = 0.9;
player.castShadow = true;
scene.add(player);

const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.code));
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
const camOffset = new THREE.Vector3(0, 6, 10);
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const move = new THREE.Vector3(
    (keys.has("KeyD") || keys.has("ArrowRight")) - (keys.has("KeyA") || keys.has("ArrowLeft")), 0,
    (keys.has("KeyS") || keys.has("ArrowDown")) - (keys.has("KeyW") || keys.has("ArrowUp")),
  );
  if (move.lengthSq()) player.position.addScaledVector(move.normalize(), 6 * dt);
  camera.position.lerp(player.position.clone().add(camOffset), 1 - Math.exp(-5 * dt));
  camera.lookAt(player.position);
  state.x = +player.position.x.toFixed(2);
  state.z = +player.position.z.toFixed(2);
  renderer.render(scene, camera);
});

window.__TEST__ = { state: () => ({ ...state }) };
```

Three.js gotchas seen in practice:

- Textures used as colour (`map`) need `colorSpace = THREE.SRGBColorSpace`.
  Normal, roughness and AO maps must **not** have it.
- Tiling ground textures need `wrapS = wrapT = RepeatWrapping` and `repeat.set(n, n)`.
- Poly Haven "scan" models can be 100k+ triangles. Check with
  `npx @gltf-transform/cli inspect`, and prefer a low-poly source (Kenney,
  Poly Pizza) for anything instanced many times.
- Set `state.loaded` in the loader callback, and have playtest scripts
  `expect` it before taking the first screenshot.

## Godot 4

`project.godot` (minimal; Godot fills in the rest on first open):

```ini
config_version=5

[application]
config/name="My Game"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.7")

[display]
window/size/viewport_width=640
window/size/viewport_height=360
window/stretch/mode="canvas_items"
```

**Register the Input Map from code** instead of hand-writing the serialized `[input]`
section, so keyboard and gamepad live in one readable place. This is THE ONES' `scripts/inputs.gd`
(abridged list of actions, real helpers). Call `Inputs.register()` first thing in the main scene's `_ready()`:

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
	_key("pause", KEY_ESCAPE)
	_button("pause", JOY_BUTTON_START)


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

### The main scene: a mode, plus test hooks

`main.tscn` has a root script (`main.gd`). Variables on this node are what playtest `expect`
expressions see. Give it an exported **mode**, so every test and every preview can start
directly where it needs to, instead of booting the story:

```gdscript
extends Node3D

@export var mode := "story"   # "story", "explore", "day1", "night2", …
var score := 0
@onready var player: CharacterBody3D = $Player
```

**One-node entry scenes per mode.** Each test points at its own scene. THE ONES ended up with
`day1…day4.tscn`, `night2…night4.tscn`, `explore.tscn` and `intro_test.tscn`. When the story gained a
prologue, the one test that pointed at the main scene broke (the player was frozen in the intro).
Only intro and menu tests should start from the story entry.

```ini
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/main.gd" id="1_main"]

[node name="Main" type="Node3D"]
script = ExtResource("1_main")
mode = "day2"
```

**Debug hooks on the main root.** They're safe to ship, and only playtests and trailers call them.
These are THE ONES' `scripts/main.gd` (lines 161-190 and 263-270, comments translated from Spanish):

```gdscript
## Debug / playtest: place an actor in the world.
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


func look_from(pos: Vector3, yaw: float, pitch := 0.0) -> void:
	player.global_position = pos
	player.rotation.y = yaw
	player.head.rotation.x = pitch


## Debug/playtest: put the camera `dist` metres from a node, looking at it from angle `yaw`.
## Prefer this to hand-tuned look_from(): hand-aimed cameras caused most false FAILs.
func frame_node(n: Node3D, dist: float, yaw: float, h := 1.3) -> void:
	var c := n.global_position
	var p := c + Vector3(sin(yaw), 0, cos(yaw)) * dist
	player.global_position = Vector3(p.x, c.y, p.z)
	player.look_at(Vector3(c.x, player.global_position.y, c.z))
	player.head.rotation.x = atan2(h - 1.6, dist)   # 1.6 = eye height


func set_auto_restart(on: bool) -> void:
	GameState.auto_restart = on   # tests turn this off so a death doesn't reload the scene under them
```

Add time-skip hooks for long modes (a 20-minute night tested in about 4 minutes), and a `stats()`
hook for performance checks. Wait at least 1.5 s after a change, because FPS is a one-second average:

```gdscript
func stats() -> String:
	return "fps=%d prims=%d draws=%d vram=%dMB" % [
		Engine.get_frames_per_second(),
		Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576]
```

**Keep tests out of the player's save.** In THE ONES, story code called `SaveGame.save()` during tests and
wrote into the developer's real `user://save.cfg`. The `game-playtest` harness sets
`Engine.set_meta("playtest", true)`, so the game can branch on it:

```gdscript
static func save_path() -> String:
	return "user://playtest_save.cfg" if Engine.has_meta("playtest") else "user://save.cfg"
```

Code that touches the window (fullscreen, resolution) must also stand down under test and while
recording a trailer. See `godot-field-notes/references/display-settings.md`.

### Housekeeping

```bash
godot --headless --path . --import     # after adding assets or editing .import files
```

- Put an empty `.gdignore` in every folder of non-game files under the project (`playtest/screenshots/`,
  `assets/source/`, `build/`), or Godot imports every PNG in it.
- Textures used by code-built materials need fixed `.import` files, because a headless import never
  runs the editor's detect-3D pass: `game-assets/scripts/fix_texture_imports.mjs`.
- On Windows: use the `*_console.exe` Godot build from `tools/` (gitignored), and run one Godot process
  at a time. More in `godot-field-notes/references/windows-agent.md`.

`.gitignore`: `.godot/`, `playtest/screenshots/`, `playtest/summary.txt`, `export/`, `build/`, `tools/`
