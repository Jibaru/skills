# nextjs-static-files: complete files

Verbatim from wapi. Paths are relative to the repo root. Note: the size figures inside `demo-video.tsx`'s comments are stale (see SKILL.md, "Measure the artifact, not the comment"); the code is current.

## apps/web/src/components/demo-video.tsx

From `apps/web/src/components/demo-video.tsx`:

```tsx
"use client";

import { useState } from "react";

/**
 * Where the rendered film lives.
 *
 * A release asset rather than a file in this repo: it is regenerated on every cut, and a few
 * megabytes per version would be permanent weight in each future clone. The same
 * `releases/latest/download` mechanism already serves the CLI binaries.
 *
 * Overridable so a deployment can serve it from its own origin instead.
 */
const MP4 =
  process.env["NEXT_PUBLIC_DEMO_VIDEO_URL"] ??
  "https://github.com/crafter-station/wapi/releases/latest/download/wapi-demo.mp4";
const WEBM =
  process.env["NEXT_PUBLIC_DEMO_VIDEO_WEBM_URL"] ??
  "https://github.com/crafter-station/wapi/releases/latest/download/wapi-demo.webm";

/**
 * The demo, behind a poster.
 *
 * **Click to play, not autoplay**, and that decision does real work. The film has a soundtrack, and
 * a browser will only autoplay muted — so an autoplaying loop would show the whole thing to
 * somebody who never hears it and burn the payoff. Requiring a click means every view is a chosen
 * one.
 *
 * It also settles `prefers-reduced-motion` for free, which this site has no other handling for: a
 * poster is a still image until somebody asks for motion.
 *
 * The poster is committed; the video is fetched on demand. Nothing loads until the click, so the
 * page costs 40 KB rather than 1.2 MB for readers who never press play.
 */
export function DemoVideo({ className }: { className?: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        autoPlay
        className={className}
        controls
        poster="/demo-poster.jpg"
        style={{
          aspectRatio: "1120 / 630",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          display: "block",
          width: "100%",
        }}
      >
        {/*
          Ordered by measured bytes, and mp4 is currently the smaller one.
          
          A browser takes the FIRST source it can play, so this order decides what everybody
          downloads. The webm was listed first on the strength of a number written into a comment
          back when the film was 1120x630 — at 2560x1440 the vp9 encode overtook h264 and nobody
          re-derived the order, so every play fetched 9.0 MB instead of 4.9 MB. Measure the release
          assets before changing this (`gh release view --json assets`); do not trust the shape of
          the usual answer, and do not write the sizes here, because a number in a comment goes
          stale and then quietly decides things.
        */}
        <source src={MP4} type="video/mp4" />
        <source src={WEBM} type="video/webm" />
      </video>
    );
  }

  return (
    <button
      aria-label="Play the demo — 78 seconds"
      className={className}
      onClick={() => setPlaying(true)}
      style={{
        aspectRatio: "1120 / 630",
        background: `center / cover no-repeat url(/demo-poster.jpg)`,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        display: "block",
        padding: 0,
        position: "relative",
        width: "100%",
      }}
      type="button"
    >
      <span
        style={{
          alignItems: "center",
          background: "var(--foreground)",
          borderRadius: 999,
          color: "var(--background)",
          display: "flex",
          height: 62,
          insetInlineStart: "50%",
          justifyContent: "center",
          position: "absolute",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 62,
        }}
      >
        {/* A triangle, not an icon font: one glyph that cannot fail to load. */}
        <span style={{ fontSize: 20, marginInlineStart: 4 }}>▶</span>
      </span>
      <span
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 999,
          bottom: 12,
          color: "var(--muted-foreground)",
          fontSize: "0.75rem",
          insetInlineEnd: 12,
          padding: "4px 10px",
          position: "absolute",
        }}
      >
        78 seconds
      </span>
    </button>
  );
}
```

Put the smaller format first in the `<source>` list. The browser picks the first one it can play, so ordering is a bandwidth decision. Re-check it whenever the render settings change.

## Lazy-load test: apps/web/e2e/public.pw.ts

