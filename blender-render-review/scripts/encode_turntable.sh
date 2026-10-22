#!/bin/bash
# encode_turntable.sh — turntable frames -> MP4 (H.264, web-ready) + GIF preview, with a done sentinel.
#
#   bash encode_turntable.sh renders/turntable renders/model_turntable 30
#     -> renders/model_turntable.mp4, renders/model_turntable.gif, renders/ENCODE_DONE
#
# Same encode as clerk-van/tools/encode_turntable.ps1 (crf 18, yuv420p, faststart; GIF via palettegen/
# paletteuse). The sentinel exists because a half-written mp4 once got committed: the agent saw the file,
# not the end of the encode. Commit or upload ONLY after ENCODE_DONE appears, and it is written only when
# both encodes exit 0. Run this with run_in_background and wait for the notification, not a sleep loop.
set -euo pipefail

FRAMES_DIR="${1:?frames dir}"
OUT_BASE="${2:?output path without extension}"
FPS="${3:-30}"
SENTINEL="$(dirname "$OUT_BASE")/ENCODE_DONE"

rm -f "$SENTINEL"
ffmpeg -hide_banner -loglevel error -y -framerate "$FPS" -i "$FRAMES_DIR/frame_%04d.png" \
  -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart "$OUT_BASE.mp4"
ffmpeg -hide_banner -loglevel error -y -framerate "$FPS" -i "$FRAMES_DIR/frame_%04d.png" \
  -vf "fps=20,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
  "$OUT_BASE.gif"
printf 'ENCODE_DONE %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$OUT_BASE")" > "$SENTINEL"
echo "encoded $OUT_BASE.mp4 and $OUT_BASE.gif"
