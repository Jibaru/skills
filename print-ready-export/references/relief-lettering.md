# Raised logos and lettering, conformed to a curved body

Clerk-van turned every graphic of its livery (logos, wordmarks, "FREE COOKIES", QR codes) into closed relief
solids that follow the van's surface. There are two halves, and they run in different Pythons:

1. **System Python** (has OpenCV): mask PNG → polygons in panel metres → JSON. `tools/print_mask_polys.py`.
2. **Blender's Python** (no `cv2`): JSON → filled 2-D curves → closed extrusions → ray-cast onto the body.
   `tools/build_print_van.py`, section 3 (lines 215-328).

The display model keeps the letters flat in the texture atlas. Relief exists only in the printable build.

## 0. Record a mask while drawing the livery

Don't extract outlines from the finished texture by colour thresholding. Record them as you draw. In
`tools/gen_textures.py` each panel's `View` owns a greyscale mask next to its image. Every **pasted graphic** writes
its alpha into the mask, and every **text** call draws the same text in white. Base paint (`rect`, `poly`) doesn't:

```python
# tools/gen_textures.py:138-141
        # relief mask for the printable model: every pasted graphic / text is white here, base paint is black
        self.mask = Image.new("L", (w, h), 0)
        self.dm = ImageDraw.Draw(self.mask)
# :174 (paste)
        self.mask.paste(255, pos, layer.getchannel("A"))
# :181 (text, unrotated; rotated text goes through paste())
            self.dm.text(self.p(a, b), s, font=f, fill=255, anchor=anchor)
```

The masks are saved as `textures/print_mask/<panel>_<profile>.png` (line 514). You get the exact outlines of every
graphic with zero heuristics.

## 1. Vectorise: tools/print_mask_polys.py (system Python, OpenCV)

```bash
python tools/print_mask_polys.py --profile transit     # → textures/print_mask/polys_transit.json
```

Key lines:

```python
# tools/print_mask_polys.py:36-40
    mask = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    mask = (mask > 127).astype(np.uint8) * 255
    # 1 px dilation (~2 mm at full scale): QR modules that only touch at a corner would otherwise give a
    # contour passing twice through one vertex, which extrudes into a non-manifold pinch
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
# :54-71
    cnts, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    ...
            if hier[i][3] != -1 or cv2.contourArea(c) < 4:     # outer contours only, skip specks
                continue
            oc = cv2.approxPolyDP(c, args.epsilon, True)       # epsilon 0.3 px by default
            ...
            j = hier[i][2]                                     # first hole of this outer contour
            while j != -1:
                ...
                j = hier[j][0]                                 # next sibling hole
            shapes.append({"outer": to_m(oc), "holes": holes})
```

- `RETR_CCOMP` gives a two-level hierarchy: outers, and their holes (the inside of an "o", the eye of a "B").
- `to_m()` inverts the panel's pixel mapping back to **vehicle metres**. Respect the same `flip` as the texture
  generator, or the right flank's letters come out mirrored.
- The output is `{panel: [{"outer": [[a,b],...], "holes": [[[a,b],...], ...]}]}`.

The panel conventions are the same ones the texture atlas uses (docstring, lines 9-13). side_left uses a=y, b=z.
side_right uses a=y, flipped. front and rear use a=x, b=z, with rear flipped. top uses a=x, flipped, and b=−y, with the nose
at the top of the image.

## 2. Build closed glyph solids: build_print_van.py:239-270

One filled 2-D curve per shape, with one cyclic POLY spline per ring (outer plus holes), extruded to ±0.5. That's a
unit thickness that gets remapped per vertex later:

```python
    cu = bpy.data.curves.new(tag, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = 0.5                      # unit thickness, remapped per vertex later
    cu.resolution_u = 1
    for ring in rings:
        sp = cu.splines.new("POLY")
        sp.points.add(len(ring) - 1)
        for k, (a, b) in enumerate(ring):
            sp.points[k].co = (a, b, 0, 1)
        sp.use_cyclic_u = True
    ...
    bpy.ops.object.convert(target="MESH")
    bm = bmesh.new()
    bm.from_mesh(co.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    closed = bm.faces and all(len(e.link_faces) == 2 for e in bm.edges)
```

**Closure check with a fallback** (lines 280-286). Blender's curve filler sometimes fails on a glyph whose hole touches
its outline. That happened to one small "s" in the rear copy. Retry with the **outer ring only**, which makes a solid
glyph. If that's still open, drop it and log it. Never ship an open glyph.

## 3. Conform to the body: build_print_van.py:202, 229-236, 298-321

Build a BVH of the **solidified** body:

```python
shell_bvh = BVHTree.FromPolygons([v.co[:] for v in ext.data.vertices], [p.vertices[:] for p in ext.data.polygons])
```

The dump reported that `BVHTree.FromObject` returned nothing for a freshly modified mesh. `FromPolygons` on the mesh
data avoids the question.

For each panel, a ray origin outside the body and a cast direction (inward):

```python
PANELS = {
    "side_left":  (lambda a, b: Vector((3.0, a, b)),  Vector((-1, 0, 0))),
    "side_right": (lambda a, b: Vector((-3.0, a, b)), Vector((1, 0, 0))),
    "front":      (lambda a, b: Vector((a, -6.0, b)), Vector((0, 1, 0))),
    "rear":       (lambda a, b: Vector((a, 6.0, b)),  Vector((0, -1, 0))),
    "top":        (lambda a, b: Vector((a, -b, 6.0)), Vector((0, 0, -1))),
}
```

Move every glyph vertex `(a, b, ±0.5)` to the first hit. The top face (`z > 0`) goes **RELIEF** outward, and the base
goes **EMBED** inward:

```python
RELIEF = 15.0 / 1000.0   # metres at full scale: 0.6 mm at 1:24 (CLI arg)
EMBED = WALL * 0.5       # 2 cm = half the 4 cm wall, so the base reaches back to the original surface
...
        loc, nrm, idx, dist = shell_bvh.ray_cast(origin(a, b), direc, 20.0)
        if loc is None:
            lost += 1                     # off the body: deleted with its faces afterwards
            ...
        off = RELIEF if zz > 0 else -EMBED
        new_co.append(loc - direc * off)
```

Then: delete the vertices that missed, `remove_doubles(1e-4)`, `recalc_face_normals`, triangulate. The log line per panel
reports faces, off-body vertices and **open edges**, which must be 0.

**Colour for a two-colour print:** the relief is white (`ReliefWhite`). The hood lockup is purple (`#6C47FF` →
`(0.147, 0.058, 1.0)`). Those are top-panel faces ahead of the windscreen, `p.center.y < YF_Z + 1.2`, where `YF_Z` is
the body's front-most y (lines 225-226, 322-326).

## Sizing rules

- 15 mm relief at full size is 0.6 mm at 1:24, which shows on both FDM and resin.
- 5 cm letters at full size become 2 mm. Under about 3 cm full size, text is marginal on FDM.
- The 1 px dilation adds roughly 2 mm at full size around every glyph. Account for it on very fine text.

## Checks

- Every panel logged `open edges 0`.
- `stl_check.mjs` on the relief STL: **0 boundary, 0 shared**. That's what clerk-van's `_relief.stl` measures.
- Render a close-up with the sun on the camera side, so the relief casts visible shadows, before telling the user
  it's done.
