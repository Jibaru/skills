"""
check_background.py — prove a studio render's background is the exact colour it should be.

    python check_background.py renders/shot_hero.png --bg 7CFF00
    python check_background.py renders/turntable/frame_0001.png renders/preview_side.png --bg 7CFF00 --points 4,4 -5,4

Samples the four corners (or --points x,y; negative = from the right/bottom edge) and, with --floor, the
bottom-centre strip, and fails unless every sample equals --bg exactly. A shifted colour means the view
transform isn't "Standard", dither is on, or the floor calibration didn't run.
Needs: pip install pillow
"""
import argparse
import sys

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--bg", default="7CFF00")
    ap.add_argument("--points", nargs="*", default=None, help="x,y pairs; negative counts from the far edge")
    ap.add_argument("--floor", action="store_true", help="also require the bottom-centre strip (open floor) to match")
    args = ap.parse_args()
    want = tuple(int(args.bg[i:i + 2], 16) for i in (0, 2, 4))

    failed = 0
    for path in args.images:
        im = Image.open(path).convert("RGB")
        w, h = im.size
        pts = [(4, 4), (w - 5, 4), (4, h - 5), (w - 5, h - 5)]
        if args.points:
            pts = []
            for p in args.points:
                x, y = (int(v) for v in p.split(","))
                pts.append((x if x >= 0 else w + x, y if y >= 0 else h + y))
        if args.floor:
            pts += [(w // 2 + dx, h - 3) for dx in (-w // 8, 0, w // 8)]
        bad = [(p, im.getpixel(p)) for p in pts if im.getpixel(p) != want]
        if bad:
            failed += 1
            print(f"FAIL  {path}: " + ", ".join(f"{p}={'#%02X%02X%02X' % c}" for p, c in bad) + f" (want #{args.bg.upper()})")
        else:
            print(f"ok    {path}: {len(pts)} samples = #{args.bg.upper()}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
