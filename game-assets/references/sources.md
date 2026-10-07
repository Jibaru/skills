# Asset sources: licence policy, licences, and source notes

## Licence policy (decide this first)

**If the repo or the game files are public, accept only CC0, CC BY, CC BY-SA, and OFL for fonts.**

Sketchfab *Free Standard* and *Standard*, Fab Standard, the Unity Asset Store EULA, CGTrader
royalty-free, Mixamo, Sonniss, Kōka-on Lab (効果音ラボ) and Pixabay all allow use **inside** a game,
but they forbid redistributing the raw files. A public git repo, or an export that ships unpacked
files, is redistribution. **NC** (non-commercial) and **ND** (no derivatives) are always rejected for
a game that might ever be sold.

If the user accepts a restricted asset anyway: gitignore it, exclude it from the export if it's unused,
and record why in `credits.json` (`notes`). `assets.mjs audit` flags every restricted row.

Why this rule leads the list: in the THE ONES session a research agent described Sketchfab Free
Standard as "allows commercial use, no credit needed" and recommended it. The repo later went public,
Free Standard was banned in every subagent prompt from then on, and the one Free Standard model
already downloaded (`alien_bossdeff`) still shipped in the public build. `audit` now catches that case.

## Licences at a glance

| License | Use in a commercial game | Attribution | Notes |
| --- | --- | --- | --- |
| CC0 / public domain | yes | not required | Credit it anyway: `CREDITS.md` is the provenance record. |
| CC BY 3.0 / 4.0 | yes | **required** | Name, source, licence **with version and link**, and **what you changed** (4.0 requires stating modifications: "recolored cream→black", "decimated to 7.2k tris"). Use `assets.mjs edit <ref> --changes "…"`. |
| CC BY-SA | yes | required | Derivatives of the asset must use the same licence. Avoid it for art you'll modify heavily. |
| SIL OFL 1.1 | yes | ship the OFL notice | Fonts only. Put the licence text next to the font file. |
| CC BY-NC / -ND | **no** | — | Rejected. |
| Sketchfab Free Standard / Standard, Fab Standard, store EULAs, Mixamo | in-game only | varies | **Not in a public repo.** See the policy above. |
| GPL / OGA-BY | varies | required | Read the licence. OpenGameArt uses these a lot. |
| "Free for personal use" | **no** | — | Unusable unless the user confirms the game is personal. |
| Generated (ElevenLabs, Meshy…) | per plan | per plan | Paid plans usually allow commercial use. Free tiers often need credit and forbid commercial use. Record the plan in the row. |

If an asset's licence is unclear, don't use it.

## Buy only after a good free search

The user's words were "si necesitas más assets que comprar, dame las URLs, pero busca bien primero"
("if you need to buy more assets, give me the URLs, but search properly first"). After a light search,
an agent wrote an `ASSETS_TO_BUY.md` totalling about 115 USD as priority 1. The user pushed back
("busca cosas open source, levanta un agente": look for open-source alternatives, start an agent).
A proper free search brought the cost down to **0 USD**, paid for with some Blender work. Later, a dog
that would have cost about 30 USD on Fab (a Shiba with 100+ animations) was replaced by a free CC BY
Labrador with 107 clips.

So:

1. Run the wide free search first (`references/model-selection.md`).
2. For each piece, show the free candidates **with the work they still need** (rig, retopology,
   recolour, decimation) next to the paid options, with price and licence caveats.
3. Write a buy list only for what's left. Prices from search results must be confirmed on the
   listing page.

## Source notes

**Freesound.** The API key is the **"Client secret/API key"** from the app page, passed as
`&token=`. The client ID is only for OAuth2, so if the user pastes both, only the secret is needed.
Downloads are the HQ MP3 previews (originals need OAuth2). Names are misleading, so fetch
`fields=id,name,username,license,tags,description,duration` per candidate and read the description:
the dog-sounds search took three rounds of reading descriptions to find medium-breed barks. Workflow
for cutting:

- Get raws with `assets.mjs get freesound:<id> --raw`. That puts them in `assets/source/audio/` and
  adds a `.gdignore`, so Godot doesn't import every candidate.
- Find segments with `silencedetect` plus an RMS envelope (`astats` + `ametadata`).
- Cut with `silenceremove` + `afade`, then export mono Vorbis q5 peaking near -1 dBFS into
  `assets/audio/...`.
