# Sketchfab: API facts, script usage, ffmpeg-on-Windows pitfalls

Sketchfab has the widest selection of free downloadable 3D models, including rigged characters with
dozens of clips. In THE ONES it supplied 44 of 213 credited assets. The API facts below were checked
live during that session. Re-check anything that matters, because the API isn't versioned in practice.

## Script usage (`scripts/sketchfab.mjs`)

```bash
# 1. Wide search: several queries, one request per (query, licence), animated characters only
node <skill>/scripts/sketchfab.mjs search "labrador" "german shepherd" "shiba inu" --animated --out cands.json
#    options: --max-faces 80000  --min-anims 2  --pages 2  --loose (keep off-topic hits)

# 2. Numbered contact sheet for the user: review/sheet.jpg + review/sheet.txt
node <skill>/scripts/sketchfab.mjs sheet cands.json --top 12 --out review/

# 3. One model in detail: licence slug + URL, faces, clips, description and IP flags
node <skill>/scripts/sketchfab.mjs info 42c8f95d9a83481f93e84d706ca03729

# 4. Download finalists by key (delegates to assets.mjs: credits record, licence check, CREDITS.md)
node <skill>/scripts/sketchfab.mjs get dog_lab=42c8f95d9a83481f93e84d706ca03729 --dest assets/models
#    same thing directly: node <skill>/scripts/assets.mjs get sketchfab:<uid>=dog_lab --out assets/models/dog_lab
```

Example output (`search "labrador" --animated --pages 1`, anonymous):

```
42c8f95d…  | by | ♥41  | 38144f | anim=107 | 48.1MB |                      | Dream Dixie Works | Labrador dog no description (serioulsy)
7bda5ad1…  | by | ♥15  | 6874f  | anim=5   | 0.7MB  | IP?                  | santiagotvofficial | Zuma Blend File (PAW Patrol)
1f56cfba…  | by | ♥437 | 52772f | anim=1   | 19.3MB |                      | kenchoo | Labrador Dog
f7ade7f6…  | by | ♥17  | 52772f | anim=1   | 19.6MB | REUPLOAD-OF:1f56cfba | ap-school | labrador_dog
```

Flags are hints to read the page, not verdicts:

- `IP?`: the name looks like someone else's IP or a ripped game asset.
- `CHECK-DESCRIPTION`: the description says non-commercial, ripped, from the game, asset store, AI-generated…
- `REUPLOAD-OF:<uid>`: same face and clip count as a more-liked model by another author.

**Token.** `SKETCHFAB_API_TOKEN` comes from https://sketchfab.com/settings/password ("API token"),
read from the environment or `./.env`. `search`, `sheet` and `info` work anonymously but hit HTTP 429
sooner. `get` needs the token. Keep it in `.env` (gitignored), never inline it in commands.

## API facts

- **Search:** `GET https://api.sketchfab.com/v3/search?type=models&q=…&downloadable=true&sort_by=-likeCount&count=24`.
  That's 24 per page; follow `next` for more.
- **`license=<slug>`:** only **one** value is honoured per request. `license=by&license=cc0` applied
  only `cc0`. So the script makes one request per licence (`cc0`, `by`, `by-sa`).
- **Licence labels:** search results carry `license {uid, label}` only, with no slug. Map the label:
  "CC Attribution" → by, "CC Attribution-ShareAlike" → by-sa, "CC0 Public Domain" → cc0, "Free
  Standard" → free-st, plus the NC/ND variants.
- **Licence slug and URL:** the detail call `GET /v3/models/{uid}` has `license.slug` and
  `license.url` (`http://creativecommons.org/licenses/by/4.0/`). The credit row uses the URL, so it
  records a versioned licence ("CC BY 4.0") and a link. 43 rows in THE ONES were written as a bare
  "CC Attribution" and now need fixing by hand. `audit` lists them.
- **Filters:** `animated=true` works (every result has at least one clip), and `max_face_count=N` is
  honoured. `categories=` and `rigged=true` did **not** visibly narrow results, so filter client-side.
- **Useful search fields:** `animationCount`, `faceCount`, `likeCount`, `tags[].name`,
  `categories[].name`, `archives.glb.size`, `archives.glb.textureMaxResolution`, and
  `thumbnails.images[]` (1920/1024/720/256/64). `archives` comes back in **search**, not in the
  detail call.
- **Viewer URLs:** search `viewerUrl` has a `none-<uid>` slug, so build
  `https://sketchfab.com/3d-models/<uid>` instead.
- **Download:** `GET /v3/models/{uid}/download` with `Authorization: Token <token>` returns
  `{glb:{url,size}, gltf:{url}, usdz, source}`. The signed URLs expire within minutes, so fetch
  immediately.
- **Rate limits:** tokenless calls got 429. Send the token on every call and back off. Both scripts
  retry with a 2/4/6/8 s backoff.
- **Off-topic results:** sorting by `-likeCount` pulls in popular unrelated models ("dog" → a Pacman
  arcade cabinet, a goldfish, "Document File Folder"), so the script requires a query word in the
  name or tags unless you pass `--loose`.

## Licence is more than the label

- "Gaunt Horror Creature" is labelled CC BY, but its description says non-commercial. Rejected.
- "SCP-096" and "Nightmare Creature" were ripped game assets.
- "Corrupted Monk" (1.9M triangles) looked AI-generated.
- "Playful Dog" (mpmramos) is quander's Shiba Inu: same 33,384 faces and 5 clips, uploaded by another
  account. Licence only the original.

Read the description of every finalist (`info` prints the first red-flag match).

## ffmpeg on Windows: pitfalls that all happened

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Fontconfig error: Cannot load default config file` (×22), no labels drawn | Windows ffmpeg builds have no fontconfig | always pass `drawtext=fontfile=…` |
| `No option name near '/Windows/Fonts/arial.ttf…'` | the `:` in `C:` splits filter options; escaping `C\\:` through bash→sed→JS failed 3× | copy the TTF next to the images, run ffmpeg with that cwd, use `fontfile=font.ttf` |
| `Padded dimensions cannot be smaller than input dimensions` | `scale=…:force_original_aspect_ratio=decrease,pad=…` can overshoot by a pixel | `scale=W:H:force_original_aspect_ratio=increase,crop=W:H` |
| `tile` / `xstack` fails on a mixed set | thumbnails mix PNG and JPEG pixel formats | add `format=yuvj420p` per tile |
| tile 12 missing from a 12-tile sheet | `while read uid url … < list.txt` skips a last line with no trailing newline (Node's `join("\n")`) | write a trailing newline, or `while read -r a b \|\| [ -n "$a" ]` |
| `Expected number for ar but found: 48000,` | `ffprobe -of csv=p=0` on Windows prints a trailing `,` and `\r` | pipe through `tr -d ',\r'` |
| `JSON.parse` fails on `loudnorm` output | the stats JSON is mixed into stderr | `stderr.match(/{[^{}]*"input_i"[^{}]*}/)[0]` |

## Escaping pitfall when generating the script itself

Writing JavaScript or regex through `node -e "…"` with escaped quotes silently turned `\b` into a
backspace byte and `\d` into `d`. The IP regex then matched "rip" inside "tripod". Write code files
with the Write tool (or use `String.raw`), then check them with
`node <shell-safe-patching>/scripts/find-control-bytes.mjs scripts/`.
