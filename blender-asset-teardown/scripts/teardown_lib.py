"""teardown_lib.py — helpers for taking a downloaded game asset apart in Blender (4.2+).

Import from a script run with `blender --background --python your_script.py -- ...`:

    import sys, os; sys.path.append(os.path.dirname(os.path.abspath(__file__)))  # or the skill's scripts dir
    from teardown_lib import *

Everything works in WORLD space after `flatten()`, which is the point: asset files carry a transform
on every node, so a bbox read from mesh data is meaningless until the transform is baked in.
Patterns taken from clerk-van/tools/build_transit_van.py (see the skill's SKILL.md for line refs).
"""
import bpy
import bmesh
from mathutils import Vector, Matrix


def import_any(path):
    """Import glb/gltf/fbx/obj into an empty scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = path.lower().rsplit(".", 1)[-1]
    if ext in ("glb", "gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == "fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == "obj":
        bpy.ops.wm.obj_import(filepath=path)
    else:
        raise SystemExit(f"unsupported format: {path}")
    bpy.context.view_layer.update()


def flatten(drop_empties=True, clear_animation=True):
    """Bake every mesh object's world matrix into its mesh data and reset the object transform.

    Copies the mesh first: imported files often share mesh data between objects, and transforming a
    shared mesh in place would move every instance.
    """
    for ob in list(bpy.data.objects):
        if ob.type != "MESH":
            continue
        ob.data = ob.data.copy()
        mw = ob.matrix_world.copy()
        ob.parent = None
        ob.matrix_world = Matrix()
        ob.data.transform(mw)
        ob.rotation_mode = "XYZ"
    if drop_empties:
        for ob in list(bpy.data.objects):
            if ob.type != "MESH":
                bpy.data.objects.remove(ob, do_unlink=True)
    if clear_animation:
        for ob in bpy.data.objects:
            ob.animation_data_clear()


def meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def bounds(ob):
    """World-space bbox ((x0,x1),(y0,y1),(z0,z1)) from vertices (exact, unlike ob.bound_box after edits)."""
    mw = ob.matrix_world
    vs = [mw @ v.co for v in ob.data.vertices]
    if not vs:
        return (0, 0), (0, 0), (0, 0)
    return tuple((min(v[i] for v in vs), max(v[i] for v in vs)) for i in range(3))


def centre(ob):
    b = bounds(ob)
    return Vector(tuple((lo + hi) / 2 for lo, hi in b))


def inventory(sort_by_faces=True):
    """One row per mesh: name, faces, world bbox, material names."""
    rows = []
    for ob in meshes():
        b = bounds(ob)
        rows.append({
            "name": ob.name,
            "faces": len(ob.data.polygons),
            "min": [round(lo, 3) for lo, _ in b],
            "max": [round(hi, 3) for _, hi in b],
            "mats": [m.name for m in ob.data.materials if m],
        })
    if sort_by_faces:
        rows.sort(key=lambda r: -r["faces"])
    return rows


def transform_all(matrix):
    """Apply a matrix to every mesh's data (use after flatten): scale to metres, recentre, rotate."""
    for ob in meshes():
        ob.data.transform(matrix)


def scale_matrix(s, cx=0.0, cy=0.0, cz=0.0):
    """Translate (cx,cy,cz) to the origin, then scale by s — the build's SM matrix."""
    return Matrix.Diagonal((s, s, s, 1.0)) @ Matrix.Translation((-cx, -cy, -cz))


def islands(ob, decimals=5):
    """Face islands of a mesh WITHOUT modifying it.

    Imported meshes are split at every UV/normal seam, so edge connectivity is useless; faces are
    joined when they share a vertex POSITION (rounded to `decimals`). Returns a list of face-index lists.
    Note the `uf_` prefix: in a module-level script, a list named `parent` shadows a helper of the same
    name ("'list' object is not callable").
    """
    me = ob.data
    uf_par = list(range(len(me.polygons)))
    uf_key = {}

    def find(a):
        while uf_par[a] != a:
            uf_par[a] = uf_par[uf_par[a]]
            a = uf_par[a]
        return a

    for pl in me.polygons:
        for vi in pl.vertices:
            k = tuple(round(c, decimals) for c in me.vertices[vi].co)
            if k in uf_key:
                ra, rb = find(uf_key[k]), find(pl.index)
                if ra != rb:
                    uf_par[ra] = rb
            else:
                uf_key[k] = pl.index
    groups = {}
    for pl in me.polygons:
        groups.setdefault(find(pl.index), []).append(pl.index)
    return list(groups.values())


