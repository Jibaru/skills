"""
livery_view.py — draw a vehicle (or any object) livery in METRES, not pixels, and pack it into an atlas.

Generalised from clerk-van/tools/gen_textures.py (View class, lines 129-191; qr_layer 213-224; atlas
packing 479-517). Import it from your own generator:

    from livery_view import View, qr_layer, load_logo, pack_atlas

    side = View(2900, 1310, -3.1, 3.1, 0.0, 2.8)            # a = y in [-3.1, 3.1] m, b = z in [0, 2.8] m
    side.rect(-3.1, 0.0, 3.1, 0.73, (52, 55, 61))           # lower cladding below z = 0.73 m
    side.poly([(-0.66, 2.8), (-0.66, 1.12), (0.19, 0.0), (3.1, 0.0), (3.1, 2.8)], (38, 40, 47))
    side.paste(qr_layer(0.58 * side.s), 1.2, 0.98)          # a 58 cm QR centred at y=1.2 m, z=0.98 m
    side.text(-1.0, 2.05, "FREE", ("Inter.ttf", "Bold"), 0.30, (246, 244, 255), anchor="lt")

Run directly for a self-contained demo (writes demo_atlas.png, demo_layout.json, demo_mask_side.png):

    python livery_view.py --out demo_out

Why metres: the livery is placed from measurements of the real object (axles, belt line, pillars). Every
position is a number in a profile JSON, so "move the logo down 5 cm" is a one-number edit, and the same
numbers drive the UV projection in Blender (see project_uv.py), so picture and geometry can't disagree.
Needs: pip install pillow qrcode
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

try:
    import qrcode
except ImportError:  # QR is optional
    qrcode = None


def font(path, px):
    """path or (path, variation-name) for variable fonts such as Inter ("Bold", "SemiBold", "Medium")."""
    if isinstance(path, tuple):
        f = ImageFont.truetype(path[0], max(1, int(px)))
        try:
            f.set_variation_by_name(path[1])
        except Exception:
            try:
                f.set_variation_by_name(path[1].encode())
            except Exception:
                pass
        return f
    return ImageFont.truetype(path, max(1, int(px)))


class View:
    """Maps a 2-D object coordinate pair (a, b) in metres to pixels of one panel image.

    a runs left->right on screen, b runs bottom->top. flip_a mirrors a (e.g. the passenger side, so the
    nose is on the right). Every graphic that should be RAISED on a 3D print (pasted logos/QR, text) is
    also drawn white into self.mask; base paint (rect/poly/ellipse) is not. That mask is the exact outline
    source for relief lettering, with no colour thresholding.
    """

    def __init__(self, w, h, a0, a1, b0, b1, flip_a=False, base=(242, 242, 244)):
        self.w, self.h = w, h
        self.a0, self.a1, self.b0, self.b1 = a0, a1, b0, b1
        self.flip_a = flip_a
        self.img = Image.new("RGB", (w, h), base)
        self.d = ImageDraw.Draw(self.img)
        self.s = w / (a1 - a0)  # px per metre
        self.mask = Image.new("L", (w, h), 0)
        self.dm = ImageDraw.Draw(self.mask)

    def p(self, a, b):
        t = (a - self.a0) / (self.a1 - self.a0)
        if self.flip_a:
            t = 1 - t
        return (t * self.w, (self.b1 - b) / (self.b1 - self.b0) * self.h)

    def poly(self, pts, fill):
        self.d.polygon([self.p(a, b) for a, b in pts], fill=fill)

    def rect(self, a0, b0, a1, b1, fill, radius=0):
        p0, p1 = self.p(a0, b1), self.p(a1, b0)
        x0, y0 = min(p0[0], p1[0]), min(p0[1], p1[1])
        x1, y1 = max(p0[0], p1[0]), max(p0[1], p1[1])
        if radius:
            self.d.rounded_rectangle([x0, y0, x1, y1], radius=radius * self.s, fill=fill)
        else:
            self.d.rectangle([x0, y0, x1, y1], fill=fill)

    def ellipse(self, a, b, ra, rb, fill):
        c = self.p(a, b)
        self.d.ellipse([c[0] - ra * self.s, c[1] - rb * self.s, c[0] + ra * self.s, c[1] + rb * self.s], fill=fill)

    def paste(self, layer, a, b, angle=0.0):
        """Paste an RGBA layer centred on (a, b), rotated by angle (deg, CCW on screen); records it in the mask."""
        if angle:
            layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
        c = self.p(a, b)
        pos = (int(c[0] - layer.width / 2), int(c[1] - layer.height / 2))
        self.img.paste(layer, pos, layer)
        self.mask.paste(255, pos, layer.getchannel("A"))

    def text(self, a, b, s, font_path, size_m, fill, anchor="la", angle=0.0):
        """Text anchored at (a, b); size_m is the em size in metres. Also drawn into the mask."""
        f = font(font_path, size_m * self.s)
        if angle == 0:
            self.d.text(self.p(a, b), s, font=f, fill=fill, anchor=anchor)
            self.dm.text(self.p(a, b), s, font=f, fill=255, anchor=anchor)
        else:
            tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
            bb = tmp.textbbox((0, 0), s, font=f)
            layer = Image.new("RGBA", (bb[2] - bb[0] + 8, bb[3] - bb[1] + 8), (0, 0, 0, 0))
            ImageDraw.Draw(layer).text((-bb[0] + 4, -bb[1] + 4), s, font=f, fill=fill)
            self.paste(layer, a, b, angle)


def qr_layer(size_px, data="https://example.com", color=(255, 255, 255)):
    """QR as coloured modules on TRANSPARENT (paste it onto any panel colour). Verify with verify_qr.py."""
    if qrcode is None:
        raise RuntimeError("pip install qrcode")
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=1, box_size=10)
    q.add_data(data)
    q.make(fit=True)
    im = q.make_image(fill_color=color, back_color=(0, 0, 0)).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] == (0, 0, 0):
                px[x, y] = (0, 0, 0, 0)
    return im.resize((int(size_px), int(size_px)), Image.NEAREST)   # NEAREST keeps module edges crisp


def load_logo(path, height_px):
    """An OFFICIAL logo rasterised to a transparent PNG (see rasterize_svg.mjs), scaled to a pixel height."""
    im = Image.open(path).convert("RGBA")
    h = max(2, int(height_px))
    return im.resize((int(im.width * h / im.height), h), Image.LANCZOS)


def pack_atlas(panels, size=4096, fill=(26, 26, 28), extents=None):
    """panels: {name: (image, (x, y))}. Returns (atlas, layout) where layout matches clerk-van's
    atlas_layout_*.json: {"size", "regions": {name: [x0, y0, x1, y1]}, "extents": {...metres...}}."""
    atlas = Image.new("RGB", (size, size), fill)
    regions = {}
    for name, (im, (x, y)) in panels.items():
        if x + im.width > size or y + im.height > size:
            raise ValueError(f"atlas overflow: {name} at {(x, y)} size {im.size}")
        atlas.paste(im, (x, y))
        regions[name] = [x, y, x + im.width, y + im.height]
    return atlas, {"size": size, "regions": regions, "extents": extents or {}}


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="self-contained demo: one side panel + atlas + layout + relief mask")
    ap.add_argument("--out", default="demo_out")
    ap.add_argument("--font", default=None, help="a .ttf; default: Windows Arial Bold, then DejaVu")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    fpath = args.font or next((p for p in ("C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                                           "/Library/Fonts/Arial Bold.ttf") if os.path.exists(p)), None)
    EXT_SIDE = [-3.1, 3.1, 0.0, 2.8]
    side = View(2900, 1310, *EXT_SIDE)
    side.poly([(-0.66, 2.8), (-0.66, 1.12), (0.19, 0.0), (3.1, 0.0), (3.1, 2.8)], (38, 40, 47))   # charcoal band
    Y_PURPLE_ROOF, ROOF_Z = 0.40, 2.62            # where the 45 deg diagonal meets the real roof edge

    def diag_y(z):                                 # 45 deg, leaning back: y grows 1 m per metre of drop
        return Y_PURPLE_ROOF + (ROOF_Z - z)
    side.poly([(diag_y(2.8), 2.8), (diag_y(0.0), 0.0), (3.1, 0.0), (3.1, 2.8)], (91, 48, 230))
    side.rect(-3.1, 0.0, 3.1, 0.73, (52, 55, 61))
    if fpath:
        side.text(-0.2, 2.05, "FREE", fpath, 0.30, (246, 244, 255), anchor="lt")
    if qrcode:
        side.paste(qr_layer(0.58 * side.s, "https://example.com"), 0.2, 1.25)
    atlas, layout = pack_atlas({"side_left": (side.img, (0, 0))}, extents={"side": EXT_SIDE})
    atlas.save(os.path.join(args.out, "demo_atlas.png"))
    side.img.save(os.path.join(args.out, "demo_panel_side.png"))
    side.mask.save(os.path.join(args.out, "demo_mask_side.png"))
    with open(os.path.join(args.out, "demo_layout.json"), "w") as f:
        json.dump(layout, f, indent=2)
    print("wrote", args.out, "px/m =", round(side.s, 1))
