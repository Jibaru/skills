---
name: game-landing-page
description: Build and publish a game's landing or press page — minimal full-bleed trailer page with download buttons by default, absolute Open Graph/Twitter meta and a 1200x630 og.jpg, stable GitHub "latest release" download links, desktop+mobile screenshot check, and GitHub Pages with a custom subdomain. Use when the user asks for "a landing page for my game", "game website", "press page", "og image / link preview", "put the game on GitHub Pages", "point a domain at it", or when a shared link shows no preview image.
metadata:
  author: Jibaru
  version: 1.0.0
---

# game-landing-page

A game page has one job: get the visitor to watch the trailer and press download. Everything here
comes from THE ONES' page, https://theones.crafter.run, in the public repo `crafter-games/the-ones-game`
(the game's source repo is private). The final page is 78 lines. The first version (commit `49185b5`) had
317: story, trailer, a five-image gallery, six feature cards, and downloads.

## Decide the shape first

- **Horror, mystery or narrative: minimal by default.** That means a full-bleed muted trailer, the title,
  download buttons and one small line. The user's verdict on the 317-line version: "haz la landing más
  simple, con el video sí, pero simple, sin mucha información, para que dé el pego" ("make the landing
  simpler, with the video yes, but simple, not much information, so it lands"). Information spoils mystery.
- **Systems-heavy games** (strategy, sims, roguelikes) can earn a features section, but only when the user
  asks for one.
- **Nothing from the game's spoiler list** may appear in any image (poster, OG image, gallery). See
  `game-trailer`, Rule 0.

## Build it from the template

`assets/index.html` is the shipped page with its values replaced by double-brace placeholders (`GAME`,
`SUBTITLE`, `HOOK`, `DOMAIN`, `ORG`, `REPO`, `ASSET_WIN`, `ASSET_MAC`, `AUTHOR`, …). Copy it to the
site repo's root and fill it in. It expects these files in `media/`:

| File | What | How |
| --- | --- | --- |
| `loop.mp4` or `trailer.mp4` | background video (muted, looping) | see "Background video" below |
| `poster.jpg` | first paint and no-autoplay fallback, a non-spoiler frame | `ffmpeg -ss <t> -i trailer.mp4 -frames:v 1 -q:v 3 poster.jpg` |
| `og.jpg` | 1200×630 link-preview image | see "OG image" below |
| `icon.png` | favicon | the game icon, or `icongen` |

Then run the checker:

```bash
node <skill>/scripts/check-landing.mjs index.html          # placeholders, OG/Twitter meta, media, links
node <skill>/scripts/check-landing.mjs index.html --live   # after deploy: HEAD every absolute URL
```

It fails on exactly what broke the first version. Run against `49185b5`, it reports: missing `og:url`,
relative `og:image` (`media/poster.jpg`), missing `twitter:card`/`twitter:image`, no canonical. The
shipped page passes.

## Rules that came from real mistakes

- **Every `og:` and `twitter:` URL is absolute** (`https://DOMAIN/media/og.jpg`). WhatsApp, X, Slack and Discord ignore
  a relative `og:image`. The user had to ask "¿tiene og image?" ("does it have an OG image?"). Add `og:url`, `og:image:width`/`height`
  (1200/630), `og:image:alt`, and `twitter:card=summary_large_image`. Set `og:video:width`/`height` to the
  video's **real** size (`ffprobe -v error -show_entries stream=width,height -of csv=p=0 trailer.mp4`).
  THE ONES' page declares 1280×720 for a 1600×900 file.
- **Download links never name a version:**
  `https://github.com/<org>/<repo>/releases/latest/download/<exact-asset-name>`, with asset names
  kept identical across releases (`TheOnes-win64.zip`, `TheOnes-macos.zip`). Don't print a version or a
  size on the page: "v0.7.0" and "458 MB" went stale and had to be patched by hand on every release.
- **A private source repo can't serve public downloads.** Use a separate public repo
  (`<game>-game`) for the page and the release assets.
- **No CSS uppercase on platform names.** `text-transform: uppercase` turned "macOS" into "MACOS".
- **Credit the author** when they ask. Find the login with `gh api user -q .login`. THE ONES' page shows
  "Hecho por Jibaru" ("Made by Jibaru") linking to https://github.com/Jibaru.
- **Reveal-on-scroll animations need progressive enhancement**, or headless screenshots and no-JS
  visitors see blank sections. The 317-line page did it correctly:
  `document.documentElement.classList.add("js")` plus `.js .reveal { opacity: 0 }`, never a bare
  `.reveal { opacity: 0 }`. The minimal template has no reveals, so nothing can be hidden.
- **Remove media the page no longer uses** when you trim it. `the-ones-game/media/` still ships
  `t11…t61.jpg`, `news.jpg` and `okuribi.jpg` from the old gallery.

## Background video: don't loop the full trailer

The template loops `media/trailer.mp4`. The trailer opens with a place card ("霧山村 — Iwate, 1998") and
ends with title cards. As a muted background, its own text collides with the page's `<h1>` during the
first seconds. This was verified in a 1440×900 screenshot of the template, and it happens on the live page too.
Cut a separate, silent background loop from text-free footage:

```bash
ffmpeg -y -ss 5 -t 30 -i trailer.mp4 -an -vf "scale=1280:-2" -c:v libx264 -preset slow -crf 28 \
  -pix_fmt yuv420p -movflags +faststart media/loop.mp4
ffmpeg -y -i media/loop.mp4 -vf "fps=1/3,scale=320:180,tile=5x2" -frames:v 1 loopsheet.png   # Read it: no cards, no spoilers
```

On THE ONES' trailer that gave 2.1 MB for 30 s against 12.7 MB for the full trailer. Point `<source>` at
`loop.mp4`, keep `og:video` on the full `trailer.mp4`, and have the sound button switch to the full trailer
if it should play with audio.

## OG image (1200×630) on Windows

ffmpeg on Windows has no fontconfig. `drawtext` without `fontfile=` draws nothing, and a `C:/…` path
breaks the filter parser. Copy the TTF next to the command and use a relative path:

```bash
cp assets/fonts/Title.ttf f.ttf
ffmpeg -y -i media/poster.jpg -vf "crop=1371:720:114:90,scale=1200:630,drawtext=fontfile=f.ttf:text='GAME':fontcolor=0xe6dfcf:fontsize=104:x=(w-text_w)/2:y=420:shadowcolor=black@0.85:shadowy=4,drawtext=fontfile=f.ttf:text='Subtitle':fontcolor=0xb8402a:fontsize=30:x=(w-text_w)/2:y=545" -q:v 3 media/og.jpg
rm f.ttf
```

Adjust the crop to your poster: it has to be 1.905:1 before scaling to 1200×630. After deploying, tell
the user that chat apps cache previews. https://developers.facebook.com/tools/debug/ forces a refresh.

## Check desktop and mobile before pushing

```bash
npx -y playwright screenshot --viewport-size=1440,900 --wait-for-timeout=4000 "file:///C:/path/to/index.html" "$SCRATCH/d.png"
npx -y playwright screenshot --viewport-size=390,844 --wait-for-timeout=4000 "file:///C:/path/to/index.html" "$SCRATCH/m.png"
ffmpeg -y -i "$SCRATCH/d.png" -i "$SCRATCH/m.png" -filter_complex "[0]scale=-2:640[a];[1]scale=-2:640[b];[a][b]hstack" "$SCRATCH/both.png"
```

Read `both.png`. On a fresh machine run `npx playwright install chromium` first, or the screenshot fails.
**Confirm the file you're screenshotting is the new one.** In THE ONES' session a Write to `index.html`
was refused ("modified since read"), and the screenshot that followed showed the old page, which could easily have been
taken for the new one.

## Publish

GitHub Pages from the public repo, optionally on a custom subdomain: see `references/pages-domain.md`.
Pages deploys lag a minute or two, so check with a cache-busting query (`curl -s "https://DOMAIN/?v=$RANDOM"`)
before deciding a change didn't ship.

## Done means

- [ ] `check-landing.mjs` passes on the file, and `--live` passes after deploy.
- [ ] Desktop and mobile screenshots were read: title readable, nothing from the video colliding with it, both buttons visible.
- [ ] No spoiler-list item in the poster, OG image or background loop.
- [ ] Download links use `releases/latest/download/` with stable asset names, and both resolve
      (`curl -sIL <url> | grep -i content-length`).
- [ ] The user was told about preview caches, and given the debugger link.
