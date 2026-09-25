---
name: game-assets
description: Find, download and credit free game assets — 3D models, PBR textures, HDRIs, 2D sprites and tilesets, UI icons, sound effects — from Poly Haven, ambientCG, Kenney, game-icons.net, Poly Pizza and Freesound, synthesize retro SFX offline, and fall back to AI generation (Meshy, PixelLab, Retro Diffusion, ElevenLabs) only when nothing free fits. Keeps CREDITS.md and license records in sync. Use when the user asks for "assets for my game", "a 3D model of", "a texture for", "sprites", "a tileset", "sound effects", "free CC0 assets", "where can I download", "credits for assets", or when a game project needs art or audio it does not have yet.
metadata:
  author: Jibaru
  version: 1.0.0
---

# game-assets

Get art and audio into a game project without guessing at licenses. Every file
this skill downloads lands under `assets/` and gets a row in `CREDITS.md` in
the same step, so provenance is never reconstructed afterwards.

## The order of preference

1. **Free and already made**: search the sources below. Prefer CC0.
2. **Synthesized**: `scripts/sfx.mjs` for retro sound effects, and code-drawn
   placeholders for art (see "Placeholders").
3. **AI-generated**: only if an MCP server for it is connected, and only for
   assets the free sources cannot cover (a specific named character, a
   consistent sprite set in one style). See `references/generation.md`.

Never jump to step 3 because it is convenient. Generated assets cost the user
money, and a Kenney pack is usually more consistent than a batch of generations.

## Project layout

The skill writes into the shared layout used by the other `game-*` skills:

```
assets/
  models/     glTF/GLB, one folder per asset
  textures/   PBR sets and HDRIs, one folder per asset
  sprites/    2D packs, tilesets, icons/
  audio/      SFX and music
  fonts/
  credits.json   machine record, source of truth
CREDITS.md       generated from credits.json
```

If the project already has a different asset folder (for example `public/assets`
in a Vite game), pass `--project` so `assets/` resolves where the game loads it
from. Don't move existing files to fit the layout.

## Searching

```bash
node scripts/assets.mjs search "stone wall" --type texture
node scripts/assets.mjs search "knight" --type model --limit 5
node scripts/assets.mjs search "dungeon" --source kenney
node scripts/assets.mjs search "heart" --source gameicons
node scripts/assets.mjs sources          # which sources are usable right now
```

| Source | Types | License | Key |
| --- | --- | --- | --- |
| `polyhaven` | model, texture, hdri | CC0 | none |
| `ambientcg` | texture, hdri, model | CC0 | none |
| `kenney` | sprite, model, audio, texture: whole packs | CC0 | none |
| `gameicons` | icon (4,000+ SVGs) | **CC BY 3.0**, attribution required | none |
| `polypizza` | low-poly model (Quaternius and many others) | CC0 by default, CC BY with `--allow-by` | `POLYPIZZA_API_KEY` |
| `freesound` | audio | CC0 by default, CC BY with `--allow-by` | `FREESOUND_API_KEY` |

Sources without a key are skipped and listed as skipped. Don't ask the user
for a key unless the free sources genuinely came up empty.

**Match the style before the subject.** A low-poly Kenney tree and a
photoscanned Poly Haven rock do not belong in one scene. Read the art direction
section of `GDD.md` if it exists. Then pick one primary source per asset class
and stay with it:

- Stylized or low-poly 3D: Kenney 3D packs and Poly Pizza (Quaternius)
- Realistic 3D: Poly Haven models, textures and HDRIs, plus ambientCG textures
- Pixel art or 2D: Kenney 2D packs (`tiny-dungeon`, `pixel-platformer`, `tiny-town`…)
- UI icons: game-icons.net, recoloured in code

## Downloading

```bash
node scripts/assets.mjs get polyhaven:brick_4 --res 1k
node scripts/assets.mjs get kenney:tiny-dungeon kenney:pixel-platformer
node scripts/assets.mjs get gameicons:delapouite/ancient-sword
node scripts/assets.mjs get ambientcg:Bricks097 --project ./my-game
```

- `--res 1k` is the default and right for almost every web game. Use 2k only
  for hero assets the camera gets close to. Never use 4k in a browser game.
- Poly Haven models come as `.gltf` + `.bin` + `textures/`. Load the `.gltf`,
  keep the folder together.
- Kenney packs arrive whole. Look inside (`Preview.png`, `Tilesheet.txt`, the
  `Tiles/` or `Models/GLB format/` folders) and load only what the game uses.
- Every `get` rewrites `CREDITS.md`. If it reports assets that need
  attribution, the game must ship `CREDITS.md` or show those credits in-game.
  Say so to the user.

Rebuild `CREDITS.md` after hand-editing `assets/credits.json`:

```bash
node scripts/assets.mjs credits
```

## Sound effects without any source

```bash
node scripts/sfx.mjs jump coin laser hit explosion --out assets/audio
node scripts/sfx.mjs all --variants 3 --out assets/audio   # jump_1.wav … for variety
```

Presets: `coin jump laser explosion hit powerup blip select hurt pickup step death`.
The output is original and deterministic. It needs no credits, and a rerun
produces the same bytes. Use variants and pick one at random at play time so
repeated sounds don't grate. These are chiptune-style. For realistic audio, use
Freesound, Kenney's audio packs (`kenney:impact-sounds`, `kenney:interface-sounds`,
`kenney:rpg-audio`…), or ElevenLabs.

## Placeholders

When an asset is missing and the user hasn't decided how to fill it, don't
block the build. Draw the placeholder in code, with a clear silhouette and
a flat colour per role (player, enemy, pickup, wall):

- Phaser: `this.add.graphics()` → `generateTexture('player', w, h)`, or `this.add.rectangle`
- Three.js: `BoxGeometry` / `CapsuleGeometry` + `MeshStandardMaterial({ color })`
- Godot: `ColorRect`, `Polygon2D`, `CSGBox3D`, or a `PlaceholderTexture2D`

Keep the asset key the real asset will use, so swapping in the real asset is a
one-line change in the loader. List open placeholders in `GDD.md` under
the asset list.

## Sources with no API

OpenGameArt, itch.io free packs, Sketchfab, Mixamo, Quaternius's own site and
Google Fonts have no API this skill downloads from, or can't be used for
downloading. Point the user to them with `references/sources.md` when the
automated sources don't have what they need, and add the result to
`assets/credits.json` by hand (same fields as the existing rows), then run
`credits`.

## Troubleshooting

- **`got an HTML page instead of a file`**: Poly Pizza's CDN blocks datacenter
  and VPN IPs with a Cloudflare challenge. Retry from a home connection, or have
  the user download the `.glb` from the model page.
- **`could not extract`**: no `tar`, `unzip` or `python` on PATH. Windows 10+
  and macOS ship `tar`. On Linux, install `unzip`.
- **Kenney `no zip link found`**: the pack page moved or the slug is wrong.
  Search again. `assets/kenney-catalog.json` was scraped on 2026-09-25 and
  newer packs will be missing from it. You can still `get` any slug from kenney.nl.
- **GitHub rate limit on `gameicons`**: the icon index is cached for a week
  in the OS temp folder. The first search after that makes one API call.
