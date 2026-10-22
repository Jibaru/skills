"""find_holes.py — locate holes in a surface by casting a grid of rays and listing the cells that miss.

  blender --background --python find_holes.py -- <model.glb|.blend> --object NAME
          --x -0.8,0.8 --y -0.5,1.0 [--step 0.05] [--from 5] [--dir down|up|+x|-x|+y|-y]
          [--near Z] [--scale S --offset cx,cy,cz]

--near: the surface's expected coordinate along the ray axis (e.g. roof height for --dir down). A ray
that hits something DEEPER than this went through a hole and struck the interior (floor, seats) — count
it as a miss. Without it, a hole in a closed vehicle body is invisible: every ray hits something.

Coordinates are WORLD metres after optional scaling: world = (asset - offset) * scale. With --dir down
(default) the grid lies in x/y and rays fall from z=--from. For a side panel use --dir -x with --x
meaning y and --y meaning z (the two grid axes are always the ones perpendicular to the ray).

Prints the miss cells and their bounding box — the region a patch must cover. Patch ONLY that region:
a full-width plate over a small hole reads as a slab from low angles.
"""
import bpy
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from teardown_lib import import_any, flatten, transform_all, scale_matrix, parse_args
from mathutils import Vector

args = parse_args(sys.argv)
if not args.get("_") or "object" not in args:
    raise SystemExit(__doc__)
src = os.path.abspath(args["_"][0])
if src.lower().endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=src)
else:
    import_any(src)
    flatten()
if "scale" in args:
    off = [float(v) for v in args.get("offset", "0,0,0").split(",")]
    transform_all(scale_matrix(float(args["scale"]), *off))

ob = bpy.data.objects[args["object"]]
g0 = [float(v) for v in args["x"].split(",")]
g1 = [float(v) for v in args["y"].split(",")]
step = float(args.get("step", 0.05))
far = float(args.get("from", 5.0))
DIRS = {"down": (2, -1), "up": (2, 1), "+x": (0, 1), "-x": (0, -1), "+y": (1, 1), "-y": (1, -1)}
axis, sign = DIRS[args.get("dir", "down")]
near = float(args["near"]) if "near" in args else None
others = [i for i in range(3) if i != axis]

depsgraph = bpy.context.evaluated_depsgraph_get()
ev = ob.evaluated_get(depsgraph)
inv = ev.matrix_world.inverted()
d = Vector((0.0, 0.0, 0.0))
d[axis] = sign
d_local = (inv.to_3x3() @ d).normalized()

misses, total = [], 0
a = g0[0]
while a <= g0[1] + 1e-9:
    b = g1[0]
    while b <= g1[1] + 1e-9:
        p = Vector((0.0, 0.0, 0.0))
        p[others[0]], p[others[1]] = a, b
        p[axis] = -sign * far
        hit, loc, _n, _i = ev.ray_cast(inv @ p, d_local)
        total += 1
        too_deep = False
        if hit and near is not None:
            w = ev.matrix_world @ loc
            too_deep = (w[axis] - near) * sign > 0      # past the expected surface along the ray
        if not hit or too_deep:
            misses.append((round(a, 4), round(b, 4)))
        b += step
    a += step

names = "xyz"
print(f"\n{ob.name}: {len(misses)} of {total} rays missed (grid {names[others[0]]} x {names[others[1]]}, step {step} m)")
if misses:
    lo0, hi0 = min(m[0] for m in misses), max(m[0] for m in misses)
    lo1, hi1 = min(m[1] for m in misses), max(m[1] for m in misses)
    print(f"miss bbox: {names[others[0]]}[{lo0:.3f},{hi0:.3f}] {names[others[1]]}[{lo1:.3f},{hi1:.3f}]")
    for m in misses[:60]:
        print("  miss", m)
