---
name: vehicle-rig-gltf
description: Rig a vehicle (or any object with doors, wheels, lids, lights) in headless Blender so one GLB drives Three.js, Godot and Blender alike — named pivot empties at hinges and axles, parenting that doesn't drift, one NLA track per clip, KHR_lights_punctual lights and lens materials that switch on, glTF axis conversion, and a report that proves what the GLB really contains. Use when the user says "make the doors open", "wheels should roll", "toggle the headlights", "export with animations", "the clip doesn't show up in three.js", "the door stays open in the render", "parts end up offset after parenting", or wires a GLB into a web or Godot viewer.
metadata:
  author: Jibaru
  version: 1.0.0
---

# vehicle-rig-gltf

A rig is a **contract of node names** between the Blender build and every engine that loads the GLB.
Engines find `Door_FL` by name and rotate it, so a renamed node or a pivot in the wrong place fails
silently in all of them. Everything here comes from the Clerk Van
([Jibaru/clerk-van](https://github.com/Jibaru/clerk-van), `tools/build_transit_van.py`, viewed by
`web/app.js` on Three.js r170 and `godot/main.gd`). `scripts/demo_rig.py` builds the same contract on
primitives, and `scripts/glb_rig_report.mjs` proves what a GLB contains. Both were run, and their output is below.

**Versions:** Blender 4.2 glTF exporter, Three.js r170 (unpkg importmap), Godot 4.3+. The Godot scene was
**never run** in the source project, because Godot wasn't installed there. See the bugs found below.

## The contract

| Node | Type | Moves how (glTF space) |
| --- | --- | --- |
| `ClerkVan` (root) | empty | — |
| `Door_FL`, `Door_FR`, `Door_RL`, `Door_RR` | empty at the hinge line | rotate about local Y (Blender Z) |
| `Door_Slide` | empty at the door | translate out (−X), then back (−Z) |
| `Steer_L`, `Steer_R` | empty above each front wheel | rotate about local Y |
| `Wheel_FL/FR/RL/RR` | mesh, origin at the axle | rotate about local X (rolling) |
| `Light_HeadL/R` | spot light | KHR_lights_punctual |
| `Light_TailL/R` | point light | KHR_lights_punctual |
| materials `Headlight_Lens`, `Taillight_Lens` | emission colour set, strength 0 | engine raises emissive intensity |
| clips `DoorFL_Open` … `DoorSlide_Open`, `AllDoors_Open`, `Wheels_Spin` | NLA tracks | glTF animations |

**Axes:** with `export_yup=True`, Blender (x, y, z) becomes glTF (x, z, −y). The van's nose at Blender
**−Y** faces glTF **+Z**, and the driver side **+X** stays +X.

## 1. Pivots and parenting that doesn't drift

```python
def parent(child, par, keep=True):            # build_transit_van.py:34-37 (rig_lib.parent)
    bpy.context.view_layer.update()
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted() if keep else Matrix()
```

- **`view_layer.update()` first.** Objects created or moved in the script have a stale `matrix_world`
  until the depsgraph updates, and an inverse computed from a stale matrix leaves the child offset.
- **`keep=True` stores the parent's inverse**, so the child keeps its world placement. (The source notes
  described this as "parent inverse = identity". The code stores `par.matrix_world.inverted()`.) For a child
  that should sit *at* the pivot, set `child.location = (0, 0, 0)` and `child.parent = par` instead. The
  front wheels hang from `Steer_L/R` that way (`build_transit_van.py:593`).
- **Door members are chosen by bbox predicates**, not by name: anything whose centre sits on the door's flank,
  in its y range, and is thinner than a door joins the pivot (`build_transit_van.py:565-568`):

  ```python
  fl = members(lambda c, w, l, h: c.x > 0.75 and FD[0] < c.y < FD[1] and 0.3 < c.z < 2.1 and w < 0.8)
  door_fl = door_pivot("Door_FL", (BX[1] - 0.03, FD[0], 1.1), fl)
  ```

  A part you separated out of the body (the mirror housing, see `blender-asset-teardown`) is caught by the
  same predicate and swings with the door.
- **Wheels need their origin at the axle** before they're rigged: `set_origin(w, centre_of_tyre)`. Otherwise
  they orbit the scene origin.

## 2. One NLA track per clip

`rig_lib.add_clip(obj, clip, path, keys, index, linear)` keys the property, pushes the action to an NLA
track **named after the clip**, then leaves the object at its rest value (`build_transit_van.py:619-640`).
Several objects contributing to the same track name become **one** glTF animation, which is how
`AllDoors_Open` moves five pivots. The Transit's clips: front doors ±65°, rear doors ±95° on `rotation_euler[2]`
over frames 1→30; the slide door (−0.10 x at frame 8, then +1.15 y at frame 30); wheels 0→360° on
`rotation_euler[0]` over frames 1→31, linear.

## 3. Export, then mute

```python
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_yup=True, export_apply=True,
    export_animations=True, export_animation_mode="NLA_TRACKS", export_lights=True, use_selection=False, …)
for ob in bpy.data.objects:                   # AFTER export (build_transit_van.py:655-663)
    if ob.animation_data:
        for tr in ob.animation_data.nla_tracks:
            tr.mute = True
            for st in tr.strips:
                st.extrapolation = "NOTHING"
```

