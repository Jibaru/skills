# nextjs-docs-site: complete files

Every file below is copied verbatim from wapi (Next 16.3, React 19.2, fumadocs-ui/core 16, fumadocs-mdx 15). Paths are relative to the wapi repo root; the app lives in `apps/web`. Adapt names (title, URLs, the `operations` field) and keep the structure and the comments' reasoning.

## 1. source.config.ts

From `apps/web/source.config.ts`:

```ts
import { defineConfig, defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

/**
 * The content source.
 *
 * `operations` is the only field added to the stock frontmatter, and it is the contract between a
 * page and `ops/check-docs-in-sync.mjs`: every one of the API's operations must be claimed by some
 * page, and every id claimed must still exist. Declared rather than inferred, for the same reason
 * `SCOPES` and `COVERAGE` are — a guard that scraped links out of prose could not tell coverage
 * from a passing mention, and would silently un-cover an endpoint the moment somebody reworded a
 * sentence. The page renders its own "operations covered" list from this same field, so the guard
 * and the page cannot disagree.
 */
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      operations: z.array(z.string()).optional(),
    }),
  },
});

export default defineConfig();
```

Drop the `operations` extension if the project has no contract to check coverage against; keep `defineDocs` + `defineConfig`.

## 2. src/lib/source.ts

From `apps/web/src/lib/source.ts`:

```ts
import { loader } from "fumadocs-core/source";
import { docs } from "../../.source/server";

/** The page tree, read by the layout, the pages, the search index and `llms.txt`. */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
```

`.source/server`, not `.source`: fumadocs-mdx 15 emits `browser.ts`, `dynamic.ts` and `server.ts` with no barrel.

## 3. next.config.ts (wrapped, not replaced)

From `apps/web/next.config.ts`:

```ts
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Standalone keeps the image small; the workspace packages are traced from the repo root.
  output: "standalone",
  outputFileTracingRoot: "../../",

  /**
   * The shared packages are TypeScript source, not built artifacts, so Next has to compile
   * them itself.
   */
  transpilePackages: ["@wapi/core", "@wapi/db", "@wapi/contracts", "@wapi/cli"],

  /**
   * Built with webpack rather than Turbopack, for one specific reason.
   *
   * The shared packages use NodeNext-style `./thing.js` specifiers that point at `.ts`
   * sources — required because `apps/gateway` and `apps/webhook-worker` run under Node with
   * `moduleResolution: nodenext`. Turbopack cannot map those back to `.ts` and fails with 27
   * "Can't resolve './crypto.js'" errors; webpack can, via `extensionAlias` below.
   *
   * The alternative — dropping extensions from the packages' internal imports — would break
   * the Node consumers, so the bundler bends rather than the runtime.
   */
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = {
      ...(cfg.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return cfg;
  },
};

/**
 * Fumadocs' MDX pipeline, wrapped around the config rather than replacing it.
 *
 * `createMDX` is applied last so the `extensionAlias` above survives: the workspace packages'
 * `./thing.js` specifiers still have to resolve to `.ts`, and that is the reason this app builds
 * with webpack instead of Turbopack in the first place. fumadocs-mdx ships webpack loaders
 * (`fumadocs-mdx/webpack/mdx`), so that choice did not have to be revisited.
 */
export default createMDX()(config);
```

Without the webpack constraint the minimum is:

```ts
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  // whatever the project already had
};

export default createMDX()(config);
```

## 4. src/app/docs/layout.tsx

From `apps/web/src/app/docs/layout.tsx`:

```tsx
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import "fumadocs-ui/style.css";
import "./docs.css";

/**
 * The docs shell.
 *
 * `theme.enabled: false` switches off `next-themes`, which is deliberate and load-bearing. This
 * site has no `.dark` class and no toggle: `globals.css` swaps its tokens on
 * `@media (prefers-color-scheme: dark)`, and the shiki setup swaps code colours the same way via
 * `--shiki-dark`. Letting Fumadocs mount a class-based theme switcher would leave the docs and
 * the dashboard disagreeing about what "dark" means the moment somebody used it. Instead the
 * whole site follows the reader's system setting, and `docs.css` maps Fumadocs' tokens onto ours.
 *
 * The nav title is the same wordmark as the landing (`wapi.`) and links home — Jakob's law plus
 * brand continuity so the guide does not feel like a different product from the marketing page.
 */
export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ options: { api: "/api/search" } }} theme={{ enabled: false }}>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <span className="wordmark text-[1.05rem]">
              wapi<span>.</span>
            </span>
          ),
          url: "/",
        }}
        githubUrl="https://github.com/crafter-station/wapi"
        links={[
          {
            text: "API reference",
            url: "https://api.wapi.crafter.run/docs",
            external: true,
          },
        ]}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
```

