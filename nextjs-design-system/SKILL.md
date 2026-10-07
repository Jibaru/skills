---
name: nextjs-design-system
description: Set up or repair the design system of a Next.js 16 + Tailwind v4 site so it stops looking like a template — measured tokens, an achromatic palette, dark mode via the OS, one typographic signature, shadows that actually show, third-party UI mapped onto your tokens, and design checked with numbers instead of impressions. Use when the user says "my site looks generic", "looks AI-generated", "set up the design system", "color tokens", "dark mode", "pick a font", "this looks flat/cheap", or when a component library's colors or link styles clash with the site.
metadata:
  author: Jibaru
  version: 1.0.0
---

# nextjs-design-system

A template look comes from defaults nobody decided on: library colours, a webfont nobody
chose, invisible shadows, every link styled the same. Fix it by deciding values, measuring
them, and testing them. Everything here comes from [wapi](https://github.com/crafter-station/wapi)
(`apps/web`). The paths cited are in that repo.

**Versions: Next 16, Tailwind v4 (`@import "tailwindcss"` + `@theme inline`, no
`tailwind.config.js`), Fumadocs 16.** On Tailwind v3 the tokens go in `tailwind.config.js`
`theme.extend.colors` instead. The CSS-variable approach below is the same. For Next APIs
(`next/font`, layouts), read the installed docs: `node -p "require.resolve('next/package.json')"`
from the app directory, then `dist/docs/`.

## Principle: tokens are measured, then adapted, and the two are kept separate

wapi's system started from a reference site. `docs/design-reference.md` opens with:

> Read from the live CSS bundles (`_next/static/chunks/233p45nuh4m5b.css`, `44sm4aufd6b0r.css`)
> on 2026-08-23. These are measured values, not impressions.

and it carries a dated correction: an earlier reading reported weights "400/500/600 only",
which turned out to be the token layer, not the design. The real headings use 580-720.

What makes this work is that **the reference document describes the other site, not this one.**
Its type scale is `clamp(3.4rem, 6.2vw, 5.9rem)` for display. wapi's `globals.css` uses
`clamp(2.9rem, 6vw, 5.4rem)`, adapted to wapi's layout. Copying the reference values as if they
were the project's spec is the mistake to avoid. Any agent reading a "design reference" will be
tempted to make it. Do this instead:

1. **Measure** the reference from its shipped CSS (DevTools → computed styles, or the CSS
   bundle). Don't eyeball screenshots.
2. **Write it down** as the reference's values, dated, with the source URL.
3. **Adapt** to your layout in your own CSS, with a comment saying where each value came from.
4. **Correct in writing** when a reading turns out wrong. Leave the wrong line with a
   correction note rather than silently editing it.

## The palette: achromatic, one chromatic token

shadcn's token names, Tailwind v4. These are wapi's actual values (`apps/web/src/app/globals.css`):

| token | light | dark |
| --- | --- | --- |
| `--background` | `#ffffff` | `#0a0a0a` |
| `--foreground` | `#0a0a0a` | `#fafafa` |
| `--card` | `#ffffff` | `#171717` |
| `--muted` | `#f5f5f5` | `#262626` |
| `--muted-foreground` | `#737373` | `#a1a1a1` |
| `--border` | `#e5e5e5` | `rgb(255 255 255 / 0.1)` |
| `--input` | `#e5e5e5` | `rgb(255 255 255 / 0.15)` |
| `--primary` | `#171717` | `#e5e5e5` |
| `--primary-foreground` | `#fafafa` | `#171717` |
| `--ring` | `#737373` | `#a1a1a1` |
| `--destructive` | `#e40014` | `#ff6568` |
| `--radius` | `0.625rem` | |

**`--destructive` is the only chromatic token, and there is no brand colour.** So status is
carried by **weight, fill and border style**, not by hue: a filled badge versus an outlined one, bold
versus regular, solid versus dashed. When a library brings its own colours, map them onto
these tokens instead of adopting them. Fumadocs' callouts ship blue info, amber warning
and green success. Taking them would have added four hues to a palette built around having none.
wapi maps them to foreground and muted-foreground, and only `error` keeps the chromatic token,
because a destructive signal is what it's for (`apps/web/src/app/docs/docs.css`).

**Editorial alias layer** on top of the component tokens:

```css
--landing-paper: var(--background);
--landing-ink: var(--foreground);
--landing-line: var(--border);
--landing-wash: var(--muted);
```

Print vocabulary (paper, ink, line, wash) names what a surface is for, separately from which
component token it borrows.

## Dark mode: `prefers-color-scheme` only (and what that implies)

wapi has no `.dark` class and no toggle. The tokens flip inside
`@media (prefers-color-scheme: dark) { :root { … } }`. Most libraries assume the opposite, so
each one has to be told:

- **next-themes / Fumadocs' switcher off**: `<RootProvider theme={{ enabled: false }}>`
  (`apps/web/src/app/docs/layout.tsx`).
- **Library tokens defined through yours**: all of Fumadocs' `--color-fd-*` tokens are
  `var(--background)` and so on (`docs.css`). Your tokens already flip under the media query, so
  **one definition covers both schemes**. The docs can't drift from the dashboard the way a
  copied set of hex values would.
- **Code highlighting**: Shiki emits `--shiki-light` / `--shiki-dark` per token. Swap them with
  the same media query, or every snippet renders light-on-dark. The rule is in `docs.css`.
- **`body` gets an explicit background.** A transparent body inherits whatever is behind it,
  which is how a dark-mode page ends up with black text on black.

If the project **does** want a toggle, every point above flips: a class strategy, next-themes
on, `.dark` selectors everywhere. Pick one. Mixing them leaves the docs and the app disagreeing
about what "dark" means.

## Typography: one signature, four lines

```css
.display em,
.title em {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.045em;
}
```

That's **one serif phrase per heading**, against a tight sans: "WhatsApp over HTTP, *on your own
box.*" That rule carries the whole brand voice. Georgia rather than a webfont, because it costs no network
request and the contrast comes from the letterforms, not the specific face. MDX headings can't
carry a class, so `docs.css` binds the same rule to `#nd-docs-layout h1 em, h2 em, h3 em`.

The rest of wapi's scale (`globals.css`):

```css
.display {
  font-size: clamp(2.9rem, 6vw, 5.4rem);
  font-weight: 610;
  letter-spacing: -0.072em;
  line-height: 0.94;
  text-wrap: balance;
}

.title {
  font-size: clamp(2.1rem, 4.4vw, 3.6rem);
  font-weight: 580;
  letter-spacing: -0.062em;
  line-height: 1.03;
  text-wrap: balance;
}

.kicker {
  color: var(--muted-foreground);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
```

- **Variable weights just under bold** (580, 610…, not 700): headings read as heavy
  without shouting. The sans is Geist via `next/font/google`, which is self-hosted at build time.
- **Shell**: `--shell: min(1180px, calc(100% - 40px))`.
- **Sections are separated by one 1px rule**, not by boxes. Fewer containers, more rhythm.

## Shadows: the one that's actually visible

The first version of the film's terminal panels used `0 24px 60px rgba(10,10,10,0.10)`.
At 10% on white it is **invisible**, and the panels looked printed onto the page instead of
floating above it. What works is two shadows: a tight one for the lifted edge and a wide one
for height (`apps/video/src/components/Terminal.tsx`, line 104):

```css
box-shadow: 0 2px 6px rgba(10, 10, 10, 0.06), 0 28px 70px rgba(10, 10, 10, 0.22);
```

The web app itself uses **no** box-shadows (there are none in `globals.css`). It separates
surfaces with `1px solid var(--border)` and the radius. Use one strategy per surface type.

Same diagnosis for a white card on a white page: without a border it has no edge, and it reads as loose text
instead of a surface. `1px solid var(--border)` + `--radius` (+ the two-layer shadow only if it
must float) fixes it.

## Audit every library against your system

Read the library's actual CSS rules. Its documentation won't show them. Example from Fumadocs: its link rule is
`:where(a:not([data-card])):not(:where(.not-prose, .not-prose *))`, with no `.prose` ancestor, so it
also styles the sidebar, TOC and breadcrumbs, with `font-weight: 500` and a 1.5px primary underline.
wapi's convention is a hairline underline in the inherited colour, with no weight change, so every docs link was
louder than anything else on the site. The whole selector is built from `:where()`, which means
**zero specificity**: an ordinary rule beats it, no `!important`. wapi's override is the links
block in `docs.css` (full file in the `nextjs-docs-site` skill's references).

Check every library the same way: list the colours, weights and decorations it adds, and map
each one onto a token or remove it.

## Verify with numbers

Looking at a page tells you something "looks a bit off". Measuring tells you by how much.

**Colour in dark mode**: compare the computed value (`apps/web/e2e/public.pw.ts`, lines 196-227,
in `references/files.md`):

```ts
const page = await browser.newPage({ colorScheme: "dark" });
await page.goto("/docs/quickstart");
const token = page.locator("pre .shiki span, .shiki span").first();
const colour = await token.evaluate((el) => getComputedStyle(el).color);
expect(colour).not.toBe("rgb(36, 41, 46)"); // the light theme's value
```

**Centring**: render the frame, then compute the bounding box of non-background pixels. This
was used during a wapi session on the film's frames, and it was never committed as a script. Given a grayscale
buffer `gray` of width `W` and height `H`:

```js
let minX = W, maxX = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (gray[y * W + x] < 235) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
}
const offCentre = Math.round((minX + maxX) / 2 - W / 2);   // px; negative = left of centre
```

It found every scene sitting 65 to 250 px left of centre, two of them clipped at x=0.
Something that only "looks a bit off" never gets a number. Get `gray` from a Playwright screenshot decoded
in the page (draw it to a canvas, `getImageData`) or with any PNG decoder.

## Anti-patterns to name and remove

- Gradients that encode nothing.
- Stacked shadows imitating depth the layout already provides, or one shadow too faint to see.
- A brand colour used for status.
- New hues arriving through a library's defaults.
- A theme toggle in a system that follows the OS, or the reverse.
- A webfont for a three-word accent.
- A "design reference" pasted in as if it were the project's own spec.

## Done means

- [ ] Every colour in the UI resolves to a token. Grep the components for hex values and arbitrary
      Tailwind colours (`text-[#`, `bg-blue-`).
- [ ] Dark mode is driven by exactly one mechanism, and libraries are configured for it.
- [ ] A browser test in `colorScheme: "dark"` asserts body background and code colour.
- [ ] Surfaces that should read as raised have a visible edge (border, or the two-layer shadow).
- [ ] Reference values and adapted values are recorded separately, with dates and sources.
