# Finding and closing holes

From the clerk-van session. Each entry says whether the repo has it as code (`file:line`) or whether it's a
technique the session used and didn't keep.

## Find the hole first

**Count open edges in memory** (`tools/build_print_van.py:42-48`). This only tells you about the mesh you're holding:

```python
def open_edges(me):
    """Edges with other than two faces: 0 means every shell in the mesh is closed."""
    b = bmesh.new()
    b.from_mesh(me)
    n = sum(1 for e in b.edges if len(e.link_faces) != 2)
    b.free()
    return n
```

**Then count them in the exported file.** Saving can drop degenerate faces and open new holes, so use
`scripts/stl_check.mjs`.

**Locate a missing patch of surface with a ray-cast grid** (session technique). Clerk-van used it for the hole left in
the roof after deleting the light bar. Cast `scene.ray_cast` straight down over a grid of x/y cells above the area.
Cells with **no hit** are the hole. That gives you the hole's outline without reading any topology.

## Close it, choosing the smallest tool that works

| Situation | Tool |
| --- | --- |
| Small closed boundary loops (up to N sides) | `bmesh.ops.holes_fill(bm, edges=bm.edges, sides=12)`, as clerk-van uses after solidify (`build_print_van.py:167`) |
| The same thing interactively, in edit mode | `bpy.ops.mesh.fill_holes(sides=N)` |
| Two facing open rings (a tube cut in two) | `bmesh.ops.bridge_loops(bm, edges=...)` |
| Pairs of facing **edges** a few mm apart (Solidify slits) | A KDTree on edge midpoints plus one quad per pair (`build_print_van.py:168-190`) |
| Vertices that should be one (glTF import splits them) | `bmesh.ops.remove_doubles(dist=1e-5)` **before** any topology work (`build_print_van.py:141-145`) |
| A patch that must follow a curved surface | Build the patch, then a **Shrinkwrap** modifier onto the body |
| Anything, with a guaranteed result | `mesh.validate()` at the end, then the STL check |

**Patch only the hole** (session lesson). The first roof repair was a full-width plate, and from low angles it "looked like
a slab". The version that was accepted covers only the ray-cast hole cells. It sits 1 cm under the roof rib crests and
follows the roof's curvature, by sampling the roof's z along y from nearby face centres.

## When a part is broken, copy its mirror instead of fixing it

Clerk-van's source asset had the sliding door modelled **open**, raised, with an open window. Three repair attempts
(moving it, rebuilding the skin) all still "looked open" to the user. What worked was deleting it and **mirroring the
opposite flank**: copy the body and cladding faces in the opening's y-range, scale x by −1, flip the normals. That
leaves one flush seam. The rule: when a part is wrong and the model is symmetric, copy the correct side.

## Islands without modifying the mesh

To find small loose parts (wiper arms lying on the cowl, an antenna) in a split-vertex glTF import, union-find faces keyed by
**rounded vertex position** (`round(co, 5)`). That's analysis only, and it doesn't touch the mesh. For geometry ops, weld
with `remove_doubles` first. A module-level variable named `parent` for the union-find array once shadowed a
`parent()` helper (`'list' object is not callable`), so prefix temporaries.
