"""
lime_studio.py — a fixed "product studio" for reviewing a model headlessly in Blender 4.2+.

Generalised from clerk-van/tools/render_turntable.py. Opens nothing and saves nothing: run it on a
.blend and it only writes images to --out.

  blender --background model.blend --python lime_studio.py -- --out renders --mode preview
  blender --background model.blend --python lime_studio.py -- --out renders --mode turntable --frames 120 --root-object ClerkVan
  blender --background model.blend --python lime_studio.py -- --out renders --mode fit --length 6.2 --height 2.8
  blender --background model.blend --python lime_studio.py -- --out renders --mode shot --name mirror --loc 3.0,-3.6,1.9 --target 1.05,-1.3,1.4

What it guarantees:
  * camera rays see the background colour EXACTLY (default #7CFF00) - checked by sampling a corner pixel;
  * reflections and bounce light see a neutral grey studio, so white paint stays white (no green cast);
  * the floor is the same exact colour where it is lit, and darkens only in real shadows (calibrated);
  * "Standard" view transform, dither 0: Filmic/AgX would shift the background colour.

Axes follow the clerk-van convention (front = -Y, driver side = +X, Z up, ground at z = 0). For another
model, pass --target-z (look-at height) and --dist (camera distance) or use --mode shot with explicit points.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser(prog="lime_studio.py")
ap.add_argument("--out", required=True, help="folder for the images (created)")
ap.add_argument("--mode", default="preview", choices=["preview", "turntable", "fit", "shot", "calibrate-only"])
ap.add_argument("--bg", default="7CFF00", help="background hex colour (sRGB)")
ap.add_argument("--res", default="1280x720", help="WxH for preview/turntable/shot")
ap.add_argument("--samples", type=int, default=24)
ap.add_argument("--frames", type=int, default=120)
ap.add_argument("--root-object", default=None, help="object rotated by the turntable (default: every parentless object)")
ap.add_argument("--target-z", type=float, default=1.0, help="look-at height in metres")
ap.add_argument("--dist", type=float, default=12.3, help="camera distance for preview/turntable")
ap.add_argument("--length", type=float, default=6.2, help="model length (m) for --mode fit")
ap.add_argument("--height", type=float, default=2.8, help="model height (m) for --mode fit")
ap.add_argument("--width", type=float, default=2.4, help="model width (m) for --mode fit")
ap.add_argument("--name", default="shot")
ap.add_argument("--loc", default=None, help="x,y,z for --mode shot")
ap.add_argument("--target", default=None, help="x,y,z for --mode shot")
ap.add_argument("--lens", type=float, default=50)
args = ap.parse_args(argv)

OUT = os.path.abspath(args.out)
os.makedirs(OUT, exist_ok=True)
W, H = (int(v) for v in args.res.lower().split("x"))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


BG_SRGB = tuple(int(args.bg[i:i + 2], 16) for i in (0, 2, 4))
BG = tuple(srgb_to_linear(c / 255) for c in BG_SRGB)   # #7CFF00 -> (0.2016, 1.0, 0.0)

scene = bpy.context.scene

# rest pose: no clip may play while reviewing (NLA strips with HOLD extrapolation otherwise leave doors open)
for ob in bpy.data.objects:
    if ob.animation_data:
        ob.animation_data.action = None
        for tr in ob.animation_data.nla_tracks:
            tr.mute = True

# ---------------------------------------------------------------- world: exact colour for camera rays, grey for lighting
world = bpy.data.worlds.new("Studio")
scene.world = world
world.use_nodes = True
nt = world.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new("ShaderNodeOutputWorld")
mix = nt.nodes.new("ShaderNodeMixShader")
lp = nt.nodes.new("ShaderNodeLightPath")
bg_cam = nt.nodes.new("ShaderNodeBackground")
bg_cam.inputs["Color"].default_value = (*BG, 1)
bg_env = nt.nodes.new("ShaderNodeBackground")
tc = nt.nodes.new("ShaderNodeTexCoord")
sep_w = nt.nodes.new("ShaderNodeSeparateXYZ")
grad = nt.nodes.new("ShaderNodeValToRGB")
grad.color_ramp.elements[0].position = 0.0
grad.color_ramp.elements[0].color = (0.30, 0.31, 0.33, 1)
grad.color_ramp.elements[1].position = 1.0
grad.color_ramp.elements[1].color = (1.15, 1.17, 1.22, 1)
grad.color_ramp.elements.new(0.5).color = (0.62, 0.64, 0.68, 1)
mr = nt.nodes.new("ShaderNodeMapRange")
mr.inputs["From Min"].default_value = -1.0
mr.inputs["From Max"].default_value = 1.0
nt.links.new(tc.outputs["Generated"], sep_w.inputs["Vector"])
nt.links.new(sep_w.outputs["Z"], mr.inputs["Value"])
nt.links.new(mr.outputs["Result"], grad.inputs["Fac"])
nt.links.new(grad.outputs["Color"], bg_env.inputs["Color"])
nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
nt.links.new(bg_env.outputs["Background"], mix.inputs[1])
nt.links.new(bg_cam.outputs["Background"], mix.inputs[2])
nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

# ---------------------------------------------------------------- floor: exact colour, darkened only by real shadows
floor_mat = bpy.data.materials.new("StudioFloor")
floor_mat.use_nodes = True
fnt = floor_mat.node_tree
for n in list(fnt.nodes):
    fnt.nodes.remove(n)
fout = fnt.nodes.new("ShaderNodeOutputMaterial")
emis = fnt.nodes.new("ShaderNodeEmission")
diff = fnt.nodes.new("ShaderNodeBsdfDiffuse")
diff.inputs["Color"].default_value = (1, 1, 1, 1)
s2rgb = fnt.nodes.new("ShaderNodeShaderToRGB")
sep = fnt.nodes.new("ShaderNodeSeparateColor")
ramp = fnt.nodes.new("ShaderNodeMapRange")
ramp.clamp = True
ramp.inputs["To Min"].default_value = 0.45     # darkest shadow = 45 % of the background colour
ramp.inputs["To Max"].default_value = 1.0
mult = fnt.nodes.new("ShaderNodeMix")
mult.data_type = "RGBA"
mult.blend_type = "MULTIPLY"
mult.inputs["Factor"].default_value = 1.0
mult.inputs[6].default_value = (*BG, 1)
fnt.links.new(diff.outputs["BSDF"], s2rgb.inputs["Shader"])
fnt.links.new(s2rgb.outputs["Color"], sep.inputs["Color"])
fnt.links.new(sep.outputs["Green"], ramp.inputs["Value"])
fnt.links.new(ramp.outputs["Result"], mult.inputs[7])
fnt.links.new(mult.outputs[2], emis.inputs["Color"])
lp2 = fnt.nodes.new("ShaderNodeLightPath")
grey = fnt.nodes.new("ShaderNodeBsdfDiffuse")
grey.inputs["Color"].default_value = (0.35, 0.35, 0.35, 1)
mix2 = fnt.nodes.new("ShaderNodeMixShader")
fnt.links.new(lp2.outputs["Is Camera Ray"], mix2.inputs["Fac"])
fnt.links.new(grey.outputs["BSDF"], mix2.inputs[1])
fnt.links.new(emis.outputs["Emission"], mix2.inputs[2])
fnt.links.new(mix2.outputs["Shader"], fout.inputs["Surface"])
floor_me = bpy.data.meshes.new("StudioFloor")
floor_me.from_pydata([(-15, -15, 0), (15, -15, 0), (15, 15, 0), (-15, 15, 0)], [], [(0, 1, 2, 3)])
floor = bpy.data.objects.new("StudioFloor", floor_me)
scene.collection.objects.link(floor)
floor.data.materials.append(floor_mat)

# ---------------------------------------------------------------- lights: sun key on the camera side + area fills
sun_d = bpy.data.lights.new("Key", "SUN")
sun_d.energy = 4.6
sun_d.angle = math.radians(9)
sun_d.color = (1.0, 0.98, 0.95)
sun_o = bpy.data.objects.new("Key", sun_d)
scene.collection.objects.link(sun_o)
sun_o.location = (5.5, -7.5, 9.0)
sun_o.rotation_euler = (Vector((0, 0, 1.0)) - Vector(sun_o.location)).to_track_quat("-Z", "Y").to_euler()


def area(name, loc, target, energy, size, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.size, ld.color = energy, size, color
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


area("Fill", (-8.0, -4.0, 4.5), (0, 0, 1.0), 900, 8.0, (0.95, 0.97, 1.0))
area("Rim", (-1.0, 9.0, 6.0), (0, 0, 1.2), 900, 5.0)
area("Top", (0.0, 0.0, 9.0), (0, 0, 0.0), 700, 10.0)

# ---------------------------------------------------------------- camera
cam_data = bpy.data.cameras.new("ReviewCam")
cam_data.lens = args.lens
cam = bpy.data.objects.new("ReviewCam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def aim(loc, target):
    """Point the camera from loc at target (Blender cameras look down -Z with +Y up)."""
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------- render settings
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.eevee.taa_render_samples = args.samples
for attr, value in (("use_raytracing", True), ("use_shadows", True), ("use_gtao", True), ("gtao_distance", 0.6)):
    try:
        setattr(scene.eevee, attr, value)
    except Exception:
        pass
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = W, H, 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.film_transparent = False
scene.render.dither_intensity = 0.0              # dither would add +-1 noise to the exact background colour
scene.view_settings.view_transform = "Standard"  # Filmic / AgX shift the background colour
scene.view_settings.look = "None"
scene.display_settings.display_device = "sRGB"

D = args.dist
TZ = args.target_z
aim((D * 0.667, -D * 0.748, TZ + 2.6), (0, 0, TZ))


def render(path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def calibrate_floor():
    """Render a tiny raw frame and set the Map Range so open, lit floor maps to exactly the background."""
    link_raw = fnt.links.new(s2rgb.outputs["Color"], emis.inputs["Color"])
    saved = (scene.render.resolution_x, scene.render.resolution_y, scene.eevee.taa_render_samples,
             scene.view_settings.view_transform, scene.render.image_settings.file_format, scene.render.image_settings.color_depth)
    scene.render.resolution_x, scene.render.resolution_y = 192, 108
    scene.eevee.taa_render_samples = 8
    scene.view_settings.view_transform = "Raw"
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    tmp = os.path.join(OUT, "_calib.exr")
    scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(tmp)
    px = list(im.pixels)
    w, _h = im.size
    lit = max(px[(4 * w + x) * 4 + 1] for x in range(4, w - 4, 8))   # bottom row = open floor near the camera
    bpy.data.images.remove(im)
    os.remove(tmp)
    fnt.links.remove(link_raw)
    fnt.links.new(mult.outputs[2], emis.inputs["Color"])
    ramp.inputs["From Min"].default_value = lit * 0.30
    ramp.inputs["From Max"].default_value = lit * 0.72   # falloff across the floor stays exact; only real shadows darken
    (scene.render.resolution_x, scene.render.resolution_y, scene.eevee.taa_render_samples,
     scene.view_settings.view_transform, scene.render.image_settings.file_format, scene.render.image_settings.color_depth) = saved
    print("floor calibration: lit value =", lit)


calibrate_floor()

if args.mode == "preview":
    for name, (loc, target) in {
        "front34": ((D * 0.62, -D * 0.70, TZ + 2.2), (0, 0.1, TZ - 0.05)),
        "rear34": ((-D * 0.62, D * 0.70, TZ + 2.2), (0, -0.1, TZ - 0.05)),
        "side": ((D * 0.94, 0.0, TZ + 0.6), (0, 0, TZ)),
        "front": ((0, -D * 0.94, TZ + 0.6), (0, 0, TZ)),
        "rear": ((0, D * 0.94, TZ + 0.6), (0, 0, TZ)),
        "top34": ((D * 0.41, -D * 0.49, TZ + 7.0), (0, 0, TZ - 0.2)),
    }.items():
        aim(loc, target)
        render(os.path.join(OUT, f"preview_{name}.png"))

elif args.mode == "fit":
    # orthographic views sized to the model, for checking livery placement panel by panel
    cam_data.type = "ORTHO"
    L, Hh, Wd = args.length, args.height, args.width
    for name, (loc, target, ortho, res) in {
        "sideL": ((30, 0, Hh / 2), (0, 0, Hh / 2), L * 1.06, (1800, 800)),
        "sideR": ((-30, 0, Hh / 2), (0, 0, Hh / 2), L * 1.06, (1800, 800)),
        "front": ((0, -30, Hh / 2), (0, 0, Hh / 2), max(Wd, Hh) * 1.1, (1000, 1000)),
        "rear": ((0, 30, Hh / 2), (0, 0, Hh / 2), max(Wd, Hh) * 1.1, (1000, 1000)),
        "top": ((0, 0, 30), (0, 0.0001, 0), L * 1.06, (800, 1800)),
    }.items():
        scene.render.resolution_x, scene.render.resolution_y = res
        cam_data.ortho_scale = ortho
        aim(loc, target)
        render(os.path.join(OUT, f"fit_{name}.png"))

elif args.mode == "shot":
    if not (args.loc and args.target):
        sys.exit("--mode shot needs --loc x,y,z and --target x,y,z")
    aim(tuple(float(v) for v in args.loc.split(",")), tuple(float(v) for v in args.target.split(",")))
    render(os.path.join(OUT, f"shot_{args.name}.png"))

elif args.mode == "turntable":
    roots = [bpy.data.objects[args.root_object]] if args.root_object else [
        o for o in bpy.data.objects if o.parent is None and o.type not in {"CAMERA", "LIGHT"} and o is not floor]
    for r in roots:
        r.rotation_mode = "XYZ"
        r.animation_data_clear()
        r.rotation_euler = (0, 0, 0)
        r.keyframe_insert("rotation_euler", frame=1, index=2)
        r.rotation_euler = (0, 0, math.radians(360))
        # key 360 deg at FRAMES + 1, render 1..FRAMES: the last frame is not a duplicate of the first, so the loop is seamless
        r.keyframe_insert("rotation_euler", frame=args.frames + 1, index=2)
        for fc in r.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    scene.frame_start, scene.frame_end = 1, args.frames
    scene.render.fps = 30
    tdir = os.path.join(OUT, "turntable")
    os.makedirs(tdir, exist_ok=True)
    scene.render.filepath = os.path.join(tdir, "frame_")
    bpy.ops.render.render(animation=True)
    print("turntable frames in", tdir)