- Add the cut files to the raw's credit row (edit `paths` in `credits.json`, then `assets.mjs
  credits`), and delete unused raws with `assets.mjs remove`.

Japanese field recordings: RutgerMuller's "Field Recordings Japan" pack (CC0).

**Rejected sound sources:**

- BBC RemArc: non-commercial.
- ZapSplat free tier: requires credit, with restrictions.
- Kōka-on Lab: free commercial use, but no redistribution, so not for a public repo.

**Fonts.** Google Fonts, all OFL: Courier Prime, VT323, Shippori Mincho, Klee One, M PLUS 1p,
DotGothic16. Credit them as `SIL OFL 1.1` and ship the OFL text next to the font file.

**Kenney.** Input Prompts (recoloured to the UI palette), Interface Sounds and the cursor pack are
all CC0.

**Poly Haven + ambientCG.** The realistic PBR backbone (28 and 9 rows in THE ONES). ambientCG
vegetation sets come as **PNG**: run `fix_texture_imports.mjs` after importing them
(`references/godot-import.md`).

**Sketchfab.** Scriptable: `scripts/sketchfab.mjs` for search, sheet and info, and
`assets.mjs get sketchfab:<uid>=<key>` for downloading. See `references/sketchfab.md`. In THE ONES
it was the main model source (44 of 213 credit rows).

**Quaternius and other free itch.io packs** can be downloaded by script. This procedure comes from
the NPC subagent in the THE ONES session and wasn't re-tested here:

1. `GET <page>` with a cookie jar, and pull `csrf_token` from the HTML.
2. `POST <page>/download_url` with `csrf_token`. That returns `{url}`, the download page.
3. `GET` that page, and pull `data-upload_id="…"` plus a fresh `csrf_token`.
4. `POST <page>/file/<upload_id>?source=game_download` with `csrf_token`. That returns `{url}`, a
   signed R2 URL. Download it.

Leave `key=` out of step 4: passing it returns `{"errors":["invalid key"]}`. This only works for free
(price 0) packs. Read the licence from the page; Quaternius is CC0. The Universal Animation Library
1+2 was THE ONES' shared clip source, retargeted at runtime (see `references/godot-import.md`).

**Marketplaces** (only after the free search):

- Fab Standard allows use in other engines, except "UE-Only Content".
- The Unity Asset Store EULA allows any engine, except "restricted" assets.
- CGTrader blocks bots, so thumbnails can't be checked automatically. Say so to the user.

## Manual-only sources

| Site | Good for | License pattern |
| --- | --- | --- |
| [OpenGameArt](https://opengameart.org) | Sprites, tilesets, music, anything retro | Mixed; filter by CC0 |
| [itch.io game assets](https://itch.io/game-assets/free) | Consistent 2D packs from indie artists | Per pack, often custom; read it (free packs can be scripted, see above) |
| [Mixamo](https://www.mixamo.com) | Humanoid rigging and clips | Adobe terms: fine in a game, **raw files not redistributable**. Mixamo clips baked into a CC BY Sketchfab model may still carry Mixamo's terms, so flag it to the user. |
| [Google Fonts](https://fonts.google.com) | Game UI fonts; also the `google/fonts` GitHub repo | OFL |
| [Freesound](https://freesound.org) (browser) | Realistic SFX when there's no API key | Per sound |
| [Pixabay music](https://pixabay.com/music/) | Background music | Pixabay licence (in-game use; no raw redistribution) |
| [Incompetech](https://incompetech.com/music/) | Background music | CC BY 4.0 |

## Font picks for game UI (all OFL)

- Pixel / retro: *Press Start 2P*, *Silkscreen*, *VT323*, *DotGothic16*
- Clean HUD: *Inter*, *Rubik*, *Chakra Petch*
- Typewriter / period paper: *Courier Prime*
- Japanese titles: *Shippori Mincho*, *Klee One*, *M PLUS 1p*
- Fantasy: *Cinzel*, *MedievalSharp*
- Sci-fi: *Orbitron*, *Audiowide*

Download from `https://github.com/google/fonts/tree/main/ofl/<family>` into `assets/fonts/` and credit
as `SIL OFL 1.1`.
