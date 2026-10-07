---
name: nextjs-docs-site
description: Add a documentation site to an existing Next.js 16 app with Fumadocs — MDX in the repo, sidebar, search, llms.txt, generated reference pages, and a CI guard that fails when the docs fall behind the API. Use when the user says "add documentation", "I want a docs site", "docs like Mintlify", "my docs are one giant page", "docs with a sidebar and search", or when a Fumadocs build fails with "Can't resolve '../../.source'" or "Cannot find module '../../.source/server'".
metadata:
  author: Jibaru
  version: 1.0.0
---

# nextjs-docs-site

Mount a Fumadocs docs site at `/docs` inside an existing Next.js app, with content as MDX in
the repo. Every file and failure below comes from
[wapi](https://github.com/crafter-station/wapi) (`apps/web`, 22 pages live at
https://wapi.crafter.run/docs). The paths cited (`apps/web/...`, `ops/...`) are in that repo.

**Versions: Next 16, React 19.2, Fumadocs 16 (fumadocs-ui / fumadocs-core 16, fumadocs-mdx 15).**
Several things here are false on Next 14 / Fumadocs 13, especially the `.source/server`
import and the `proxy.ts` file.

## Before writing code: read the local Next docs

Next 16 changed APIs your training data describes differently. The installed version ships
its own docs, so read them. Resolve where `next` actually lives instead of assuming a path:

```bash
# run from the app directory (e.g. apps/web), not the monorepo root
node -p "require.resolve('next/package.json')"
# → …/node_modules/next/package.json ; the docs are in …/node_modules/next/dist/docs/
```

In a hoisted monorepo (bun, pnpm with hoisting) that resolves to the **root** `node_modules`,
and `apps/web/node_modules/next` does not exist. Without hoisting it resolves inside the app.
`next dev` also writes an `AGENTS.md` block saying the package "may not be visible from the
repo root". In wapi the opposite is true. The block is regenerated on every `next dev`, so
don't trust it or delete it. Resolve the path every time.

## Fumadocs or Mintlify?

| | Fumadocs | Mintlify |
| --- | --- | --- |
| Where the content lives | MDX in your repo | their SaaS |
| CI can check it against the code | yes | no |
| Reference pages generated from the contract | yes (OpenAPI, tables, CLI) | partially |
| Setup and maintenance | yours | theirs |

Choose Fumadocs when there is something to verify: an API contract, a CLI, an SDK surface
that docs can silently fall behind. If the project has nothing to check docs against,
Mintlify is a defensible choice. Say this to the user rather than declaring a winner.

## Step 1: Check compatibility from the registry

Peer ranges move. Read them from npm rather than from memory:

```bash
npm view fumadocs-ui peerDependencies --json
npm view fumadocs-mdx peerDependencies --json
npm view fumadocs-openapi peerDependencies --json   # only if generating API pages
```

Typical result for Fumadocs 16: `fumadocs-ui` wants `next: "16.x.x"`, `react: "^19.2.0"`.
**Compare against the range in `package.json`, not only the installed version.** wapi
declares `"react": "^19.0.0"` while 19.2.8 happens to be installed. A fresh install that
resolves 19.0 or 19.1 does not satisfy Fumadocs. Raise the range to `^19.2` as part of the change.

**If the app builds with webpack on purpose** (wapi does: `"build": "next build --webpack"`,
explained in `nextjs-project-structure`), confirm fumadocs-mdx ships webpack loaders
before installing:

```bash
npm pack fumadocs-mdx@15 && tar xzf fumadocs-mdx-*.tgz
node -e "console.log(Object.keys(require('./package/package.json').exports).join(' '))"
# look for ./webpack/mdx, ./webpack/macro, ./webpack/meta
```

That check retired the plan's biggest risk in two minutes. Delete the tarball afterwards.

## Step 2: Install and wire the five files

```bash
npm i fumadocs-ui fumadocs-core fumadocs-mdx   # or bun add / pnpm add, matching the repo
npm i -D @types/mdx
```

The complete files are in `references/files.md`. In order:

1. `source.config.ts` (app root): content dir plus frontmatter schema.
2. `src/lib/source.ts`: the loader. The import is `../../.source/server`.
3. `next.config.ts`: wrap the existing config with `createMDX()`; don't replace it.
4. `src/app/docs/layout.tsx`: `RootProvider` + `DocsLayout`.
5. `src/app/docs/[[...slug]]/page.tsx`: static catch-all page.

Plus `src/mdx-components.tsx`, `content/docs/index.mdx` and `content/docs/meta.json`.
Add the generated folder to `.gitignore` (the path relative to the repo root):

```
apps/web/.source/
```

## Step 3: Search, llms.txt, auth

- **Search**: `src/app/api/search/route.ts` → `export const { GET } = createFromSource(source);`
  This is a static Orama index built from the same page tree as the sidebar, so it needs no external service.
- **llms.txt**: `src/app/llms.txt/route.ts` generated from `source.getPages()`, so it cannot list a deleted page.
- **Auth** (Clerk or any proxy-level gate): make `"/docs(.*)"`, `"/api/search"` and
  `"/llms.txt"` public. See Trap 4.

## Step 4: Generate what you can instead of writing it

Hand-written reference pages rot, while generated ones can't fall behind.

- **API endpoints**: `fumadocs-openapi` renders one page per operation from an OpenAPI
  document, with a playground. Check its peer range first, like Step 1.
- **Tables from the contract**: wapi renders 57 CLI commands from the CLI's coverage
  table (`apps/cli/src/coverage.ts`, imported as `@wapi/cli/coverage`).
- **Coverage guard**: each page declares in frontmatter what it documents
  (`operations: [...]`, the schema extension in `source.config.ts`), and
  `ops/check-docs-in-sync.mjs` fails CI in three directions: an operation nobody documents,
  a page claiming an id that no longer exists, two pages claiming the same id. Coverage is
  **declared, not inferred**: a guard that scrapes links out of prose can't tell coverage
  from a passing mention. On its first run it found 10 undocumented operations. The complete
  guard is in `references/files.md`.

## Traps

**Trap 1: wrong generated import.** fumadocs-mdx 15 emits `.source/browser.ts`,
`dynamic.ts` and `server.ts`, with no index barrel.

```
Module not found: Can't resolve '../../.source'
```

Import `../../.source/server`.

**Trap 2: `.source` missing in CI. This is the expensive one.** `.source` is a build
artifact and is gitignored. `next build` generates it and `tsc` does not. Locally a previous
build left the folder behind, so typecheck passes. On a clean checkout CI fails:

```
apps/web/src/lib/source.ts(2,22): error TS2307: Cannot find module '../../.source/server'
```

Generate it before typechecking. In a single app: `"typecheck": "fumadocs-mdx && tsc --noEmit"`
(that's what `apps/web/package.json` does). In a monorepo whose typecheck script calls `tsc`
per project, run the generator from that script (`ops/typecheck.mjs`, in
`references/files.md`). Don't put it in the app's `postinstall`: bun does not run lifecycle
scripts of workspace packages, so it would be skipped silently.

**Trap 3: `next.config.ts` replaced instead of wrapped.** Apply `createMDX()` **last**, around
the whole config, so a project's own `webpack:` hook (wapi's `extensionAlias`) survives.

**Trap 4: docs index works, every subpage redirects to sign-in.** The public route matcher
was `"/docs"`. That matches only the index, so `/docs/quickstart` returns 307 to Clerk while `/docs`
returns 200. Use `"/docs(.*)"`. The same matcher shape failed twice before in wapi's
`apps/web/src/proxy.ts` (`/api/webhook-sink`, `/site.webmanifest`). Also make `/api/search`
public: a 307 there looks to the search box like "no results", so the bug looks like
an empty index.

**Trap 5: code blocks unreadable in dark mode.** Fumadocs emits dual-theme Shiki output
(`--shiki-light` / `--shiki-dark` inline on every token) but ships no rule that consumes them.
It expects a `.dark` class. If the site does dark mode with `prefers-color-scheme`, every
snippet renders light colours on a dark background. That's legible in a screenshot and
unreadable in use. Fix: the Shiki block in `apps/web/src/app/docs/docs.css`
(in `references/files.md`). If the site uses a class toggle instead, this trap doesn't apply.

**Trap 6: links shout.** Fumadocs styles anchors with
`:where(a:not([data-card])):not(:where(.not-prose, .not-prose *))`. There's no `.prose` ancestor,
so it hits the sidebar, TOC and breadcrumbs too, with `font-weight: 500` and a 1.5px primary
underline. It's built entirely from `:where()`, so it has **zero specificity**: any ordinary rule
beats it, no `!important` needed. wapi's override is in `docs.css`.

**Trap 7: a second theme system.** If the site already handles dark mode, turn off
Fumadocs' own: `<RootProvider theme={{ enabled: false }}>`. Otherwise `next-themes` mounts a
class-based switcher and the docs and the app disagree about what "dark" means. Map
Fumadocs' `--color-fd-*` tokens onto the site's tokens with `var()` (`docs.css` does all
26). Design guidance is in the `nextjs-design-system` skill.

## Done means

Run each of these and see it pass. Don't stop at "should work":

- [ ] `next build` (with `--webpack` if the project uses it) completes, and `/docs/[[...slug]]`
      is listed as static (●/SSG).
- [ ] On a **clean checkout** (or after deleting `.source/`), the repo's typecheck command passes.
- [ ] Every docs page returns **200, not 307**, signed out:
      `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/docs/<page>` for the index
      and at least one nested page. Same for `/api/search?query=<word>` and `/llms.txt`.
- [ ] Search returns results for a word that appears in a page body.
- [ ] In dark mode, a code token's computed colour is the dark-theme value
      (`getComputedStyle(token).color` in a browser test, or a screenshot you actually look at).
- [ ] The coverage guard passes, and fails when you delete one page's `operations:` entry.