`theme={{ enabled: false }}` only when the site already owns dark mode (here: `prefers-color-scheme` in `globals.css`). A site using `next-themes` with a `.dark` class can leave Fumadocs' theme on.

## 5. src/app/docs/[[...slug]]/page.tsx

From `apps/web/src/app/docs/[[...slug]]/page.tsx`:

```tsx
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import { Operations } from "@/components/operations";
import { getMDXComponents } from "@/mdx-components";
import { source } from "@/lib/source";

/**
 * Every docs page.
 *
 * Static, like the page it replaces: `generateStaticParams` enumerates the tree at build time, so
 * the whole site is HTML on disk and the Orama search index is built once rather than per request.
 */
export const dynamic = "force-static";

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
        {/*
          Rendered here rather than written into each page, so every page that declares coverage
          shows it, in the same place, without any MDX boilerplate to forget.
        */}
        <Operations ids={page.data.operations ?? []} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return { description: page.data.description, title: page.data.title };
}
```

`params` is a Promise in Next 16. `<Operations>` is wapi's coverage list, rendered from the same frontmatter field the guard reads; remove it if you dropped `operations`.

## 6. src/mdx-components.tsx

From `apps/web/src/mdx-components.tsx`:

```tsx
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { CommandTable } from "@/components/command-table";
import { DemoVideo } from "@/components/demo-video";

/**
 * Components available to every MDX page.
 *
 * Registered globally rather than imported per page: an import line at the top of twenty MDX files
 * is twenty chances to forget one, and the failure mode is a page that renders the component name
 * as text.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultComponents, CommandTable, DemoVideo, Tab, Tabs, ...components };
}
```

## 7. content/docs/meta.json (sidebar order)

From `apps/web/content/docs/meta.json`:

```json
{
  "pages": ["index", "quickstart", "authentication", "guides", "sandbox", "cli", "sdks"]
}
```

A page's frontmatter needs at least `title` and `description`:

```mdx
---
title: Authentication
description: Two credentials, two jobs, one header — and using the wrong one is a 403.
operations:
  - postApiTokens
  - getApiTokens
  - deleteApiTokensToken
---

Body in MDX.
```

## 8. src/app/api/search/route.ts

From `apps/web/src/app/api/search/route.ts`:

```ts
import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

/**
 * Docs search.
 *
 * Orama, built from the same page tree the sidebar renders, so a page cannot be findable in one
 * and missing from the other. Twenty-two pages is past the point where an anchor list works, and
 * the index is small enough that it needs no external search service.
 */
export const { GET } = createFromSource(source);
```

## 9. src/app/llms.txt/route.ts

From `apps/web/src/app/llms.txt/route.ts`:

```ts
import { source } from "@/lib/source";

/**
 * `llms.txt` — the documentation as one index, for agents.
 *
 * Generated from the page tree rather than written, so it cannot list a page that no longer
 * exists or miss one that was added. This matters more here than for most projects: wapi ships an
 * agent skill and expects agents to wire it up, and an agent that has to guess at the shape of the
 * docs guesses at the API too.
 */
export const dynamic = "force-static";

const SITE = process.env["WEB_PUBLIC_URL"] ?? "https://wapi.crafter.run";

export function GET() {
  const lines = [
    "# wapi",
    "",
    "> WhatsApp over HTTP. A self-hosted clone of the WasenderAPI surface, with a sandbox that",
    "> lets you build and test without a real phone number.",
    "",
    "## Docs",
    "",
  ];

  for (const page of source.getPages()) {
    const description = page.data.description ? `: ${page.data.description}` : "";
    lines.push(`- [${page.data.title}](${SITE}${page.url})${description}`);
  }

  lines.push(
    "",
    "## Reference",
    "",
    `- [API reference](https://api.wapi.crafter.run/docs): all 57 endpoints, generated from the contract.`,
    `- [OpenAPI document](https://api.wapi.crafter.run/openapi.json): the raw spec.`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

## 10. src/app/docs/docs.css (tokens, dark code, quiet links)

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

The Shiki block is the dark-mode code fix (Trap 5); the links block is the zero-specificity override (Trap 6). Both assume the site's own tokens (`--background`, `--foreground`, …) already flip under `prefers-color-scheme`.

## 11. Public routes in src/proxy.ts

From `apps/web/src/proxy.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Next 16 renamed middleware to `proxy`. This file must be `src/proxy.ts`.
 *
 * With it named `middleware.ts` the build still reported "Proxy (Middleware)", so it looked
 * wired — but Clerk could not detect it and every `auth()` call threw
 * "auth() was called but Clerk can't detect usage of clerkMiddleware()". Clerk's own error
 * text lists `proxy.(ts|js)` first, which is the tell.
 *
 * Everything except the landing page requires a signed-in user.
 *
 * Clerk guards humans only. Machine credentials — Personal Access Tokens and session API
 * keys — are minted here but verified locally in `apps/api` against hashed Postgres rows,
 * never through Clerk (PLAN.md §3).
 */
/**
 * `/api/webhook-sink` is public because it is a *receiver*: the webhook worker POSTs to it
 * with no browser session. It is not unauthenticated — the route verifies the delivery
 * signature against a known session secret and rejects anything else. Leaving it behind Clerk
 * produced a 307 redirect that the worker silently treated as a failed delivery.
 */
const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhook-sink",
  /**
   * The CLI device flow. Unauthenticated by necessity — a terminal has no Clerk session, and
   * obtaining one is the point of the exchange. `start` only creates a pending request; `poll`
   * requires the high-entropy token the CLI kept, compared by hash. The *approval* step is the
   * `/cli` page, which is protected like everything else.
   */
  "/api/cli/(.*)",
  /**
   * Documentation is public; requiring sign-in to read a getting-started guide is absurd.
   *
   * The pattern must be `(.*)`, not a bare `/docs`. While the docs were one page that was the
   * same thing; the moment they became a tree, every page below the root 307'd to sign-in and
   * only the index still worked. That is the third time this exact matcher shape has bitten in
   * this file — see `/api/webhook-sink` and `webmanifest` below.
   */
  "/docs(.*)",
  // The docs' own search backend and machine-readable index. Both are read by the public docs
  // pages, so gating them behind sign-in breaks search for signed-out readers — silently, since
  // a 307 to Clerk looks to the search box like an empty result set.
  "/api/search",
  "/llms.txt",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

/**
 * Static assets skip the middleware entirely.
 *
 * `webmanifest` was missing from this list, so `/site.webmanifest` fell through to
 * `auth.protect()` and 307'd to Clerk's sign-in page — the same failure already recorded above
 * for `/api/webhook-sink`, and just as quiet: the manifest is fetched by the browser rather
 * than by a person, so nothing surfaces except a PWA install prompt that never appears.
 *
 * The others are here because they are the assets most likely to be added next — fonts, a
 * robots.txt, a modern image format — and each would fail exactly the same silent way.
 * Everything listed lives in `public/`, which Next serves publicly by definition, so excluding
 * them widens nothing that was ever protected.
 */
export const config = {
  matcher: [
    "/((?!_next|[^?]*\.(?:ico|png|svg|jpg|webp|avif|css|js|txt|woff|woff2|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

Next 16 file name: `src/proxy.ts` (or root `proxy.ts`), next to `app/`. The old `middleware.ts` name builds but Clerk cannot detect it.

## 12. Generating .source before typecheck (monorepo)

From `ops/typecheck.mjs`, lines 44-72:

```mjs
/**
 * Generate anything a project needs *before* typechecking it.
 *
 * `apps/web` imports its docs content from `.source`, which fumadocs-mdx generates from
 * `source.config.ts` and which is gitignored because it is a build artifact. `next build` creates
 * it, but typecheck runs before any build — so on a clean checkout the import resolved to nothing
 * and CI failed with `Cannot find module '../../.source/server'` on a tree that typechecks fine
 * locally, where a previous build had left the directory behind.
 *
 * Done here rather than as a `postinstall` in the app, because this script invokes `tsc` directly
 * per project and never runs a workspace's own scripts — and because bun does not run lifecycle
 * scripts for workspace packages by default, so a hook there would be silently skipped.
 */
for (const dir of projects) {
  if (!existsSync(join(dir, "source.config.ts"))) continue;
  const bin = ["fumadocs-mdx", "fumadocs-mdx.cmd", "fumadocs-mdx.exe", "fumadocs-mdx.bunx"]
    .map((name) => join(root, "node_modules", ".bin", name))
    .find(existsSync);
  if (!bin) {
    console.error(`${dir} needs fumadocs-mdx to generate .source — run \`bun install\` first`);
    process.exit(1);
  }
  const gen = spawnSync(bin, [], { cwd: dir, stdio: "pipe" });
  if (gen.status !== 0) {
    console.error(`${dir} … FAILED to generate .source`);
    console.error(String(gen.stderr || gen.stdout));
    process.exit(1);
  }
}
```

`projects`, `root`, `existsSync`, `join` and `spawnSync` are defined earlier in that script. In a single app, `"typecheck": "fumadocs-mdx && tsc --noEmit"` does the same job.

## 13. Coverage guard: ops/check-docs-in-sync.mjs

From `ops/check-docs-in-sync.mjs`:

```mjs
/**
 * Does the documentation cover every API operation?
 *
 * The CLI guard asks this of `apps/cli/src/coverage.ts`; this asks it of the docs site. Each MDX
 * page declares the operations it documents in its frontmatter, and the page renders that same
 * list — so what a page claims and what this checks are one string rather than two that drift.
 *
 * Three directions, because a one-way check rots:
 *
 *   1. Every operation in `ROUTES + EXTENSION_ROUTES` is claimed by some page. A new endpoint
 *      makes CI red until somebody writes about it. This is the whole point: the reference
 *      already lists every endpoint automatically, so it is the *prose* that silently falls
 *      behind, and nothing else would notice.
 *   2. Every operation id a page claims still exists in the contract. A renamed operation
 *      therefore breaks the build instead of leaving a page advertising an endpoint that is gone
 *      and a dead deep-link into the reference.
 *   3. No operation is claimed by two pages. Not fatal, but it means two pages are each half
 *      documenting something, which is how a reader ends up with neither half.
 *
 * What it cannot check is whether the prose about an operation is *correct*, or even present —
 * only that a page has taken responsibility for it. That is the same limit the CLI guard has, and
 * the same answer applies: this is the cheap question, asked on every push.
 *
 * Run with bun, not node — it imports TypeScript sources.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { EXTENSION_ROUTES, ROUTES } from "../packages/contracts/src/index.ts";

const CONTENT = "apps/web/content/docs";

let failed = false;
const fail = (headline, lines = []) => {
  failed = true;
  console.error(`  FAIL  ${headline}`);
  for (const line of lines) console.error(`          ${line}`);
};

/** Every `.mdx` under the content directory, at any depth. */
const pages = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith(".mdx")) pages.push(path);
  }
};
walk(CONTENT);