**Order matters.** Tracks must be **unmuted while exporting**, because a muted track is skipped. Mute them
**after**, and set every strip's extrapolation to `NOTHING`. With the default `HOLD`, opening the saved
.blend, or rendering a turntable from it, shows every door held open by its clip. That happened. The
demo's saved .blend was checked at frames 1, 15 and 30: `Door_FL rot.z=0.0 muted=[True, True]
extrap=['NOTHING', 'NOTHING']`.

## 4. Lights and lenses

- **Units change on export.** Blender watts become candela: the 60 W spots exported as
  `intensity=3261.08` and the 8 W points as `434.81`, measured on both the real GLB and the demo. Viewers
  therefore set their own on/off values rather than trusting the exported number. `web/app.js` stores
  `onIntensity` 60 (head) and 6 (tail), and starts every light at 0 and hidden.
- **Lens materials** export with emission colour set and strength **0**, so the lamps are off by default.
  To switch on, the engine raises it (`mats.Headlight_Lens.emissiveIntensity = 3.0` in `web/app.js`).
  When reusing an asset, **rename** its lamp materials to the contract names (`retag("Lights",
  "Headlight_Lens", …)`, `build_transit_van.py:368-403`), so engines find them by material name.

## 5. Prove what the GLB contains

```bash
node scripts/glb_rig_report.mjs export/clerk_van.glb \
  --expect Door_FL,Door_FR,Door_RL,Door_RR,Door_Slide,Wheel_FL,Wheel_FR,Wheel_RL,Wheel_RR,Steer_L,Steer_R,Light_HeadL,Light_HeadR,Light_TailL,Light_TailR
```

Real output on the Clerk Van GLB: 94 nodes; extensions `KHR_materials_clearcoat`, `KHR_materials_specular`,
`KHR_materials_ior` and `KHR_lights_punctual`; 4 lights; 7 animations (`DoorFL_Open` … `AllDoors_Open` →
`Door_FL.rotation … Door_Slide.translation`, `Wheels_Spin 1.033 s`); and the lens materials present.
It exits 1 if any expected node is missing, so put it in CI next to the build.

## Bugs this check found in the source project

Both are fixes for the project, not for this skill. They show why the contract should be checked
against the **exported file**, not the build script:

- **Slide distance disagrees.** The clip moves `Door_Slide` by **(−0.10, 0, −1.15)** in glTF space (read from
  the animation's output accessor). The engines' hand-driven slide uses **−1.05** (`web/app.js:19`,
  `godot/main.gd:12`), so the button-driven door stops 10 cm short of where the clip puts it. Derive engine
  constants from the GLB, or export them as node extras, instead of typing them twice.
- **Godot lens emission never switches on for this build.** `godot/main.gd:43-44` collects lens materials
  from **meshes** named `Headlight_L`/`Taillight_L`, which the procedural build had. The Transit build only
  renames **materials** (`Headlight_Lens`), and `glb_rig_report` shows no such meshes:
  `MISSING: Headlight_L, Taillight_L`. Look lenses up by material name, as `web/app.js` does.

## Engine notes (from the source viewers)

- **Three.js (r170):** `GLTFLoader` and `OrbitControls`. Collect `nodes[o.name]` and `mats[m.name]` on load,
  store rest pose/rotation per pivot, then: hinge `o.rotation.y = rest.y + angle * ease(t)`; slide = 20% out,
  then 80% back; wheels `rotation.x += v * dt / R` (R = 0.356 m); steering `rotation.y = rest.y + steer`.
  Clips through `AnimationMixer`, `LoopOnce` + `clampWhenFinished`. When swapping models it disposes
  geometry (`web/app.js:79`). Dispose materials and textures too, or they stay on the GPU.
- **Godot 4.3+:** `van.find_child(name, true, false)` for each contract name, rest transforms saved in
  `_ready`, and the same hinge, slide and wheel logic. The GLB's clips also import as `AnimationPlayer` animations.

## Done means

- [ ] `glb_rig_report.mjs --expect <every contract name>` exits 0 on the **exported** GLB.
- [ ] Each clip's targets and duration in the report match what the engine code expects.
- [ ] The saved .blend opens in rest pose (tracks muted, extrapolation `NOTHING`).
- [ ] Every constant the engines hard-code (slide vector, wheel radius, door angles) matches the GLB.
- [ ] Lights start off, and switching on changes both the light and the lens emission. Check it in a
      screenshot (`blender-render-review` / `game-playtest`).

## Scripts

| Script | What |
| --- | --- |
| `scripts/rig_lib.py` | `parent`, `pivot`, `set_origin`, `add_clip` (NLA), `add_light`, `lens_material`, `export_glb` (export then mute) |
| `scripts/demo_rig.py` | the whole contract on primitives: build, export, save (`-- <out_dir>`) |
| `scripts/glb_rig_report.mjs` | nodes, animations (targets, duration), KHR lights, materials; `--expect` gate; `--json` |
