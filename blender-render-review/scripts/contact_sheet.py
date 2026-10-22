"""
contact_sheet.py — many images in one labelled grid, so one Read shows them all.

    python contact_sheet.py renders/turntable/frame_00*.png --cols 6 --tile 320x180 --out renders/sheet.png
    python contact_sheet.py before.png after.png --cols 2 --labels before after --out renders/ba.png

Labels default to the file names. Use it for before/after pairs of a fix, every close-up of a review round,
or every Nth turntable frame. Pure Pillow, so no ffmpeg font/fontconfig trouble on Windows.
Needs: pip install pillow
"""
import argparse
import glob
import os

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--tile", default="400x225")
    ap.add_argument("--labels", nargs="*", default=None)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    paths = []
    for p in args.images:                     # expand globs ourselves: Windows shells don't
        paths += sorted(glob.glob(p)) or [p]
    TW, TH = (int(v) for v in args.tile.lower().split("x"))
    labels = args.labels or [os.path.basename(p) for p in paths]
    rows = (len(paths) + args.cols - 1) // args.cols
    sheet = Image.new("RGB", (args.cols * (TW + 6) + 6, rows * (TH + 6) + 6), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        x, y = 6 + (i % args.cols) * (TW + 6), 6 + (i // args.cols) * (TH + 6)
        if os.path.exists(p):
            im = Image.open(p).convert("RGB")
            im.thumbnail((TW, TH), Image.LANCZOS)
            sheet.paste(im, (x + (TW - im.width) // 2, y + (TH - im.height) // 2))
        else:
            d.rectangle((x, y, x + TW, y + TH), fill=(60, 0, 0))
        lab = labels[i] if i < len(labels) else ""
        d.rectangle((x, y, x + 8 + 7 * len(lab), y + 18), fill=(0, 0, 0))
        d.text((x + 4, y + 3), lab, fill=(255, 255, 255))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sheet.save(args.out)
    print("wrote", args.out, f"({len(paths)} images, {rows}x{args.cols})")


if __name__ == "__main__":
    main()