From `apps/web/e2e/public.pw.ts`, lines 135-157:

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

    /**
     * Nothing is fetched until somebody presses play, which is the whole reason this is a poster
     * and not an autoplaying loop: the landing page costs 40 KB for a reader who never watches,
     * rather than megabytes. It also means the page has no motion until motion is asked for, which is
     * this site's only concession to prefers-reduced-motion.
     */
    expect(videoRequests).toEqual([]);

    await play.click();
    await expect(page.locator("video")).toBeVisible();
  });
});
```

## Release-hosted assets: .github/workflows/release.yml

From `.github/workflows/release.yml`, lines 138-157:

```yaml
      - name: Keep it for inspection
        # On a manual run there is no release to attach to, so the film lands as an artifact.
        if: github.event_name == 'workflow_dispatch'
        uses: actions/upload-artifact@v4
        with:
          name: demo-film
          path: apps/video/out/

      - name: Attach to the release
        # The landing page points at `releases/latest/download/wapi-demo.mp4`, so the film has to
        # be on the release rather than in the repo — ~4.2 MB, regenerated rather than authored.
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          fail_on_unmatched_files: true
          files: |
            apps/video/out/wapi-demo.mp4
            apps/video/out/wapi-demo.webm
            apps/video/out/poster.jpg
```

## Derived audio from a versioned script: ops/make-music.mjs

From `ops/make-music.mjs`:

```mjs
/**
 * Cut the film's music bed from the delivered track.
 *
 * The source is a ~2:20 instrumental generated in Suno (Pro tier, so the commercial rights come
 * with the download — see the licence note below). It is **not committed**: 27 MB of PCM in git,
 * for something regenerated rather than authored, is the same trade this repo already declined for
 * the rendered film. What is committed is the 1.9 MB excerpt this produces, plus this script, so
 * the transformation is reproducible rather than folklore.
 *
 *   node ops/make-music.mjs path/to/background.wav
 *
 * **Why it starts at 4 seconds.** The track opens with five seconds of silence and runs to a real
 * ending at 2:17, and 78 seconds have to come from somewhere. Two candidates: the last 78s, which
 * would land the track's genuine ending on the end card; or the first 78s from where it begins.
 * Mapping the track's level second by second decided it — there is a breakdown at 1:12 and another
 * at 1:36. Taking the tail put the first of those on the film's opening send, which is the beat
 * that most needs presence. Starting at 0:04 puts it at 1:08 instead, on the payoff title, where
 * the film wants to thin out anyway. The cost is a manufactured fade rather than the track's own
 * ending, spent across the end card where it reads as intended.
 *
 * **-26 LUFS** because it is a bed, not the subject. The effects peak around -20 dBFS, so the
 * music has to sit under them or the key clicks vanish. Normalising here rather than with a
 * `volume` prop keeps the decision in one place: the composition plays this file at unity.
 *
 * Needs ffmpeg on PATH.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const SOURCE = process.argv[2];
const OUT = "apps/video/public/music";
const TARGET = `${OUT}/bed.mp3`;

/** Exactly the composition's length, so the bed neither loops nor runs out early. */
const DURATION = 78.06;
const START = 4;

if (!SOURCE) {
  console.error("usage: node ops/make-music.mjs path/to/background.wav");
  process.exit(2);
}
if (!existsSync(SOURCE)) {
  console.error(`${SOURCE} does not exist.`);
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

const res = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-ss", String(START),
    "-t", String(DURATION),
    "-i", SOURCE,
    "-af",
    // In over the landing scroll, out across the end card, then levelled.
    "afade=t=in:st=0:d=2.5,afade=t=out:st=74:d=4,loudnorm=I=-26:TP=-6:LRA=11",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    TARGET,
  ],
  { encoding: "utf8" },
);

if (res.status !== 0) {
  console.error(res.stderr?.slice(-800) ?? "ffmpeg failed");
  process.exit(1);
}

console.log(`ok — wrote ${TARGET}`);
```

## Standalone runtime stage: Dockerfile

From `Dockerfile`, lines 113-124:

```dockerfile

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Standalone output carries its own minimal node_modules.
COPY --from=web-builder /app/apps/web/.next/standalone ./
COPY --from=web-builder /app/apps/web/.next/static ./apps/web/.next/static
# `public/` is NOT included in standalone output and has to be copied explicitly, or every
# static asset 404s in production while working perfectly in `next dev`.
COPY --from=web-builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```
