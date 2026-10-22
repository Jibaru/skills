---
name: print-ready-export
description: Turn a game or display mesh (single-sided glTF panels, a Sketchfab/asset-store model, a Blender scene) into a 3D-printable STL in Blender headless — weld, solidify into closed slabs, clean slits, export at scale, and verify the actual STL bytes for holes — plus raised logos and lettering conformed to the surface for a print. Use when the user says "make it printable", "export to STL", "3D print this model", "the print has holes", "the model vanished after remesh", "make the letters/logo in relief", "two-colour print", "what scale fits my printer".
metadata:
  author: Jibaru
  version: 1.0.0
---

# print-ready-export

Game assets aren't solids. They're single-sided panels, vertices split per corner, and hidden
interiors. This skill takes such a model to a printable STL **without melting its detail**, and can add
the livery's graphics as raised relief. Everything here was done on
[Jibaru/clerk-van](https://github.com/Jibaru/clerk-van): a CC-BY Ford Transit with a custom livery,
printed at 1:24 as a 250 × 108 × 113 mm body plus relief. Paths below are in that repo.
`tools/build_print_van.py` (369 lines) is the whole pipeline. Read it before adapting.

**Versions: Blender 4.2** (headless, `blender --background`). The operator names are 4.2's: `bpy.ops.wm.stl_export`
with `global_scale` / `export_selected_objects` / `apply_modifiers`. The legacy `export_mesh.stl` is gone.
OpenCV is **not** in Blender's bundled Python. Run the contour step in a system Python and pass JSON in.

## What fails, and why (don't repeat these)

Every one of these was tried on the van first, and each was rejected by the result or by the user:

| Approach | What happened |
| --- | --- |
| Geometry Nodes *Mesh to Volume* / voxel **Remesh** on the raw asset | The level-set builder **silently discards open surfaces**. Most of the van vanished. Solidify first if you must remesh. |
| Voxel remesh of the solidified body (8, 6.5, 5 mm + Smooth) | One watertight shell, but it **melts detail**: grille, louvres and lamps become lumps. Faces then need re-painting by nearest surface, which gives jagged colour borders. Rejected twice ("no se ve tan detallado, pintado sin ser exacto": not as detailed, painted inexactly). Finer voxels explode: 4 mm = 964k faces, 3 mm = 1.9M faces, 50-100 MB files. |
| **Decimate** (collapse) after remesh | Leaves degenerate faces that Blender **drops on save/export**. About 650 holes appeared only in the saved file, while in-script bmesh counts said 0. Validate the exported file. |
| Exact boolean **self-union** (`intersect_boolean`, solver EXACT, `use_self`) of the solidified 565k-face body | Blender crashed with `EXCEPTION_ACCESS_VIOLATION`. |

## The pipeline that worked

### 1. Keep the exterior and join evaluated copies

Drop interior objects by material name (`INTERIOR_MATS`, line 63) and by a **visibility test**. Sample
up to 300 faces per object and cast 11 rays from 1 cm off each face. If any ray escapes, the object is exterior
(`visible_from_outside`, lines 71-88). Then join **evaluated** copies so modifiers and materials come along
(`bpy.data.meshes.new_from_object(ev)` + `me.transform(o.matrix_world)`, lines 121-138), with every NLA track muted
and `frame_set(0)` first, so doors and wheels sit in the rest pose (lines 52-57).

### 2. Weld before anything else

```python
# tools/build_print_van.py:139-145
# the glTF import split most vertices (per-corner normals / UVs), so nearly every edge is a boundary and
# Solidify would rim each triangle; welding the vertices (UVs stay per corner) reconnects the panels
bm = bmesh.new()
bm.from_mesh(ext.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(ext.data)
bm.free()
```

In the session this took the body from 338k boundary edges to 12k. Without it, Solidify puts a rim on every
triangle and the surface looks quilted.

### 3. Solidify into closed, overlapping slabs

```python
# tools/build_print_van.py:31, 152-158
WALL = 0.04          # wall thickness, metres at full scale: 1.7 mm at 1:24
sol = ext.modifiers.new("Wall", "SOLIDIFY")
sol.thickness = WALL
sol.offset = 0.0                 # centred: the outer surface only inflates WALL/2, inward faces don't spike
sol.use_rim = True               # closes every slab
sol.use_even_offset = False
sol.nonmanifold_thickness_mode = "FIXED"
bpy.ops.object.modifier_apply(modifier="Wall")
```

Each game panel becomes its own **closed** slab, and the slabs overlap. That's fine. PrusaSlicer, Bambu Studio and
Cura union overlapping closed shells of one object. Don't try to boolean them together (see the crash above).

### 4. Clean the slits Solidify leaves

Solidify can't rim edges the game mesh shares between three or more faces, so it leaves 4 cm slits.
In order (`tools/build_print_van.py:159-194`):

1. `bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)`
2. Weld the vertices of boundary edges: `remove_doubles(dist=2e-3)` on just those vertices.
3. `bmesh.ops.holes_fill(bm, edges=bm.edges, sides=12)`
4. Bridge each remaining pair of **facing** rim edges within 12 mm with one quad. Use a `KDTree` on edge midpoints
   and order the second edge's vertices by distance (lines 168-190).
5. Triangulate the n-gons, then `mesh.validate()`.

What's left: **155 boundary edges** in the shipped STL (measured, below), at non-manifold vertices of the cowl.
Slicers auto-repair those. **Report the number honestly** instead of saying "watertight".

### 5. Export at scale, in parts

```python
# tools/build_print_van.py:342-346, 364 — DENOM = 24 (1:24), Blender units are metres
bpy.ops.wm.stl_export(filepath=".../clerk_van_print_body.stl",   global_scale=1000.0 / DENOM, export_selected_objects=True, ascii_format=False)
bpy.ops.wm.stl_export(filepath=".../clerk_van_print_relief.stl", global_scale=1000.0 / DENOM, export_selected_objects=True, ascii_format=False)
bpy.ops.wm.stl_export(filepath=".../clerk_van_print.stl",        global_scale=1000.0 / DENOM, apply_modifiers=True, ascii_format=False, export_selected_objects=False)
```

- `global_scale = 1000/DENOM` writes **millimetres** at 1:DENOM.
- Before export, move the model so its lowest vertex is z=0, then apply transforms (lines 334-338).
- `_body` and `_relief` separately for a **two-colour print**, plus the joined file. Tell users to scale body and relief
  **together** in the slicer, or they won't line up.
- A **GLB of the same objects** (`export_scene.gltf`, `export_format="GLB"`, original materials) for a web preview.
  Window glass becomes an **opaque** dark copy of the glass material (alpha 1, base color ≈ 0.02, roughness 0.15),
  because with the interior gone, transparent glass shows the far wall. Keep the headlamp covers clear so the
  lamps show (`print_glass()`, lines 101-133).

### 6. Verify the bytes, not the mesh

A mesh can be closed in memory and still have holes in the file, as with the decimate case above. Check the STL itself:

```bash
node <this-skill>/scripts/stl_check.mjs export/clerk_van_print.stl export/clerk_van_print_body.stl export/clerk_van_print_relief.stl
```

This is what it reports on the shipped files:

```
clerk_van_print.stl          302076 triangles, 15.1 MB, size 107.5 x 249.9 x 112.8 mm
  boundary edges 155  (holes)
  shared edges   1959  (overlapping shells, harmless)
clerk_van_print_body.stl     248236 triangles, 12.4 MB, size 107.5 x 249.9 x 112.2 mm
  boundary edges 155  (holes)        shared edges 1959
clerk_van_print_relief.stl    53840 triangles,  2.7 MB, size 86.9 x 240.8 x 86.0 mm
  boundary edges 0  (holes: none)    shared edges 0
```

- **Boundary** edges are used by one triangle. These are real holes.
- **Shared** edges are used by three or more. These are overlapping closed shells meeting, and they're harmless.

The script needs no dependencies. It reads the binary STL records (80-byte header, `uint32` count, then 50-byte
records), welds by position rounded to 1e-5, and counts undirected edges. Exit code 1 if any file has more boundary
edges than `--max-boundary N` (default 0). This check was run inline in the clerk-van session and never committed
there. This script is its repackaging.

## Scale and printability

| Scale | Size (L × W × H) | Wall (4 cm full size) | Relief (15 mm full size) | Fits |
| --- | --- | --- | --- | --- |
| 1:24 | 250 × 108 × 113 mm (measured) | 1.7 mm | 0.6 mm | beds ≥ 255 mm on one axis, or placed diagonally |
| 1:28 | 214 × 93 × 97 mm (computed) | 1.5 mm | 0.5 mm | 220 mm beds |

For any other scale: size = full size ÷ denominator. Recompute and state it rather than guessing.

- Letters 5 cm tall at full size print at 2 mm at 1:24. Text under about 3 cm is marginal on FDM, so check it on resin.
- The output is STL in mm, Z up, nose toward −Y.
- At 1:24: 302k triangles, STL 15.1 MB, GLB 13.4 MB.

## Raised logos and lettering

Read `references/relief-lettering.md`. In short:
1. **Record a mask while drawing the livery.** Exact outlines with no colour thresholding.
2. **Vectorise in system Python** with OpenCV (`tools/print_mask_polys.py`).
3. **Build each glyph in Blender** as a closed extruded 2-D curve, check closure with a fallback, then ray-cast every
   vertex onto the solidified body (`BVHTree.FromPolygons`). The top sits at surface + RELIEF and the base is embedded WALL/2.

## Closing holes in general

`references/hole-toolbox.md` covers finding holes with a ray-cast grid, patching **only the hole** (not a
full-width plate), `holes_fill` vs `fill_holes` vs `bridge_loops`, Shrinkwrap patches, and mirroring a correct part
instead of repairing a broken one.

## Done means

- [ ] Interior and never-visible objects dropped. Rest pose (NLA muted, frame 0).
- [ ] Welded before Solidify (boundary edges count logged before and after).
- [ ] Solidify centred (`offset 0`), `use_rim`, thickness ≥ 1.2 mm at the print scale.
- [ ] Exported in mm at the agreed scale, as body, relief and joined, plus a GLB preview with opaque glass.
- [ ] `stl_check.mjs` run on the **exported files**: relief 0 boundary edges, body's remaining slits reported by number.
- [ ] The user was told the size at each scale and that the parts must be scaled together.
