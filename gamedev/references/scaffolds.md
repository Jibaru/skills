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

Define input actions in the editor (Project → Project Settings → Input Map) or
in `project.godot`'s `[input]` section. Ask the Godot skill
(`godot-gdscript`) for the serialized `InputEventKey` format if you write it by hand.

`main.tscn` root script (`main.gd`): variables on this node are what
playtest `expect` expressions see.

```gdscript
extends Node2D

var score := 0
var hp := 3
@onready var player: CharacterBody2D = $Player
```

Import new assets and validate the project headless:

```bash
godot --headless --path . --import
```

`.gitignore`: `.godot/`, `playtest/screenshots/`, `export/`