if (!pages.length) {
  fail(`No MDX pages found under ${CONTENT}. The content directory moved, or the build is empty.`);
  process.exit(1);
}

/**
 * The `operations:` list out of a page's frontmatter.
 *
 * Parsed rather than imported because this runs without Next, and a YAML dependency for one list
 * of strings would be more machinery than the job needs. The shape is fixed by
 * `source.config.ts`, so it is a list of `  - id` lines under `operations:` and nothing else; a
 * page written any other way fails the schema at build time, before it reaches this script.
 */
const operationsOf = (file) => {
  const text = readFileSync(file, "utf8");
  const frontmatter = text.split("---")[1] ?? "";
  const lines = frontmatter.split("\n");
  const start = lines.findIndex((l) => l.trim() === "operations:");
  if (start === -1) return [];

  const ids = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^\s+-\s+(\S+)\s*$/.exec(line);
    if (!match) break;
    ids.push(match[1]);
  }
  return ids;
};

const claimed = new Map();
for (const page of pages) {
  for (const id of operationsOf(page)) {
    if (!claimed.has(id)) claimed.set(id, []);
    claimed.get(id).push(page.replace(/\\/g, "/"));
  }
}

const all = [...ROUTES, ...EXTENSION_ROUTES];
const known = new Set(all.map((r) => r.operationId));

// 1. Every operation is documented somewhere.
const undocumented = all.filter((r) => !claimed.has(r.operationId));
if (undocumented.length) {
  fail(
    `${undocumented.length} operation(s) are documented by no page:`,
    undocumented.map((r) => `${r.method} ${r.path}  (${r.operationId})`),
  );
}

// 2. Every claimed id still exists.
const unknown = [...claimed].filter(([id]) => !known.has(id));
if (unknown.length) {
  fail(
    `${unknown.length} claimed operation(s) are not in the contract:`,
    unknown.map(([id, where]) => `${id} — claimed by ${where.join(", ")}`),
  );
}

// 3. Nothing is claimed twice.
const duplicated = [...claimed].filter(([, where]) => where.length > 1);
if (duplicated.length) {
  fail(
    `${duplicated.length} operation(s) are claimed by more than one page:`,
    duplicated.map(([id, where]) => `${id} — ${where.join(", ")}`),
  );
}

if (!failed) {
  console.log(`  ok    ${pages.length} pages document all ${all.length} operations`);
}

console.log(failed ? "\ndocs coverage check failed" : "\nok — the docs cover the API");
process.exit(failed ? 1 : 0);
```

Run it with bun (it imports TypeScript). Wire it into CI next to typecheck. Replace `ROUTES` / `EXTENSION_ROUTES` with whatever your contract exports: OpenAPI operation ids, CLI command names, SDK methods.