def island_bounds(ob, face_ids):
    mw = ob.matrix_world
    me = ob.data
    pts = [mw @ me.vertices[vi].co for i in face_ids for vi in me.polygons[i].vertices]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def faces_in_box(ob, lo, hi):
    """Polygon indices whose WORLD centre lies inside the box lo..hi."""
    mw = ob.matrix_world
    out = []
    for p in ob.data.polygons:
        c = mw @ p.center
        if all(lo[i] <= c[i] <= hi[i] for i in range(3)):
            out.append(p.index)
    return out


def separate(ob, name, pred):
    """Move the faces whose WORLD centre satisfies pred(c) into a new object. Returns it (or None)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    mw = ob.matrix_world
    sel = [f for f in bm.faces if pred(mw @ f.calc_center_median())]
    if not sel:
        bm.free()
        return None
    nb = bmesh.new()
    vm = {}
    for f in sel:
        vs = []
        for v in f.verts:
            if v.index not in vm:
                vm[v.index] = nb.verts.new(v.co)
            vs.append(vm[v.index])
        try:
            nf = nb.faces.new(vs)
            nf.material_index = f.material_index
            nf.smooth = f.smooth
        except ValueError:          # duplicate face from split verts — skip it
            pass
    bmesh.ops.delete(bm, geom=sel, context="FACES")
    bm.to_mesh(ob.data)
    bm.free()
    me = bpy.data.meshes.new(name)
    nb.to_mesh(me)
    nb.free()
    for m in ob.data.materials:
        me.materials.append(m)
    new = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(new)
    new.matrix_world = ob.matrix_world.copy()
    return new


def mirror_strip(src, name, pred, axis=0):
    """Copy the faces of src whose WORLD centre satisfies pred(c) to a new object mirrored across
    the given axis (0 = x). Winding is reversed so normals still point outward.

    This is how a broken part gets replaced by the correct one from the other side of a symmetric
    object, instead of being repaired.
    """
    bm = bmesh.new()
    bm.from_mesh(src.data)
    mw = src.matrix_world
    sel = [f for f in bm.faces if pred(mw @ f.calc_center_median())]
    nb = bmesh.new()
    vm = {}
    for f in sel:
        vs = []
        for v in f.verts:
            if v.index not in vm:
                w = mw @ v.co
                w[axis] = -w[axis]
                vm[v.index] = nb.verts.new(w)
            vs.append(vm[v.index])
        try:
            nf = nb.faces.new(list(reversed(vs)))
            nf.material_index = f.material_index
            nf.smooth = f.smooth
        except ValueError:
            pass
    bm.free()
    me = bpy.data.meshes.new(name)
    nb.to_mesh(me)
    nb.free()
    for m in src.data.materials:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_mode = "XYZ"
    return ob


def boundary_edges(ob):
    """Count edges with exactly one face, after welding coincident vertices (a scratch copy)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    n = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    bm.free()
    return n


def ray_grid_holes(ob, x_range, y_range, step, z_from=50.0, direction=(0, 0, -1)):
    """Cast a grid of rays at `ob` (default: from above, straight down) and return the cells that miss.

    A cell that misses where the surface should be continuous is a hole (e.g. a mount left behind when a
    roof accessory was deleted). Returns a list of (x, y) cell centres.
    """
    depsgraph = bpy.context.evaluated_depsgraph_get()
    ob_eval = ob.evaluated_get(depsgraph)
    inv = ob_eval.matrix_world.inverted()
    d_local = (inv.to_3x3() @ Vector(direction)).normalized()
    misses = []
    x = x_range[0]
    while x <= x_range[1] + 1e-9:
        y = y_range[0]
        while y <= y_range[1] + 1e-9:
            origin = inv @ Vector((x, y, z_from))
            hit, _loc, _n, _i = ob_eval.ray_cast(origin, d_local)
            if not hit:
                misses.append((round(x, 4), round(y, 4)))
            y += step
        x += step
    return misses


def parse_args(argv):
    """Args after '--' as a dict: --key value / --flag."""
    if "--" not in argv:
        return {}
    a = argv[argv.index("--") + 1:]
    out, i = {}, 0
    while i < len(a):
        if a[i].startswith("--"):
            key = a[i][2:]
            if i + 1 < len(a) and not a[i + 1].startswith("--"):
                out[key] = a[i + 1]
                i += 2
            else:
                out[key] = True
                i += 1
        else:
            out.setdefault("_", []).append(a[i])
            i += 1
    return out
