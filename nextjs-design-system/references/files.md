# nextjs-design-system: complete files

Verbatim from wapi. `globals.css` is the project's own system; `docs/design-reference.md` is a measured reading of a DIFFERENT site (normal.fast) that the system was adapted from. Keep that distinction in your own project.

## Tokens: apps/web/src/app/globals.css (palette, aliases, @theme)

From `apps/web/src/app/globals.css`, lines 1-76:

```css
@import "tailwindcss";

/*
 * Design system — measured from https://normal.fast (source: cuevaio/normal).
 * Full notes in docs/design-reference.md.
 *
 * Two things carry the voice:
 *   1. The palette is achromatic. `--destructive` is the only chromatic token, so status has
 *      to be communicated with weight, fill and border style. That is a constraint we keep.
 *   2. Headings are tight, large, and just under bold, with ONE phrase per heading set in
 *      Georgia serif. That serif fragment against the sans is the whole signature.
 */

:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --card: #ffffff;
  --muted: #f5f5f5;
  --muted-foreground: #737373;
  --border: #e5e5e5;
  --input: #e5e5e5;
  --primary: #171717;
  --primary-foreground: #fafafa;
  --ring: #737373;
  --destructive: #e40014;

  /* Editorial alias layer, as the source defines it. */
  --landing-paper: var(--background);
  --landing-ink: var(--foreground);
  --landing-line: var(--border);
  --landing-wash: var(--muted);

  --radius: 0.625rem;
  --shell: min(1180px, calc(100% - 40px));

  /* Scrollbars, themed like everything else rather than left to the platform. */
  --scrollbar-thumb: #d4d4d4;
  --scrollbar-thumb-hover: #a3a3a3;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #fafafa;
    --card: #171717;
    --muted: #262626;
    --muted-foreground: #a1a1a1;
    --border: rgb(255 255 255 / 0.1);
    --input: rgb(255 255 255 / 0.15);
    --primary: #e5e5e5;
    --primary-foreground: #171717;
    --ring: #a1a1a1;
    --destructive: #ff6568;

    --scrollbar-thumb: rgb(255 255 255 / 0.18);
    --scrollbar-thumb-hover: rgb(255 255 255 / 0.3);
  }
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-destructive: var(--destructive);
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}

* {
  border-color: var(--border);
```

## Type scale: apps/web/src/app/globals.css

From `apps/web/src/app/globals.css`, lines 169-212:

```css
/* ---------------------------------------------------------------- typography */

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

/*
 * The signature. One serif phrase per heading, against the tight sans.
 * Deliberately Georgia rather than a loaded webfont: it needs no network request and the
 * contrast comes from the letterforms, not from the specific face.
 */
.display em,
.title em {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.045em;
}

.kicker {
  color: var(--muted-foreground);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lede {
  color: var(--muted-foreground);
  font-size: clamp(1.02rem, 1.6vw, 1.2rem);
  line-height: 1.65;
  text-wrap: pretty;
```

## Library mapped onto the tokens: apps/web/src/app/docs/docs.css

From `apps/web/src/app/docs/docs.css`:

