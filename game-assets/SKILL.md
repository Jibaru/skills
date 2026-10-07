---
name: game-assets
description: Find, download and credit free game assets — 3D models (Sketchfab, Poly Haven, Kenney, Poly Pizza), PBR textures, HDRIs, sprites, UI icons, sound effects — with a licence policy that keeps a public repo clean, a numbered contact sheet for the user to pick models, an audit of unused or uncredited assets, Godot import fixes, offline retro SFX, and AI generation only when nothing free fits. Keeps CREDITS.md honest. Use when the user asks for "assets for my game", "a 3D model of", "a texture for", "sprites", "sound effects", "free CC0 assets", "find a better model", "credits for assets", "is this license ok", or when a game project needs art or audio it does not have yet.
metadata:
  author: Jibaru
  version: 1.1.0
---

# game-assets

Get art and audio into a game project without guessing at licences. Every file this skill downloads
lands under the asset folder and gets a row in the project's **one** credits record
(`assets/credits.json`, rendered to `CREDITS.md`) in the same step, so provenance never has to be
reconstructed afterwards.

## Licence policy: decide it before searching

**If the repo or the game files are public, accept only CC0, CC BY, CC BY-SA, and OFL for fonts.**
Sketchfab *Free Standard* and *Standard*, Fab Standard, store EULAs, Mixamo and Pixabay allow use
inside a game but forbid redistributing raw files, and a public repo is redistribution. NC and ND
are always rejected. The scripts enforce this:

- `sketchfab` only accepts cc0, by and by-sa.
- Freesound `--allow-by` widens to Attribution only.
- `audit` flags everything else.

Details and the reasons are in `references/sources.md`.

**Search free first, buy last.** Show the free candidates with the work they still need (rig,
recolour, decimate) next to any paid option. A thorough free search took one project's buy list from
about 115 USD to 0.

## The order of preference

1. **Free and already made**: search the sources below.
2. **Synthesized**: `scripts/sfx.mjs` for retro sound effects, and code-drawn placeholders for art.
3. **AI-generated**: only through a connected MCP server, and only for what free sources can't
   cover. See `references/generation.md`.

## Project layout

```
assets/
  models/ textures/ sprites/ audio/ fonts/
  source/        raw candidates (--raw), with a .gdignore so Godot doesn't import them
  credits.json   the one credits record (source of truth)
CREDITS.md       generated from credits.json
```

In a Vite game pass `--assets public/assets`. **`--assets` names the asset root, never a staging
folder.** To put one download somewhere specific, use `--out`. An existing `credits.json` always
wins, so a stray `--assets` can't start a second, near-empty record. Using `--assets` as a staging
folder used to wipe `CREDITS.md`, and it happened at least four times in one project.

## Searching

```bash
node scripts/assets.mjs search "stone wall" --type texture
node scripts/assets.mjs search "knight" --type model --limit 5
node scripts/assets.mjs search "dungeon" --source kenney
node scripts/assets.mjs sources                       # which sources are usable right now
```

| Source | Types | License | Key |
| --- | --- | --- | --- |
| `polyhaven` | model, texture, hdri | CC0 | none |
| `ambientcg` | texture, hdri, model | CC0 | none |
| `kenney` | sprite, model, audio, texture: whole packs | CC0 | none |
| `gameicons` | icon (4,000+ SVGs) | **CC BY 3.0** | none |
| `polypizza` | low-poly model | CC0 (CC BY with `--allow-by`) | `POLYPIZZA_API_KEY` |
| `freesound` | audio | CC0 (CC BY with `--allow-by`) | `FREESOUND_API_KEY`, the "Client secret/API key" |
| `sketchfab` | model, incl. rigged and animated characters | CC0, CC BY, CC BY-SA only | `SKETCHFAB_API_TOKEN` |

For characters and creatures, use the Sketchfab script's wide search instead (see the next section).
Keep keys in a gitignored `.env`, never inline in commands, and rotate any key pasted into a chat.

**Match the style before the subject.** Pick one primary source per asset class and stay with it:
stylized or low-poly from Kenney and Poly Pizza, realistic from Poly Haven, ambientCG and Sketchfab
scans. Read the art direction section of `GDD.md` first.

## Choosing a model (characters, creatures, hero props)

The user picks, and you make the pick cheap and well-informed:

```bash
node scripts/sketchfab.mjs search "labrador" "german shepherd" "shiba inu" --animated --out cands.json
node scripts/sketchfab.mjs sheet cands.json --top 12 --out review/     # numbered sheet → Read it, show it
node scripts/sketchfab.mjs info <uid>                                   # licence URL, description red flags
node scripts/sketchfab.mjs get dog_lab=<uid> --dest assets/models       # finalists only
```

The procedure:

1. Search wide (15–30 queries).
2. Rank by usefulness: clip count, faces, size. Not by likes.
3. Show the numbered sheet, so the user answers "3, 7".
4. Download only the 2 finalists.
5. Look at them in-engine under the game's lighting.
6. Remove the losers.

