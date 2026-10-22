"""demo_rig.py — build a toy vehicle with the full rig contract and export it, to check a pipeline end to end.

  blender --background --python demo_rig.py -- <out_dir>
  node glb_rig_report.mjs <out_dir>/demo_van.glb --expect Door_FL,Door_FR,Door_Slide,Wheel_FL,Wheel_RL,Steer_L,Steer_R,Light_HeadL,Light_TailL

Body = a box with nose at -Y, driver side +X; one hinged door per side, a sliding door, four wheels
(front ones under Steer_L/R), head and tail lights, lens materials, and the clips the real build ships.
Replace the primitives with the separated parts of a real asset; keep the names and the pivot logic.
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from rig_lib import link, parent, pivot, set_origin, add_clip, add_light, lens_material, export_glb

out = os.path.abspath(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else os.getcwd()
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

WHEEL_R, HALF_W, YF, YR = 0.36, 1.0, -2.9, 2.9


def box(name, size, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return ob


root = link(bpy.data.objects.new("Vehicle", None))
body = box("Body", (2 * HALF_W, YR - YF, 1.8), (0, 0, 0.3 + 0.9 + WHEEL_R))
parent(body, root)

# doors: thin slabs on the flanks, hinge at the front edge (y min)
door_l = box("Door_FL_skin", (0.04, 0.9, 1.0), (HALF_W + 0.02, -1.6, 1.4))
door_r = box("Door_FR_skin", (0.04, 0.9, 1.0), (-HALF_W - 0.02, -1.6, 1.4))
slide = box("Door_Slide_skin", (0.04, 1.2, 1.3), (-HALF_W - 0.02, 0.0, 1.4))
d_fl = pivot("Door_FL", (HALF_W, -2.05, 1.4), parent_to=body, members=[door_l])
d_fr = pivot("Door_FR", (-HALF_W, -2.05, 1.4), parent_to=body, members=[door_r])
d_sl = pivot("Door_Slide", (-HALF_W - 0.02, 0.0, 1.4), parent_to=body, members=[slide])

wheels = []
for tag, x, y in (("FL", 0.85, -1.9), ("FR", -0.85, -1.9), ("RL", 0.85, 1.85), ("RR", -0.85, 1.85)):
    bpy.ops.mesh.primitive_cylinder_add(radius=WHEEL_R, depth=0.25, location=(x, y, WHEEL_R),
                                        rotation=(0, math.radians(90), 0))
    w = bpy.context.active_object
    w.name = "Wheel_" + tag
    bpy.ops.object.transform_apply(rotation=True)
    set_origin(w, (x, y, WHEEL_R))          # rotate about the axle, not the scene origin
    if tag.startswith("F"):
        st = pivot("Steer_" + tag[1], (x, y, WHEEL_R), parent_to=root)
        w.location = (0, 0, 0)
        w.parent = st                       # sits exactly at the steering pivot
    else:
        parent(w, root)
    wheels.append(w)

head = lens_material("Headlight_Lens", (0.72, 0.75, 0.82), (1.0, 0.98, 0.9))
tail = lens_material("Taillight_Lens", (0.6, 0.05, 0.05), (1.0, 0.08, 0.05))
for sx, side in ((1, "L"), (-1, "R")):
    hl = box(f"Headlight_{side}", (0.3, 0.05, 0.15), (sx * 0.7, YF - 0.03, 1.0))
    hl.data.materials.append(head)
    parent(hl, body)
    tl = box(f"Taillight_{side}", (0.15, 0.05, 0.3), (sx * 0.9, YR + 0.03, 1.0))
    tl.data.materials.append(tail)
    parent(tl, body)
    add_light(f"Light_Head{side}", "SPOT", (sx * 0.72, YF - 0.05, 1.0), 60.0, (1.0, 0.97, 0.88),
              parent_to=body, rot=(math.radians(-85), 0, 0))
    add_light(f"Light_Tail{side}", "POINT", (sx * 0.95, YR + 0.08, 1.05), 8.0, (1.0, 0.08, 0.05), parent_to=body)

for ob, clip, keys in ((d_fl, "DoorFL_Open", [(1, 0.0), (30, math.radians(-65))]),
                       (d_fr, "DoorFR_Open", [(1, 0.0), (30, math.radians(65))])):
    add_clip(ob, clip, "rotation_euler", keys, 2)
    add_clip(ob, "AllDoors_Open", "rotation_euler", keys, 2)
L0 = d_sl.location.copy()
slide_keys = [(1, tuple(L0)), (8, (L0.x - 0.10, L0.y, L0.z)), (30, (L0.x - 0.10, L0.y + 1.15, L0.z))]
add_clip(d_sl, "DoorSlide_Open", "location", slide_keys)
add_clip(d_sl, "AllDoors_Open", "location", slide_keys)
for w in wheels:
    add_clip(w, "Wheels_Spin", "rotation_euler", [(1, 0.0), (31, math.radians(360))], 0, linear=True)
scene.frame_start, scene.frame_end = 1, 30

glb = os.path.join(out, "demo_van.glb")
export_glb(glb, save_blend=os.path.join(out, "demo_van.blend"))
print("DEMO OK", glb, os.path.getsize(glb))