```css
/*
 * Fumadocs, wearing this site's clothes.
 *
 * Every one of Fumadocs' 26 `--color-fd-*` tokens is redefined here in terms of the site's own
 * tokens. Because those already flip under `@media (prefers-color-scheme: dark)` in `globals.css`,
 * mapping through `var()` means dark mode needs no second block here — one definition covers both,
 * and the docs can never drift from the dashboard's palette the way a copied set of hex values
 * would.
 *
 * Fumadocs normally expresses dark with a `.dark` class driven by `next-themes`, which the layout
 * disables. Nothing applies that class, so these values are the only ones that ever apply.
 */
:root {
  --color-fd-background: var(--background);
  --color-fd-foreground: var(--foreground);
  --color-fd-muted: var(--muted);
  --color-fd-muted-foreground: var(--muted-foreground);
  --color-fd-border: var(--border);
  --color-fd-ring: var(--ring);

  --color-fd-card: var(--card);
  --color-fd-card-foreground: var(--foreground);
  --color-fd-popover: var(--card);
  --color-fd-popover-foreground: var(--foreground);

  --color-fd-primary: var(--primary);
  --color-fd-primary-foreground: var(--primary-foreground);
  --color-fd-secondary: var(--muted);
  --color-fd-secondary-foreground: var(--foreground);
  --color-fd-accent: var(--muted);
  --color-fd-accent-foreground: var(--foreground);

  --color-fd-overlay: rgb(10 10 10 / 0.45);

  /*
   * Status colours, deliberately achromatic.
   *
   * `docs/design-reference.md` records that `--destructive` is the only chromatic token in the
   * system and that status is otherwise carried by weight, fill and border. Fumadocs ships blue
   * `info`, amber `warning` and green `success` callouts; taking them would put four new hues into
   * a palette built around having none. Error keeps the one chromatic token because a destructive
   * signal is exactly what it is for.
   */
  --color-fd-error: var(--destructive);
  --color-fd-warning: var(--foreground);
  --color-fd-success: var(--foreground);
  --color-fd-info: var(--muted-foreground);
  --color-fd-idea: var(--muted-foreground);

  --color-fd-diff-add: var(--muted);
  --color-fd-diff-add-symbol: var(--foreground);
  --color-fd-diff-remove: var(--muted);
  --color-fd-diff-remove-symbol: var(--muted-foreground);
}

/*
 * The signature, carried over.
 *
 * `globals.css` sets one italic phrase per heading in Georgia; MDX headings cannot carry a
 * `.title` class, so the same rule is bound to `em` inside docs headings. It is the whole reason
 * these pages read as the same product as the landing page rather than as stock Fumadocs.
 */
#nd-docs-layout h1 em,
#nd-docs-layout h2 em,
#nd-docs-layout h3 em {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.045em;
}

/*
 * Code colours, in both schemes.
 *
 * Fumadocs' MDX pipeline emits dual-theme shiki output — `--shiki-light` and `--shiki-dark` as
 * inline custom properties on every token — but ships no rule that consumes them, because it
 * normally relies on a `.dark` class this site does not have. `globals.css` already does this
 * swap, but scoped to `.code .shiki`, which is the site's own code component; MDX blocks are not
 * inside it.
 *
 * Without these two rules every snippet in the docs renders in light colours, including on a dark
 * background — which is legible enough in a screenshot to be missed and unreadable in practice.
 */
#nd-docs-layout .shiki,
#nd-docs-layout .shiki span {
  color: var(--shiki-light, inherit);
  font-style: var(--shiki-light-font-style, inherit);
  font-weight: var(--shiki-light-font-weight, inherit);
}

@media (prefers-color-scheme: dark) {
  #nd-docs-layout .shiki,
  #nd-docs-layout .shiki span {
    color: var(--shiki-dark, inherit);
    font-style: var(--shiki-dark-font-style, inherit);
    font-weight: var(--shiki-dark-font-weight, inherit);
  }
}

/*
 * Links, back to this site's convention.
 *
 * Fumadocs underlines every anchor on the page — its rule is
 * `:where(a:not([data-card])):not(:where(.not-prose, .not-prose *))`, with no `.prose` ancestor,
 * so it catches the sidebar, the table of contents and the breadcrumbs as well as body prose. It
 * also sets `font-weight: 500` and a 1.5px underline in the primary colour, which is a much
 * louder link than anything else on this site: `globals.css` underlines prose links with the
 * inherited colour at the browser's default hairline.
 *
 * The whole Fumadocs selector is built from `:where()`, so it carries zero specificity and an
 * ordinary rule beats it. No `!important` needed anywhere below.
 */

/* Navigation is not prose. Underlining a sidebar makes a list of links look like a list of
   corrections. */
#nd-sidebar a,
#nd-toc a,
#nd-docs-layout nav a,
#nd-docs-layout [data-card],
#nd-docs-layout [data-card] * {
  text-decoration: none;
  font-weight: inherit;
}

/* Body links: underlined, but at the weight and colour the rest of the site uses. */
#nd-docs-layout .prose a {
  color: var(--foreground);
  font-weight: inherit;
  text-decoration: underline;
  text-decoration-color: var(--border);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

#nd-docs-layout .prose a:hover {
  text-decoration-color: currentColor;
}

/* Headings that happen to be links keep their weight rather than inheriting the link rule. */
#nd-docs-layout .prose :is(h1, h2, h3, h4) a {
  font-weight: inherit;
  text-decoration: none;
}

/*
 * Index path grouping — proximity without inventing a second palette.
 *
 * Extra space before section headings separates "Start here" from "Pick a language" the way a
 * hairline rule would on the landing page. Tighter sidebar rows keep more of the tree above the
 * fold (selective attention for the next page).
 */
#nd-docs-layout .prose h2 {
  margin-top: 2.75rem;
  letter-spacing: -0.03em;
}

#nd-docs-layout .prose h2:first-of-type {
  margin-top: 2rem;
}

#nd-sidebar a {
  font-size: 0.875rem;
}
```

## Dark-mode test: apps/web/e2e/public.pw.ts

From `apps/web/e2e/public.pw.ts`, lines 196-227:

```ts

  test("survives a dark-mode reader, and so does its code", async ({ browser }) => {
    const page = await browser.newPage({ colorScheme: "dark" });
    const errors = collectConsoleErrors(page);
    await page.goto("/docs/quickstart");

    const background = await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    // A transparent body means the page inherits whatever is behind it, which is how a dark-mode
    // page ends up with black text on a black ground.
    expect(background).not.toBe("rgba(0, 0, 0, 0)");

    /**
     * Code colour, specifically.
     *
     * Fumadocs emits dual-theme shiki output but ships no rule that consumes `--shiki-dark`,
     * because it expects a `.dark` class this site does not have — so without the swap in
     * `docs.css` every snippet renders in light colours on a dark ground. It is legible enough in
     * a screenshot to be missed and unreadable in practice, which is exactly what a test is for.
     */
    const token = page.locator("pre .shiki span, .shiki span").first();
    await expect(token).toBeVisible();
    const colour = await token.evaluate((el) => getComputedStyle(el).color);
    const dark = await token.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--shiki-dark").trim(),
    );
    // The variable has to exist, and the rendered colour has to be the dark one rather than the
    // light one sitting beside it.
    expect(dark).not.toBe("");
    expect(colour).not.toBe("rgb(36, 41, 46)");
```

