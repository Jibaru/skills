"""rig_lib.py — rig a vehicle in Blender (4.2+) for glTF: pivots, NLA clips, lights, export.

Patterns from clerk-van/tools/build_transit_van.py (pivots and clips there are verified to load in
Three.js r170 by web/app.js). Import from a `blender --background --python` script:

    import sys, os; sys.path.append("<this scripts dir>")
    from rig_lib import *

Axes: Blender is Z-up. With export_yup=True, Blender (x, y, z) becomes glTF (x, z, -y): a vehicle whose
nose points to Blender -Y ends up facing glTF +Z, and Blender +X (driver side here) stays +X.
"""
import math
import bpy
from mathutils import Vector, Matrix


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def parent(child, par, keep=True):
    """Parent `child` to `par` without moving it.

    view_layer.update() FIRST: matrix_world of objects created or moved in this script is stale until the
    depsgraph updates, and a parent inverse computed from a stale matrix leaves children offset.
    keep=True stores par's inverse so the child keeps its world placement (build_transit_van.py:34-37).
    For a child that should sit exactly at the pivot, set child.location = (0,0,0) and child.parent = par
    instead (that is how the front wheels hang from Steer_L/R, build_transit_van.py:593).
    """
    bpy.context.view_layer.update()
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted() if keep else Matrix()


def pivot(name, location, parent_to=None, members=()):
    """An empty at a hinge/axle location, optionally parented, with mesh members parented to it."""
    p = link(bpy.data.objects.new(name, None))
    p.location = location
    p.rotation_mode = "XYZ"
    if parent_to is not None:
        parent(p, parent_to)
    for m in members:
        parent(m, p)
    return p


def set_origin(ob, point):
    """Move a mesh object's origin to `point` (world, for an unparented flattened mesh): needed so a wheel
    rotates about its own axle rather than the scene origin."""
    pv = Vector(point)
    ob.data.transform(Matrix.Translation(-pv))
    ob.location = pv


def add_clip(obj, clip, path, keys, index=-1, linear=False):
    """Key `obj.<path>` and push the action to an NLA track named `clip` (one track per clip).

    glTF exporters with export_animation_mode="NLA_TRACKS" turn each track name into one animation,
    so several objects can contribute to the same clip ("AllDoors_Open") by using the same name.
    keys: [(frame, value)], value is a float when index >= 0 (one component), else a full vector.
    Leaves the object at the first key's value (rest pose) with no active action.
    """
    if obj.animation_data is None:
        obj.animation_data_create()
    obj.animation_data.action = None

    def put(val):
        if index >= 0:
            v = list(getattr(obj, path))
            v[index] = val
            setattr(obj, path, v)
        else:
            setattr(obj, path, val)

    for f, val in keys:
        put(val)
        obj.keyframe_insert(data_path=path, frame=f, index=index)
    act = obj.animation_data.action
    act.name = f"{clip}.{obj.name}"
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR" if linear else "BEZIER"
    track = obj.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, int(keys[0][0]), act)
    obj.animation_data.action = None
    put(keys[0][1])
    return track


def add_light(name, kind, loc, watts, color, parent_to=None, rot=None, spot_deg=70.0, blend=0.6):
    """Spot/Point light exported via KHR_lights_punctual.

    Units change on export: Blender watts become candela (spot/point) — the Transit's 60 W spots export
    as ~3261 cd and 8 W points as ~435 cd. Engines then reinterpret those, so the viewer usually sets its
    own on/off intensities (web/app.js uses 60 and 6) rather than trusting the exported value.
    """
    ld = bpy.data.lights.new(name, kind)
    ld.energy = watts
    ld.color = color
    if kind == "SPOT":
        ld.spot_size = math.radians(spot_deg)
        ld.spot_blend = blend
    ob = link(bpy.data.objects.new(name, ld))
    ob.location = loc
    if rot:
        ob.rotation_euler = rot
    if parent_to is not None:
        parent(ob, parent_to)
    return ob


def lens_material(name, color, emissive):
    """Principled material whose emission COLOUR is set but STRENGTH is 0: lights off by default; the
    engine raises emissiveIntensity / emission_energy to switch the lamp on."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes["Principled BSDF"]
    bs.inputs["Base Color"].default_value = (*color, 1.0)
    bs.inputs["Emission Color"].default_value = (*emissive, 1.0)
    bs.inputs["Emission Strength"].default_value = 0.0
    return m


def export_glb(path, save_blend=None):
    """Export every NLA track as a glTF animation, then leave the .blend in rest pose.

    Order matters: the tracks must be UNMUTED during export (a muted track is skipped), and AFTER export
    each track is muted and every strip's extrapolation set to NOTHING. With the default HOLD, opening the
    .blend (or rendering a turntable from it) shows every door held open by its clip.
    """
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_yup=True, export_apply=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_lights=True,
        export_cameras=False, export_extras=True, use_selection=False,
        export_materials="EXPORT", export_normals=True, export_texcoords=True,
    )
    for ob in bpy.data.objects:
        if ob.animation_data:
            for tr in ob.animation_data.nla_tracks:
                tr.mute = True
                for st in tr.strips:
                    st.extrapolation = "NOTHING"
    if save_blend:
        try:
            bpy.ops.file.pack_all()
        except Exception:
            pass
        bpy.ops.wm.save_as_mainfile(filepath=save_blend)
