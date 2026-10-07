---
name: nextjs-static-files
description: Decide where a file goes in a Next.js 16 project — public/, a code import, outside the repo, or generated at build — and what each choice costs in the git history, the Docker image and the browser. Use when the user asks "where do I put this image", "add an asset/font/PDF/video", "my file 404s in production but works in dev", "the repo is getting heavy", "serve this file", or when every static asset 404s after deploying a standalone build.
metadata:
  author: Jibaru
  version: 1.0.0
---

# nextjs-static-files

Every file a Next app serves has to live somewhere. Each location has different costs for
caching, image size and clone size. Everything here comes from
[wapi](https://github.com/crafter-station/wapi) (`apps/web`, deployed as a `standalone` Docker
image). The paths cited are in that repo.

**Versions: Next 16, React 19.2.** The `public/` and standalone behaviour is the same in Next 14/15.
`next/font` and `output: "standalone"` exist in both. Check the installed docs for your version:
`node -p "require.resolve('next/package.json')"` from the app directory, then `dist/docs/`.
In a hoisted monorepo that path is under the root `node_modules`.

## First question: is the file authored or generated?

- **Authored** (a logo, an icon, a hand-made poster): small, changes rarely, belongs in git.
- **Generated** (a rendered video, an export, a build artifact): it gets regenerated, and every
  committed version is permanent weight in every future clone. Produce it with a **versioned
  command**, and keep the output out of git.

Then pick a location:

| Location | URL | Cache-busting | Use for |
| --- | --- | --- | --- |
| `public/` | fixed, `/name.ext` | none: same URL, browsers may serve the old copy | URLs something outside your code must guess: favicon, `apple-touch-icon`, OG image, `robots.txt`, `site.webmanifest`, a poster referenced by URL |
| `import x from "./x.svg"` | hashed by the bundler | automatic | anything that is part of the UI |
| outside the repo (release asset, bucket, CDN) | absolute | yours to version | large or regenerated files: video, audio, datasets |
| generated at build, gitignored | depends | n/a | build artifacts such as fumadocs-mdx's `.source/` |

## Trap: standalone output does not include `public/`

With `output: "standalone"`, everything works in `next dev` and every favicon, manifest and
image **404s in production**. The standalone folder has the server and its traced dependencies,
not `public/` or `.next/static`. The installed docs say so (`dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`:
"This minimal server does not copy the `public` or `.next/static` folders by default").
wapi's runtime stage (`Dockerfile`, lines 117-122):

```dockerfile
COPY --from=web-builder /app/apps/web/.next/standalone ./
COPY --from=web-builder /app/apps/web/.next/static ./apps/web/.next/static
# `public/` is NOT included in standalone output and has to be copied explicitly, or every
# static asset 404s in production while working perfectly in `next dev`.
COPY --from=web-builder /app/apps/web/public ./apps/web/public
```

If the project uses standalone, those three lines go together, or none of them do. Missing
`.next/static` gives the same symptom for JS and CSS chunks: an unstyled, non-interactive page.

**Related, if there's an auth proxy:** a `public/` file can still be gated by `src/proxy.ts` if
the proxy matcher doesn't exclude its extension. wapi's `/site.webmanifest` returned 307 to the sign-in
page because `webmanifest` was missing from the exclusion list. The browser fetches it, not a
person, so the only visible symptom was a PWA install prompt that never appeared. The matcher in
`apps/web/src/proxy.ts` excludes `ico|png|svg|jpg|webp|avif|css|js|txt|woff|woff2|webmanifest`.

## Keep a size budget for `public/`, and measure it

wapi's `apps/web/public` is ~67 KB in bytes (84 KB on disk):

```
36354  demo-poster.jpg
17565  icon-512.png
 4535  icon-192.png
 3426  apple-touch-icon.png
 2308  favicon.ico
 2289  favicon-dark.ico
  467  favicon.svg
  467  favicon-dark.svg
  388  icon.config.json
  340  site.webmanifest
```

Measure any new file against that total. Two real decisions were made against it:

