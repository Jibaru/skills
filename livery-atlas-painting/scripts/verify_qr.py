"""
verify_qr.py — prove every QR code in a livery decodes, before it goes on a model.

    python verify_qr.py textures/panel_side_left_transit.png textures/panel_rear_transit.png --expect https://clerk.com

Livery QR codes are usually WHITE modules on a dark or coloured panel. OpenCV's detector expects dark
modules on a light ground, so each image is tried inverted first, then as-is, at 1x and 0.5x (a smaller
copy also tells you whether it survives being viewed from further away / printed smaller).

Exit code 0 only if every image decodes to --expect (or to anything, when --expect is omitted).
Needs: pip install opencv-python-headless numpy
"""
import argparse
import sys

import cv2


def decode(img):
    det = cv2.QRCodeDetector()
    for label, variant in (("inverted", 255 - img), ("as-is", img)):
        for scale in (1.0, 0.5):
            im = variant if scale == 1.0 else cv2.resize(variant, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            data, points, _ = det.detectAndDecode(im)
            if data:
                return data, f"{label} @ {scale:g}x"
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--expect", default=None, help="the URL/text every QR must decode to")
    args = ap.parse_args()

    failed = 0
    for path in args.images:
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            print(f"FAIL  {path}: cannot read image")
            failed += 1
            continue
        data, how = decode(img)
        if data is None:
            print(f"FAIL  {path}: no QR decoded (tried inverted/as-is at 1x and 0.5x)")
            failed += 1
        elif args.expect is not None and data != args.expect:
            print(f"FAIL  {path}: decoded {data!r}, expected {args.expect!r}")
            failed += 1
        else:
            print(f"ok    {path}: {data!r} ({how})")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
