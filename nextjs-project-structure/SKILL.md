---
name: nextjs-project-structure
description: Structure a Next.js 16 project or monorepo — workspaces, where shared code lives, how apps consume it, the server-only data layer, per-route rendering, state in the URL, and the Docker rules a new workspace breaks. Use when the user asks "how do I organize my Next project", "folder structure", "monorepo with Next", "where does this logic go", "share code between apps", "add a workspace/package", or when a build fails with "Can't resolve './x.js'" under Turbopack or the Docker image breaks after adding a workspace.
metadata:
  author: Jibaru
  version: 1.0.0
---

# nextjs-project-structure

Where things live in a Next.js project, and the reason for each placement. Everything here comes
from [wapi](https://github.com/crafter-station/wapi), a Bun-workspaces monorepo with a Next 16
dashboard and docs (`apps/web`), a Bun API, a Node gateway, a worker, a CLI and three SDKs. The paths cited are in
that repo.

**Versions: Next 16, React 19.2, Tailwind v4, Bun workspaces.** Next 14 differs: no `proxy.ts`,
synchronous `params`, and no `--webpack` flag because webpack was the default.

## Before writing code: read the local Next docs

Resolve where `next` is installed, from the app directory:

```bash
node -p "require.resolve('next/package.json')"   # docs live next to it, in dist/docs/
```

In a hoisted monorepo that is the root `node_modules`, and `apps/web/node_modules/next` does
not exist. From the wrong directory an agent concludes the docs are missing. Read
`dist/docs/01-app/` for anything below that touches a Next API.

## The shape

```
package.json          workspaces: ["apps/*", "packages/*", "compat", "sdk/*"]
apps/                 things that DEPLOY (or ship): one directory, one runtime
  web/                Next 16: landing, dashboard, docs        (next build --webpack)
  api/                Bun HTTP API
  gateway/            Node process holding WhatsApp sockets    (moduleResolution: nodenext)
  webhook-worker/     Node queue consumer
  cli/                published CLI; also exports one file to web (see below)
  video/              Remotion demo film; ships nothing, still a workspace
packages/             code SHARED by apps, as TypeScript SOURCE (no dist/)
  contracts/          the API contract: routes, schemas, OpenAPI generation
  core/  db/  baileys-auth/
sdk/                  clients published to registries (typescript, python, go)
compat/               suites that boot the whole stack and test it from outside
ops/                  CI guards and scripts (*.mjs), each failing the build on drift
Dockerfile            ONE file, one shared deps stage, one target per deployable
```

The rules behind it:

- **`apps/` = has its own runtime or release.** If you'd deploy it, publish it or run it on
  its own, it's an app. If it's only imported, it's a package.
- **`packages/` = imported by two or more apps.** Code used by one app stays in that app.
  Promote it when a second consumer appears, not before.
- **`ops/` guards compare declared state against the contract in both directions**, and fail CI.
  When a structural rule matters (every workspace in the Docker image, every operation in the
  docs), it gets a guard. A rule that only lives in a README gets broken eventually.

## Shared packages are source, not build artifacts

`packages/*` export `.ts` directly. There's no build step, no `dist/`, no watcher. Each
consumer compiles them. In `apps/web/next.config.ts`:

```ts
transpilePackages: ["@wapi/core", "@wapi/db", "@wapi/contracts", "@wapi/cli"],
```

What you get: go-to-definition opens real code, a change shows up in every consumer immediately, and
the "stale dist" class of bug doesn't exist. What you pay: every consumer needs a compiler that
understands the source, which leads to the next section.

### When two consumers want opposite things, bend the one with a local fix

The gateway and worker run on Node with `moduleResolution: nodenext`, which **requires**
extensions on relative imports. So the shared packages write `import { x } from "./crypto.js"`,
pointing at `crypto.ts`. Turbopack can't map that back to `.ts`:

```
Module not found: Can't resolve './crypto.js'
```

wapi hit that 27 times in one build. Webpack can do the mapping with `extensionAlias`:

```ts
webpack: (cfg) => {
  cfg.resolve.extensionAlias = {
    ...(cfg.resolve.extensionAlias ?? {}),
    ".js": [".ts", ".tsx", ".js"],
  };
  return cfg;
},
```

and the app builds with `"build": "next build --webpack"` (in `apps/web/package.json`; the
Dockerfile runs the same flag). Dropping the extensions from the packages would fix Turbopack and break
every Node consumer. That's a runtime change. The bundler setting is a local fix in one
config file. When two consumers disagree, change the one that has a local fix. The full config with
its reasoning is `apps/web/next.config.ts`, reproduced in `references/files.md`.

### Exposing one file from another workspace

The docs render the CLI's command-coverage table. Importing `@wapi/cli` would drag commander
and the SDK into a static build. Instead, `apps/cli/package.json` exports exactly one file:

```json
{
  "exports": {
    "./coverage": "./src/coverage.ts"
  }
}
```

The web app imports `@wapi/cli/coverage`, and `@wapi/cli` goes in `transpilePackages`. Only that
module enters the bundle. Then the Dockerfile's web build stage needs `apps/cli` copied in (see Docker below).

## The data layer: server-only, scoped inside

All database access for the web app lives in one module, `apps/web/src/lib/data.ts`, which
starts with:

```ts
import "server-only";
```

Importing it from a client component becomes a **build error** rather than a secret shipped to the
browser. Every query scopes by the current account inside the function, not at the call site:

```ts
export async function getAuditLog(id: number): Promise<AuditLog | null> {
  const accountId = await currentAccountId();
  const [row] = await db()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.id, id), eq(auditLogs.accountId, accountId)))
    .limit(1);
  return row ?? null;
}
```

A hand-edited id in the URL (`?selected=999`) still can't reach another account's row,
even if a future caller forgets to check. A caller can forget an authorization check, but
it can't bypass one built into the query.

## Rendering is declared per route when it matters

The question is: **does the output depend on who's looking?**

- Yes → `export const dynamic = "force-dynamic"`. Every dashboard route in wapi
  (`app/audit/page.tsx`, `app/sessions/[id]/layout.tsx`, `app/cli/page.tsx`, …) reads the session.
- No, and it **must stay static** → `export const dynamic = "force-static"`. Docs
  (`app/docs/[[...slug]]/page.tsx`) and `app/llms.txt/route.ts`: the syntax highlighter and the search
  index run once at build, and the pages are HTML on disk.
- No, and nothing in it reads request data → declare nothing; Next infers static. wapi's
  landing (`app/page.tsx`) is static this way.

Declare `force-static` when a page becoming dynamic would be a regression (cost, latency, a
build-time-only tool like Shiki). Otherwise let Next infer it.

## State belongs in the URL first

Before adding `useState`, ask whether the state should survive a link, a reload and the back
button. For filters, selection, tabs and pagination, the answer is almost always yes.

wapi's audit page (`apps/web/src/app/audit/page.tsx`) has a list, a detail sidebar, 7 filters and
pagination, and all of it lives in the query string (`?selected=123&ip=203.0.113&page=2`). The only client
component is the filter bar, because typing a value needs keystrokes. The detail panel stays a
server component, so JSON bodies keep the build-time highlighter. As client state they would
render as plain text. The full pattern (and the serialization trap it avoids) is in the
`nextjs-rsc-boundaries` skill.

## `src/proxy.ts`, not `middleware.ts` (Next 16)

`middleware` was renamed to `proxy` in Next 16 (the installed `proxy.md` file-convention doc says so in
its first note). With the old name, the build still prints "Proxy (Middleware)", so it looks
wired, but Clerk can't detect it and every `auth()` call throws:

```
auth() was called but Clerk can't detect usage of clerkMiddleware()
```

Clerk's message lists `proxy.(ts|js)` first. Put the file at `src/proxy.ts` (same level as
`app/`). Public-route patterns need `(.*)`: `"/docs"` doesn't cover `/docs/quickstart`.
wapi's annotated version is `apps/web/src/proxy.ts`.

