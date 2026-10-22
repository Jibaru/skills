"""
project_uv.py — box-project a metre-based livery atlas onto a model in Blender, choosing the panel per face
by POSITION first and normal second.

Generalised from clerk-van/tools/build_transit_van.py (uv_rect + project_uv, lines 84-131). Use inside a
Blender build script (blender --background --python build.py):

    import sys; sys.path.insert(0, "/path/to/livery-atlas-painting/scripts")
    from project_uv import project_uv, Zones
    layout = json.load(open("textures/atlas_layout.json"))
    zones = Zones.from_mesh(body)          # roof height, nose and tail from the body's bounding box
    project_uv(body, {livery_slot_index}, layout, zones)

Why position before normal: real meshes are full of thin edge faces, bevels and wraps whose normal points
sideways while they sit on the roof or the nose. Picking the panel by normal alone sends those faces to the
wrong panel (a stripe of side livery on the roof edge). Zones decide by where the face IS; the dominant normal
is only the fallback.

Axes: front = -Y, rear = +Y, driver side (left, side_left panel) = +X, Z up. The atlas layout JSON is the one
livery_view.pack_atlas / clerk-van gen_textures.py writes: {"size", "regions": {name: [x0,y0,x1,y1]},
"extents": {"side": [a0,a1,b0,b1], "front": [...], "rear": [...], "top": [...]}} with extents in metres.
"""
from dataclasses import dataclass


@dataclass
class Zones:
    """Thresholds of the position rules, in metres. Defaults are clerk-van's Transit values (build_transit_van.py:101-112)."""
    roof_z: float            # top of the body
    y_front: float           # nose (most negative y)
    y_rear: float            # tail (most positive y)
    side_x: float = 0.74     # |x| beyond this (and below the roof) is a side face
    roof_band: float = 0.10  # faces within this of roof_z, facing up (|n.z| > 0.4), are roof
    rear_band: float = 0.45  # faces within this of the tail (and above rear_min_z) are rear
    rear_min_z: float = 0.30
    hood_band: float = 0.90  # faces within this of the nose, below hood_max_z, facing up (n.z > 0.3), are hood (top panel)
    hood_max_z: float = 1.45
    front_band: float = 0.70 # remaining faces within this of the nose are front

    @classmethod
    def from_mesh(cls, ob, **overrides):
        mw = ob.matrix_world
        ws = [mw @ v.co for v in ob.data.vertices]
        return cls(roof_z=max(v.z for v in ws), y_front=min(v.y for v in ws), y_rear=max(v.y for v in ws), **overrides)


def uv_rect(layout, region):
    """Atlas pixel rect -> Blender UV rect (Blender's v axis points up, image rows point down)."""
    size = layout["size"]
    x0, y0, x1, y1 = layout["regions"][region]
    return (x0 / size, 1 - y1 / size, x1 / size, 1 - y0 / size)


def face_mode(c, n, z):
    """Which panel a face belongs to, from its world centre c and world normal n."""
    ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
    if c.z > z.roof_z - z.roof_band and az > 0.4:
        return "top"
    if abs(c.x) > z.side_x and c.z < z.roof_z - 0.05:
        return "side"
    if c.y > z.y_rear - z.rear_band and c.z > z.rear_min_z:
        return "rear"
    if c.y < z.y_front + z.hood_band and c.z < z.hood_max_z and n.z > 0.3:
        return "top"
    if c.y < z.y_front + z.front_band:
        return "front"
    if ax >= ay and ax >= az:
        return "side"
    if ay >= az:
        return "front" if n.y < 0 else "rear"
    return "top" if n.z > 0 else "bottom"


def project_uv(obj, mat_indices, layout, zones, uv_name=None):
    """Write UVs for every face whose material slot is in mat_indices. Returns {mode: face count}."""
    me = obj.data
    if uv_name:
        layer = me.uv_layers.get(uv_name) or me.uv_layers.new(name=uv_name)
    else:
        layer = me.uv_layers.active or me.uv_layers.new(name="UVMap")
    uv = layer.data
    ext = layout["extents"]
    mw = obj.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    counts = {}
    for poly in me.polygons:
        if poly.material_index not in mat_indices:
            continue
        n = (nm @ poly.normal).normalized()
        c = mw @ poly.center
        mode = face_mode(c, n, zones)
        counts[mode] = counts.get(mode, 0) + 1
        # which side panel: by position for side faces (a face on the right flank is right even if its normal is odd)
        sx = 1 if (c.x > 0 if mode == "side" else n.x > 0) else -1
        for li in poly.loop_indices:
            p = mw @ me.vertices[me.loops[li].vertex_index].co
            if mode == "side":
                a0, a1, b0, b1 = ext["side"]
                v = (p.z - b0) / (b1 - b0)
                if sx > 0:
                    u, reg = (p.y - a0) / (a1 - a0), "side_left"     # driver side: nose on the image's left
                else:
                    u, reg = (a1 - p.y) / (a1 - a0), "side_right"    # passenger side: nose on the right
            elif mode == "front":
                a0, a1, b0, b1 = ext["front"]
                u, v, reg = (p.x - a0) / (a1 - a0), (p.z - b0) / (b1 - b0), "front"
            elif mode == "rear":
                a0, a1, b0, b1 = ext.get("rear", ext["front"])
                u, v, reg = (a1 - p.x) / (a1 - a0), (p.z - b0) / (b1 - b0), "rear"
            elif mode == "top":
                a0, a1, b0, b1 = ext["top"]
                u, v, reg = (a1 - p.x) / (a1 - a0), (b1 - p.y) / (b1 - b0), "top"   # nose at the top of the image
            else:
                u, v, reg = 0.5, 0.5, "bottom"
            u0, v0, u1, v1 = uv_rect(layout, reg)
            uv[li].uv = (u0 + u * (u1 - u0), v0 + v * (v1 - v0))
    return counts
