"""inventory.py — import a model, flatten transforms, optionally scale it to metres, and print a parts table.

  blender --background --python inventory.py -- <model.glb> [--json out.json] [--top 60]
          [--known-length 3.75 --between NAME_A,NAME_B --axis y] [--centre] [--islands NAME]

--known-length/--between/--axis: compute the metres-per-unit scale from one known real dimension
  measured between the centres of two parts (e.g. front and rear tyre: wheelbase 3.75 m on axis y).
--centre: translate so the bbox centre is x=0, y=0 and the lowest point is z=0 (tyres on the ground).
--islands NAME: list the face islands of one object (finds wipers, antennas, badges merged into a body).

Read-only on the source: nothing is saved unless you save yourself.
"""
import bpy
import json
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from teardown_lib import (import_any, flatten, inventory, meshes, centre, bounds, transform_all,
                          scale_matrix, islands, island_bounds, parse_args)
from mathutils import Matrix

args = parse_args(sys.argv)
if not args.get("_"):
    raise SystemExit(__doc__)
src = os.path.abspath(args["_"][0])
import_any(src)
flatten()

scale = 1.0
if "known-length" in args and "between" in args:
    a_name, b_name = args["between"].split(",")
    axis = "xyz".index(args.get("axis", "y"))
    a, b = bpy.data.objects[a_name], bpy.data.objects[b_name]
    measured = abs(centre(a)[axis] - centre(b)[axis])
    scale = float(args["known-length"]) / measured
    print(f"scale: {args['known-length']} m / {measured:.4f} units = {scale:.6f} m/unit")
    transform_all(scale_matrix(scale))

if args.get("centre"):
    lo = [min(bounds(o)[i][0] for o in meshes()) for i in range(3)]
    hi = [max(bounds(o)[i][1] for o in meshes()) for i in range(3)]
    transform_all(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))

rows = inventory()
lo = [min(r["min"][i] for r in rows) for i in range(3)]
hi = [max(r["max"][i] for r in rows) for i in range(3)]
print(f"\n{len(rows)} meshes, {sum(r['faces'] for r in rows)} faces")
print(f"overall x[{lo[0]:.3f},{hi[0]:.3f}] y[{lo[1]:.3f},{hi[1]:.3f}] z[{lo[2]:.3f},{hi[2]:.3f}]  size "
      f"{hi[0]-lo[0]:.3f} x {hi[1]-lo[1]:.3f} x {hi[2]-lo[2]:.3f}")
top = int(args.get("top", 60))
for r in rows[:top]:
    mn, mx = r["min"], r["max"]
    print(f"  {r['name'][:28]:<28} {r['faces']:>7}  x[{mn[0]:.2f},{mx[0]:.2f}] y[{mn[1]:.2f},{mx[1]:.2f}] "
          f"z[{mn[2]:.2f},{mx[2]:.2f}]  mats={r['mats'][:3]}")
if len(rows) > top:
    print(f"  … {len(rows) - top} more (use --top or --json)")

if "islands" in args:
    ob = bpy.data.objects[args["islands"]]
    groups = sorted(islands(ob), key=len, reverse=True)
    print(f"\nislands of {ob.name}: {len(groups)}")
    for g in groups[:40]:
        mn, mx = island_bounds(ob, g)
        print(f"  {len(g):>7} faces  x[{mn[0]:.2f},{mx[0]:.2f}] y[{mn[1]:.2f},{mx[1]:.2f}] z[{mn[2]:.2f},{mx[2]:.2f}]")

if "json" in args:
    with open(args["json"], "w", encoding="utf-8") as f:
        json.dump({"source": src, "scale": scale, "objects": rows}, f, indent=1)
    print(f"\nwrote {args['json']}")
