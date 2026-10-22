---
name: blender-asset-teardown
description: Take a downloaded 3D asset apart in headless Blender before reusing it — flatten per-node transforms, print a parts inventory with world bounding boxes and materials, name anonymous parts, scale to metres from one known dimension, delete clutter, replace a broken part by mirroring its symmetric twin, find and patch holes with a ray grid, split merged parts, and find mesh islands without welding. Use when the user says "inspect this glb", "which part is the door", "what's in this model", "scale it to real size", "remove the light bar / roof rack", "this part is broken / modelled open", "there's a hole after deleting", or before repainting or rigging a Sketchfab / game asset.
metadata:
  author: Jibaru
  version: 1.0.0
---

# blender-asset-teardown

Game and Sketchfab assets arrive as a glTF with around 100 anonymous nodes (`3DGeom-12`), a transform on
every node, vertices split at every seam, a hidden interior, and decoration you don't want. Understand
the asset before you edit it. Everything below comes from turning "Ford Transit With Light Bar"
(circlegent, CC BY 4.0, 190 meshes, 149,087 faces) into the Clerk Van
([Jibaru/clerk-van](https://github.com/Jibaru/clerk-van)). The scripts in `scripts/` are generalized
from its `tools/`, and every one was run against that asset.

**Versions:** Blender 4.2 (`bpy`, `bmesh`, `mathutils`), headless:
`"C:/Program Files/Blender Foundation/Blender 4.2/blender.exe" --background --python <script> -- <args>`.

## 1. Inventory: flatten first, then look

```bash
blender --background --python scripts/inventory.py -- model.glb --top 40 --json inv.json
```

`teardown_lib.flatten()` bakes each object's `matrix_world` into a **copy** of its mesh, then resets the
transform and drops the empties (the build does the same at `build_transit_van.py:161-171`). Imported files
often share mesh data between objects, so transforming a shared mesh in place would move every instance.
After that, every bbox is in world space and comparable. Real output on the Transit:

```
190 meshes, 149087 faces
  3DGeom-1        57522  x[-1.25,1.04] y[-2.95,2.94] z[0.27,2.65]  mats=['[Color M00]']
  3DGeom-33       13495  x[-0.90,0.90] y[-2.83,-1.44] z[0.94,1.45]  mats=['…Hightop_interior']
  3DGeom-11        4523  x[0.95,0.98]  y[-2.20,-1.76] z[0.13,0.57]  mats=['…Hightop_brushed_metal']
  3DGeom-76        2440  x[0.86,1.26]  y[-1.89,-0.77] z[0.92,1.95]  mats=['…Hightop_gum1']
```

Name the parts from **bbox plus material name** ("Tyres", "brakes", "chrome", "interior", "seat_fabric",
"Glass", "redglass"). When that isn't enough, colour every object a distinct flat colour and render
orthographic views with a legend. That's `clerk-van/tools/explore_parts.py`: per-object HSV colour,
`legend.json` with index → name/colour/bounds, and six ortho views. Then match colours to names by eye.

## 2. Scale to metres from one known dimension

Pick one real measurement you trust (the wheelbase from the spec sheet), measure it in asset units between
two part centres, and derive the scale:

```bash
blender --background --python scripts/inventory.py -- model.glb \
  --known-length 3.75 --between 3DGeom-48,3DGeom-15 --axis y --centre
# scale: 3.75 m / 4.4490 units = 0.842886 m/unit
```

That matches the build's hard-coded `S = 3.75 / 4.449` (`build_transit_van.py:25`). `--centre` puts the
bbox centre at x=0, y=0 and the lowest point at z=0 (tyres on the ground). Pick a convention and keep it
for every later step. Clerk Van uses **front = −Y** in Blender (which becomes glTF +Z after export) and
**driver side = +X**.

## 3. Delete clutter

Delete by name for the parts you identified, and by bbox predicate for whole classes. From
`build_transit_van.py:177-187`: a `ROOF_CLUTTER` set of node names (light bar, beacons, clearance lamps,
roof rails, chrome lettering), plus "anything whose centre is inside the cargo box and smaller than it":

```python
inside = 0.5 < cx_ < 2.5 and 2.8 < cy_ < 6.75 and cz_ > 0.55 and (x1 - x0) < 1.9 and (y1 - y0) < 3.5
if ob.name in ROOF_CLUTTER or inside:
    bpy.data.objects.remove(ob, do_unlink=True)
```

## 4. A broken part: replace it with its mirror, don't repair it

The asset's sliding door was modelled **open**: slid back, raised, with an open window and step well.
Three attempts to move it and rebuild its skin all "still looked open" to the user. What worked was
deleting it and **mirroring the opposite flank** over the opening (`build_transit_van.py:255-305`):

1. Find the opening from the geometry. Sort the y of outward-facing face centres on that flank, and the
   largest gap is the doorway (`_gap = max(zip(_ys, _ys[1:]), key=lambda t: t[1] - t[0])`).
2. Copy the faces of the good side whose centres fall in that y/z window, negate x, and **reverse the
   winding** so the normals still face outward: `teardown_lib.mirror_strip(src, name, pred, axis=0)`.
3. Do the same for every layer in that window (body skin and the lower cladding).

The result is one seam, flush. **When a part is wrong and the object is symmetric, copy the correct twin.**
The same move rebuilt the passenger window surround from the driver's (`build_transit_van.py:493-510`).

## 5. Holes left by deletions: find them with rays, patch only the hole

```bash
blender --background --python scripts/find_holes.py -- model.glb --object 3DGeom-1 \
  --x -0.6,0.6 --y -0.6,1.2 --step 0.05 --near 2.3 --scale 0.842886 --offset 1.51,3.53,0
# 3DGeom-1: 45 of 925 rays missed … miss bbox: x[-0.300,0.050] y[0.050,0.450]
```

That's the light-bar mount cut-out in the roof, matching the extent recorded in the build
(`build_transit_van.py:241`: "spans y 0.03..0.48, x -0.32..0.08 (ray-cast)"). **`--near` is essential
on a closed body:** a ray that falls through a roof hole still hits the floor inside, so without a "deeper
than the roof counts as a miss" threshold the scan reports zero holes. That happened on the first run of
this script.

Patch **only** the miss region. A full-width plate "looked like a slab" from low angles. The build samples
the roof height from upward face centres in thin x bins, sits the patch 1 cm **under the rib crests** so it
never pokes through, and covers just the strip (`build_transit_van.py:232-253`):

```python
for x in [i / 10 for i in range(-7, 8)]:
    zs = [c.z for c in _top if abs(c.x - x) < 0.08]
    if zs:
        _prof.append((x, max(zs) - 0.010))     # just under the rib crests so the patch never pokes through the skin
```

Other hole tools: `bmesh.ops.holes_fill` (closed boundary loops), `bpy.ops.mesh.fill_holes(sides=N)` in
edit mode, `bmesh.ops.bridge_loops` for two open rings, and a Shrinkwrap modifier for a patch that must
follow a surface. For watertight *printing*, see `print-ready-export`.

## 6. Split a merged part

Faces of one mesh often belong to separate parts. The passenger mirror housing was inside the body mesh.
`teardown_lib.separate(ob, name, pred)` moves the faces whose **world** centre satisfies a predicate into a
new object (`build_transit_van.py:457`):

```python
mir_l = separate(body, "Mirror_L_housing", lambda c: c.x > 1.02 and -1.95 < c.y < -0.75 and 0.85 < c.z < 1.65)
```

The new object then gets picked up by the door's member predicate and moves with the door (see
`vehicle-rig-gltf`).

## 7. Islands without welding

glTF import splits vertices at every UV and normal seam, so edge connectivity is meaningless and "select
linked" selects single triangles. To find logical pieces **without modifying the mesh**, union-find faces
that share a rounded vertex **position** (`teardown_lib.islands`, from `build_transit_van.py:534-547`):

```bash
blender --background --python scripts/inventory.py -- export/clerk_van.glb --top 5 --islands Body
# islands of Body: 91
#   1584 faces  x[0.17,0.58] y[-2.22,-2.15] z[1.30,1.35]     <- a wiper arm on the cowl
```

The build paints islands that lie entirely inside a `WIPER_BOX` black, and treats an antenna column by bbox.
Name the union-find list `uf_par`, not `parent`: at module level a list called `parent` shadows a helper
function of the same name ("'list' object is not callable").

For **geometry** operations (solidify, booleans, remesh), weld first:
`bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)`. UVs stay per corner, so welding doesn't break them.

## 8. Faces that point inward, and interior parts

- Game meshes often include **inward copies** of panels (door inner skins). After repainting, those show
  the livery inside the car. The build reassigns any livery face whose normal points toward the vehicle's
  centre line to a near-black `DoorInner` material (`inner_faces_to_interior`, `build_transit_van.py:315-334`).
- To drop interior objects (for a print), sample up to 300 faces per object and cast rays from 1 cm off
  each face in 11 directions. If any ray escapes without a hit, the object is exterior. Add a
  material-name filter (`interior`, `seat_fabric`, `carpet`, `dash`). That one lives in
  `build_print_van.py`, covered by `print-ready-export`.

## Done means

- [ ] An inventory JSON exists, and every part you'll touch has a name you assigned and a reason.
- [ ] Scale is derived from a stated real dimension, and the axis convention is written down.
- [ ] Every deletion is by name or an explicit predicate, re-runnable from a script (no manual edits).
- [ ] After deletions, a ray grid over the affected area shows no misses (with `--near` on closed bodies).
- [ ] Close-up renders of every repaired spot were looked at (`blender-render-review`).

## Scripts

| Script | What |
| --- | --- |
| `scripts/teardown_lib.py` | `import_any`, `flatten`, `inventory`, `bounds`, `scale_matrix`, `islands`, `separate`, `mirror_strip`, `faces_in_box`, `boundary_edges`, `ray_grid_holes` |
| `scripts/inventory.py` | parts table, scale from a known length, centring, island listing, JSON |
| `scripts/find_holes.py` | ray-grid hole finder along any axis, with a `--near` depth threshold |
