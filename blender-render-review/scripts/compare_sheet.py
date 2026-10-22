"""
compare_sheet.py — reference cell on the left, your render from the same angle on the right, one row per view.

    python compare_sheet.py --ref references/views.png --grid 4x3 --renders renders/compare \
        --cells r1c2_front=0,1 r2c2_rear=1,1 r1c4_sideL=0,3 --out renders/compare_sheet.png

Generalised from clerk-van/tools/compare_sheet.py. --ref is ONE image laid out as a grid of reference views
(e.g. a product sheet or a collage of photos the user gave you); --cells maps a render name (renders/<name>.png)
to its (row, col) in that grid. A missing render shows as a dark grey cell, so you see what's left to do.
Also writes <out>_a.png / <out>_b.png halves when there are more than 4 rows (a tall sheet is hard to read).
Needs: pip install pillow
"""
import argparse
import os

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--grid", default="4x3", help="COLSxROWS of the reference image")
    ap.add_argument("--renders", required=True, help="folder with <name>.png renders")
    ap.add_argument("--cells", nargs="+", required=True, help="name=row,col")
    ap.add_argument("--out", required=True)
    ap.add_argument("--tile", default="600x400")
    args = ap.parse_args()

    ref = Image.open(args.ref).convert("RGB")
    cols, rows_n = (int(v) for v in args.grid.lower().split("x"))
    cw, ch = ref.width / cols, ref.height / rows_n
    TW, TH = (int(v) for v in args.tile.lower().split("x"))

    rows = []
    for spec in args.cells:
        name, rc = spec.split("=")
        r, c = (int(v) for v in rc.split(","))
        cell = ref.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch))).resize((TW, TH), Image.LANCZOS)
        rp = os.path.join(args.renders, name + ".png")
        rend = Image.open(rp).convert("RGB").resize((TW, TH), Image.LANCZOS) if os.path.exists(rp) else Image.new("RGB", (TW, TH), (40, 40, 40))
        row = Image.new("RGB", (TW * 2 + 10, TH), (0, 0, 0))
        row.paste(cell, (0, 0))
        row.paste(rend, (TW + 10, 0))
        d = ImageDraw.Draw(row)
        d.rectangle((0, 0, 8 + 7 * len(name), 22), fill=(0, 0, 0))
        d.text((6, 5), name, fill=(255, 255, 255))
        rows.append(row)

    sheet = Image.new("RGB", (TW * 2 + 10, (TH + 10) * len(rows)), (0, 0, 0))
    for i, r in enumerate(rows):
        sheet.paste(r, (0, i * (TH + 10)))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sheet.save(args.out)
    if len(rows) > 4:
        base, ext = os.path.splitext(args.out)
        sheet.crop((0, 0, sheet.width, (TH + 10) * 4)).save(base + "_a" + ext)
        sheet.crop((0, (TH + 10) * 4, sheet.width, sheet.height)).save(base + "_b" + ext)
    print("wrote", args.out, f"({len(rows)} rows)")


if __name__ == "__main__":
    main()