Prefer a realistic model with many game animations plus a recolour shader over a worse model in the
right colour. The full procedure, a worked example and a subagent brief are in
`references/model-selection.md`. API facts and ffmpeg-on-Windows pitfalls are in
`references/sketchfab.md`.

## Downloading

```bash
node scripts/assets.mjs get polyhaven:brick_4 --res 1k
node scripts/assets.mjs get kenney:tiny-dungeon gameicons:lorc/broadsword=sword_icon
node scripts/assets.mjs get freesound:865359=knock_wood_1 --out assets/audio/night   # rename on arrival
node scripts/assets.mjs get freesound:865359 --raw         # raw candidate → assets/source/audio/ (.gdignore)
```

- `source:id=name` (or `--name` for one download) renames the file or folder on arrival. A raw name
  like `26_07_26_Knocking_on_Wooden_Door_1-865359.mp3` never enters the project, and no
  staging-and-merge script is needed.
- `--res 1k` is the default and right for almost every game. Use 2k only for hero assets. Never use
  4k in a browser game.
- Every `get` updates the main record and rebuilds `CREDITS.md`. A rebuild refuses to drop more than
  one row unless `ASSETS_ALLOW_SHRINK=1` is set.

## Keeping the record honest

```bash
node scripts/assets.mjs edit sketchfab:<uid> --changes "recolored cream to black via shader"
node scripts/assets.mjs audit --src scripts,scenes          # exit 1 on missing files or bad licences
node scripts/assets.mjs remove sketchfab:<uid>              # files + .import/.uid + row + CREDITS.md
node scripts/assets.mjs credits                             # rebuild CREDITS.md after editing the JSON
```

- **Attribution is counted explicitly.** CC BY, CC BY-SA and OFL require it. CC0, own work and
  generated audio don't. A row can override with `attribution_required`. One project's header said
  78 required where 63 was right.
- **CC BY requires stating changes.** Record recolours, decimation and edited meshes with
  `edit --changes`, and they appear in the Changes column.
- **Licences are recorded with their version and URL** (`CC BY 4.0`, `license_url`). Rows with a
  bare "CC Attribution" show up in `audit`.
- **`audit` reports four things:**
  - rows whose files are gone
  - files in the asset folder with no row, grouped by folder (derived cuts belong on the row of the
    raw they came from)
  - credited assets that no code references by name (paths built at runtime appear here too, so
    confirm before removing)
  - licences outside the policy

  On THE ONES it caught a shipped Free Standard model and an unused 12 MB model that a manual
  cleanup had missed.

## Godot: one step after every asset batch

Headless `--import` leaves code-loaded and GLB-extracted textures **lossless with no mipmaps**.
After importing, run:

```bash
node scripts/fix_texture_imports.mjs && godot --headless --path . --import
```

Then:

- Inspect new GLBs headlessly with `scripts/glb_inspect.gd`.
- Dump their textures with `scripts/glb_textures.mjs` before writing a recolour shader.
- Exclude unused and restricted models from the export.

Clip quirks, root motion, recolouring and retargeting are covered in `references/godot-import.md`.

## Sound effects without any source

```bash
node scripts/sfx.mjs jump coin laser hit explosion --out assets/audio
node scripts/sfx.mjs all --variants 3 --out assets/audio   # jump_1.wav … for variety
```

Presets: `coin jump laser explosion hit powerup blip select hurt pickup step death`. The output is
original and deterministic, so it needs no credits. Pick a variant at random at play time.

## Placeholders

When an asset is missing, don't block the build. Draw a placeholder in code, with the key the real
asset will use:

- Phaser: `this.add.graphics()` → `generateTexture('player', w, h)`
- Three.js: `BoxGeometry` / `CapsuleGeometry` + `MeshStandardMaterial({ color })`
- Godot: `ColorRect`, `Polygon2D`, `CSGBox3D`, `PlaceholderTexture2D`

List open placeholders in `GDD.md` under the asset list.

## Sources with no API

OpenGameArt, CGTrader, Mixamo and the Fab and Unity stores have no download API this skill uses.
Google Fonts and free itch.io packs (Quaternius) can be scripted; see `references/sources.md`. Point
the user to the manual sources, add the result to `credits.json` by hand with the same fields, then
run `credits`.

## Troubleshooting

- **`refusing to shrink … rows`**: something tried to rebuild the record from fewer rows. Check that
  you're pointing at the right project. Only set `ASSETS_ALLOW_SHRINK=1` if the drop is intended.
- **`got an HTML page instead of a file`**: a CDN bot challenge (Poly Pizza blocks datacenter IPs).
  Retry from a home connection or download by hand.
- **`could not extract`**: no tar, unzip, python or PowerShell. A bare `python` on Windows can be
  the Microsoft Store stub, which hangs, so the script times out after 120 s and moves on.
- **Sketchfab 429**: set `SKETCHFAB_API_TOKEN`. Anonymous calls are rate-limited quickly.
- **Kenney `no zip link found`**: the slug moved. `assets/kenney-catalog.json` was scraped on
  2026-09-25.