## Docker: adding a workspace breaks the image

The deps stage runs `bun install --frozen-lockfile`, which **refuses to run if any workspace in
the lockfile has no manifest in the build context**. So adding a workspace breaks the image even
when nothing deploys it and nothing imports it. wapi's `apps/video` did exactly that, after
three earlier breaks from the same cause (`Dockerfile` header comment). Two rules:

1. **Every workspace manifest is copied into the `deps` stage.**
2. **Every workspace `apps/web` imports is copied whole into the `web-builder` stage.** CI
   never built the image, so `@wapi/cli/coverage` typechecked, built and passed CI, then failed
   in Dokploy with `Can't resolve '@wapi/cli/coverage'`.

`ops/check-docker-copies.mjs` checks both against the `Dockerfile` and fails CI, naming the
missing file and the stage. It's reproduced in `references/files.md`.

## Checklist: I added a workspace

- [ ] Its `package.json` is `COPY`'d in the `deps` stage of the `Dockerfile`.
- [ ] If any deployable imports it: its directory is `COPY`'d into that deployable's builder
      stage, and for Next apps it's listed in `transpilePackages`.
- [ ] If an app should see only part of it: a granular `"exports"` entry, not the barrel.
- [ ] Its internal imports work for every consumer (NodeNext `./x.js` → webpack
      `extensionAlias` in Next).
- [ ] `node ops/check-docker-copies.mjs` (or the project's equivalent guard) passes, and
      typecheck passes from a clean checkout.
