# Asset sources: licenses and manual-only sites

## Licenses at a glance

| License | Use in a commercial game | Attribution | Notes |
| --- | --- | --- | --- |
| CC0 / public domain | yes | not required | Credit it anyway; `CREDITS.md` keeps a record of where it came from. |
| CC BY 3.0 / 4.0 | yes | **required** | Name, source and licence must appear where players can see them: a credits screen, a store page or a shipped `CREDITS.md`. |
| CC BY-SA | yes | required | Derivatives of the asset must use the same licence. Avoid it for art you'll modify. |
| CC BY-NC | **no** | required | Non-commercial only. Fine for a jam, a problem if the game is ever sold. |
| GPL / OGA-BY | varies | required | Read the licence. OpenGameArt uses these a lot. |
| "Free for personal use" | **no** | — | Treat it as unusable unless the user confirms the game is personal. |
| Mixamo | yes, in a game | not required | Raw files can't be redistributed, so keep them out of public repos. |

If an asset's licence is unclear, don't use it.

## Manual-only sources

These are worth pointing the user to. The skill can't download from them, so
the user downloads the file, puts it under `assets/`, and adds a credits row by hand.

| Site | Good for | License pattern |
| --- | --- | --- |
| [OpenGameArt](https://opengameart.org) | Sprites, tilesets, music, anything retro | Mixed; filter by CC0 |
| [itch.io game assets](https://itch.io/game-assets/free) | Consistent 2D packs from indie artists | Per pack; often custom, so read it |
| [Quaternius](https://quaternius.com) | Low-poly packs, animated characters (also on Poly Pizza) | CC0 |
| [Sketchfab](https://sketchfab.com/search?features=downloadable&licenses=7c23a1ba438d4306920229c12afcb5f9&type=models) | Very broad 3D selection (link is filtered to CC0) | Per model; many CC BY |
| [Mixamo](https://www.mixamo.com) | Humanoid rigging and animation clips | Adobe terms, see above |
| [Google Fonts](https://fonts.google.com) | Game UI fonts; also the `google/fonts` GitHub repo | OFL (free, including commercial use) |
| [Freesound](https://freesound.org) (browser) | Realistic SFX when there's no API key | Per sound |
| [Pixabay music](https://pixabay.com/music/) | Background music | Pixabay licence (free, including commercial use) |
| [Incompetech](https://incompetech.com/music/) | Background music | CC BY 4.0 |

## Font picks for game UI (all OFL)

- Pixel / retro: *Press Start 2P*, *Silkscreen*, *VT323*
- Clean HUD: *Inter*, *Rubik*, *Chakra Petch*
- Fantasy: *Cinzel*, *MedievalSharp*
- Sci-fi: *Orbitron*, *Audiowide*

Download a font from `https://github.com/google/fonts/tree/main/ofl/<family>`
into `assets/fonts/`, and credit it as `OFL 1.1`.