`collectConsoleErrors` is a helper defined earlier in that file; it records `console.error` and page errors.

## The reference reading: docs/design-reference.md (excerpt)

From `docs/design-reference.md`, lines 1-75:

```md
# Design reference — extracted from https://normal.fast

Read from the live CSS bundles (`_next/static/chunks/233p45nuh4m5b.css`, `44sm4aufd6b0r.css`)
on 2026-08-23. These are measured values, not impressions.

**What the site is:** Normal — WhatsApp ↔ MCP for ChatGPT/Claude. Next.js + Turbopack + Clerk,
which is the same stack we're standing on.

## System

Tailwind **v4** (`--spacing: .25rem`, `@theme` token layer, `lab()` colour space) with the full
**shadcn/ui** token set — `card`, `popover`, `sidebar`, `chart-1..5`, `ring`, `input`, `accent`,
`destructive`. Radius `--radius: .625rem` (10px).

## Palette — pure neutral, zero chroma

| Token | Light | Dark |
|---|---|---|
| `background` | `#ffffff` | `#0a0a0a` |
| `foreground` | `#0a0a0a` | `#fafafa` |
| `card` / `popover` | `#ffffff` | `#171717` |
| `muted` | `#f5f5f5` | `#262626` |
| `muted-foreground` | `#737373` | `#a1a1a1` |
| `border` | `#e5e5e5` | `rgba(255,255,255,.10)` |
| `input` | `#e5e5e5` | `rgba(255,255,255,.15)` |
| `primary` | `#171717` | `#e5e5e5` |
| `ring` | `#737373` | `#a1a1a1` |
| `destructive` | `#e40014` | `#ff6568` |

Charts are a **grayscale ramp**: `#d4d4d4 · #737373 · #525252 · #404040 · #262626`.

**There is no brand colour.** `destructive` is the only chromatic token in the system. One stray
`--sidebar-primary: #1447e6` (blue) appears in dark mode while its light-mode sibling is `#171717` —
an unoverridden shadcn default, not a deliberate accent. Don't copy it.

## Semantic alias layer

A second, editorial naming layer sits on top of the shadcn tokens:

```css
--landing-paper: var(--background);
--landing-ink:   var(--foreground);
--landing-line:  var(--border);
--landing-wash:  var(--muted);
```

Print vocabulary — paper, ink, line, wash. Worth adopting; it makes landing-surface intent explicit
and separable from component tokens.

## Typography

- **Geist Sans** (`--font-geist-sans`) and **Geist Mono** (`--font-geist-mono`), with `Fallback` faces.
- **Correction.** An earlier reading of the compiled Tailwind theme reported "400/500/600 only".
  That was the token layer, not the design. The landing source uses fine-grained variable
  weights — **580, 610, 620, 650, 680, 700, 720** — so headings sit just below bold rather than
  at it.
- **The signature move: `<em>` inside headings is set in Georgia serif**, weight 400,
  `letter-spacing: -0.055em`, against the tight Geist sans. One serif phrase per heading is
  what gives the page its voice.
- Display headings: `clamp(3.4rem, 6.2vw, 5.9rem)`, weight 610, `letter-spacing: -0.072em`,
  `line-height: 0.94`, `text-wrap: balance`. Section h2: `clamp(2.65rem, 5vw, 4.8rem)`,
  weight 580.
- Shell width: `min(1180px, calc(100% - 40px))`. Sections separated by a single
  `1px solid var(--landing-line)` rule, with a soft radial `--muted` wash behind the hero.
- Scale: `xs .75 · sm .875 · base 1 · lg 1.125 · xl 1.25 · 2xl 1.5 · 3xl 1.875 · 4xl 2.25` (rem),
  each with a paired line-height.
- Leading: `tight 1.25 · snug 1.375 · normal 1.5`.
- Tracking: `tight -.025em` (headings), `widest .1em` (eyebrows/labels).

## Motion

Fast and short — durations `.1s`, `.15s`, `.2s`. Default `--default-transition-duration: .15s`.

```css
--ease-out:    cubic-bezier(.23, 1, .32, 1);      /* expo-out, decisive */
```

Compare its display clamp, `clamp(3.4rem, 6.2vw, 5.9rem)`, and its em tracking, `-0.055em`, with the adapted values in `globals.css`: `clamp(2.9rem, 6vw, 5.4rem)` and `-0.045em`. That gap is the adaptation step working as intended.