- **A 27 MB music WAV showed up in `apps/web/public`.** It would have shipped with the site
  and the Docker image. It moved out of the repo. What's committed is a 1.9 MB excerpt in the video
  project plus the script that cuts it, `ops/make-music.mjs`. The transformation is reproducible
  ("reproducible rather than folklore", in that file's header).
- **The demo film (wapi-demo.mp4 4.9 MB, wapi-demo.webm 9.0 MB at release v0.3.1) is not in
  git.** CI renders it on tag and attaches it to the GitHub release
  (`.github/workflows/release.yml`). The site points at `releases/latest/download/…`. Only
  the 36 KB poster is committed, because it's what paints before anything else loads.

**Measure the artifact, not the comment.** `demo-video.tsx` still says the mp4 is ~4.2 MB
and the webm ~2.7 MB, "listed first so most browsers take it". The webm grew to almost twice
the mp4, so listing it first now sends most browsers the bigger file. A size written in a
comment goes stale and quietly keeps deciding things. Check real sizes
(`gh release view --json assets`, `ls -l`) when ordering formats or setting a budget.

## Pattern: large asset outside the repo, with an override

From `apps/web/src/components/demo-video.tsx`:

```ts
const MP4 =
  process.env["NEXT_PUBLIC_DEMO_VIDEO_URL"] ??
  "https://github.com/crafter-station/wapi/releases/latest/download/wapi-demo.mp4";
const WEBM =
  process.env["NEXT_PUBLIC_DEMO_VIDEO_WEBM_URL"] ??
  "https://github.com/crafter-station/wapi/releases/latest/download/wapi-demo.webm";
```

The default is public, and self-hosters can override it per environment. `NEXT_PUBLIC_*` values are inlined
at **build** time and readable by anyone. That's fine for a URL, never for a credential.

## Pattern: load nothing until it's asked for

The player is a poster plus a button. The video is fetched only on click, so a visitor
who never presses play downloads the 36 KB poster and nothing else. It also covers
`prefers-reduced-motion` for free: a poster stays still until somebody asks for motion. The full
component is in `references/files.md`. The behaviour is **asserted by a test**, not assumed
(`apps/web/e2e/public.pw.ts`, lines 135-157; a comment block is trimmed here, and the verbatim file is in the references):

```ts
test.describe("the demo video", () => {
  test("shows a poster and only fetches the film when asked", async ({ page }) => {
    const videoRequests: string[] = [];
    page.on("request", (r) => {
      if (/\.(mp4|webm)(\?|$)/.test(r.url())) videoRequests.push(r.url());
    });

    await page.goto("/");
    const play = page.getByRole("button", { name: /play the demo/i });
    await expect(play).toBeVisible();

    expect(videoRequests).toEqual([]);

    await play.click();
    await expect(page.locator("video")).toBeVisible();
  });
});
```

Any time something must stay unloaded until asked for, write a test like this one.

## Derived assets come from a versioned command

The poster is a still from the film, rendered at 2x and then scaled down to the size the
site paints it at. It's one script in `apps/video/package.json`:

```json
"render:poster": "node ../../node_modules/@remotion/cli/remotion-cli.js still src/index.ts Demo out/poster.jpg --frame=900 --image-format=jpeg --jpeg-quality=88 --scale=2 && ffmpeg -v error -y -i out/poster.jpg -vf scale=1280:-1 -q:v 4 ../web/public/demo-poster.jpg"
```

The 2560-wide frame is for the release. The site gets 1280, because the player paints it at
roughly 600 CSS px (1200 device px on a 2x screen). Sending 2K would triple the bytes for nothing. Ask **at what size
is it painted**, not at what size it exists. A derived file nobody can regenerate goes
stale the first time the source changes.

## Screenshots as assets

From a session in the same project (the technique, not a committed script):

- A full-page capture at `deviceScaleFactor: 2` came out 2880×6264 and 866 KB as PNG. As JPEG at
  quality 82 and half the width it was 291 KB. For a tilted, partly blurred background plate,
  JPEG wins: PNG compresses anti-aliased text badly.
- When that same plate later filled a 2560-wide frame, the 1440-wide source scaled up 1.8× was
  the first thing the viewer saw, and it looked blurry. It had to be recaptured at 2x.

Capture at the size it will be **displayed**, not the size you happen to have.

## Fonts

wapi loads its UI sans through `next/font` (`Geist` in `apps/web/src/app/layout.tsx`).
next/font self-hosts the files at build time, so the page makes no request to Google. The accent
serif is plain Georgia: zero network requests, zero flash of unstyled text, and the contrast
comes from letterforms rather than a specific face. A webfont for a three-word accent is weight
with no payoff. In rendered video the argument is stronger: a font that fails to load leaves a
wrong frame forever.

## Checklist for a new file

- [ ] Authored or generated? If generated: out of git, produced by a versioned command.
- [ ] Does it need a stable, guessable URL (`public/`), or can it carry a hash (import)?
- [ ] Measured size against the current `public/` total. Over ~100 KB needs a reason.
- [ ] Standalone build: are the `public/` and `.next/static` COPY lines in the runtime image?
- [ ] Auth proxy: is its extension excluded from the proxy matcher? `curl -I` returns 200 when signed out.
- [ ] Is it loaded before anyone asks for it? If it shouldn't be, is there a test asserting that?
- [ ] Is it stored at the size it's painted at (×2 for retina), and no larger?
