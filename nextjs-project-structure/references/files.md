# nextjs-project-structure: complete files

Verbatim from wapi (Next 16.3, Bun workspaces). Paths are relative to the repo root.

## Root package.json (workspaces)

From `package.json`:

```json
{
  "name": "wapi",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*",
    "compat",
    "sdk/*"
  ],
  "scripts": {
    "typecheck": "node ops/typecheck.mjs",
    "test": "bun test",
    "contracts:generate": "bun run packages/contracts/src/generate.ts"
  },
  "devDependencies": {
    "@types/bun": "^1.4.0",
    "tsx": "^4.23.12",
    "typescript": "^7.0.2"
  },
  "engines": {
    "bun": ">=1.2.0"
  },
  "dependencies": {
    "@uploadx-sdk/core": "^0.3.1"
  }
}
```

## apps/web/next.config.ts

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

## apps/cli/package.json (granular export)

From `apps/cli/package.json`:

```json
{
  "name": "@wapi/cli",
  "version": "0.3.1",
  "private": true,
  "type": "module",
  "bin": {
    "wapi": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "wapi": "bun src/index.ts",
    "build": "bun build src/index.ts --compile --outfile dist/wapi"
  },
  "dependencies": {
    "@wapi/sdk": "workspace:*",
    "commander": "^15.0.0",
    "@wapi/contracts": "workspace:*"
  },
  "exports": {
    "./coverage": "./src/coverage.ts"
  }
}
```

## Dockerfile: deps stage

From `Dockerfile`, lines 1-35:

```dockerfile
# syntax=docker/dockerfile:1
#
# One Dockerfile, one dependency stage, five targets.
#
# This replaces four per-app Dockerfiles that each maintained their own list of workspace
# manifests. `bun install --frozen-lockfile` validates the lockfile against the WHOLE
# workspace, so any image whose deps stage is missing a package.json reads as drift and the
# install refuses. That broke the deploy three separate times — once when packages/db and
# packages/baileys-auth arrived, once for packages/core, and once for apps/web, where the
# *gateway* image failed because of a manifest it does not even use.
#
# With a single shared `deps` stage there is exactly one list to keep current, and a missing
# manifest fails every target at once rather than one at random.

# ---------------------------------------------------------------------------------------
FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
# Manifests only, so dependency installation caches independently of source changes.
COPY package.json bun.lock ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/baileys-auth/package.json packages/baileys-auth/
COPY apps/api/package.json apps/api/
COPY apps/gateway/package.json apps/gateway/
COPY apps/webhook-worker/package.json apps/webhook-worker/
COPY apps/web/package.json apps/web/
# The CLI is not deployed, but a frozen install needs every workspace manifest present — and
# the web build imports one file from it, so `web-builder` copies the source too.
COPY apps/cli/package.json apps/cli/
# Same reason: `apps/video` ships nothing, but `--frozen-lockfile` fails if its manifest is absent.
COPY apps/video/package.json apps/video/
COPY compat/package.json compat/
COPY sdk/typescript/package.json sdk/typescript/
RUN bun install --frozen-lockfile
```

## Dockerfile: web-builder and web runtime

From `Dockerfile`, lines 89-124:

```dockerfile
# ---------------------------------------------------------------------------------------
# web — Next.js dashboard.
FROM node:22-alpine AS web-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
# The docs render the CLI's coverage table, so the web build imports `@wapi/cli/coverage` — one
# file that declares which command covers which operation. Generating that page is the whole
# reason it cannot drift, so the source has to be here. Builder stage only: nothing from apps/cli
# reaches the runtime image, which copies just `.next/standalone`.
COPY apps/cli ./apps/cli
# Next inlines NEXT_PUBLIC_* at build time, so Clerk's publishable key must be present here.
# It is publishable by definition; the secret key is injected at runtime only.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
# Cap the heap so an over-large build fails loudly rather than thrashing swap.
ENV NODE_OPTIONS=--max-old-space-size=3072
WORKDIR /app/apps/web
# webpack, not Turbopack: the shared packages use NodeNext `./thing.js` specifiers pointing at
# .ts sources, required by the Node consumers, and Turbopack cannot map those back.
RUN node ../../node_modules/next/dist/bin/next build --webpack

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

The runtime stage copies `.next/standalone`, `.next/static` and `public/` (standalone output omits `public/`; see the `nextjs-static-files` skill).

## ops/check-docker-copies.mjs

From `ops/check-docker-copies.mjs`:

```mjs
/**
 * Does the web image's build stage copy everything the web build imports?
 *
 * This exists because CI never builds the Docker image, so a whole class of failure reaches the
 * deploy untested. Adding `@wapi/cli/coverage` to a docs component typechecked, built, passed
 * every guard and passed CI — then failed in Dokploy with `Can't resolve '@wapi/cli/coverage'`,
 * because `web-builder` copies `packages` and `apps/web` and nothing else. The dependency was
 * real and the image simply did not contain it.
 *
 * The check is deliberately narrow: it compares the `@wapi/*` packages imported anywhere under
 * `apps/web/src` against the paths the `web-builder` stage copies. It cannot tell you the image
 * builds — only that this specific, silent, deploy-time-only failure is not present.
 *
 * Run with bun or node; it reads files and parses nothing exotic.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failed = false;
const fail = (headline, lines = []) => {
  failed = true;
  console.error(`  FAIL  ${headline}`);
  for (const line of lines) console.error(`          ${line}`);
};

/** Every `@wapi/x` package imported under a directory. */
const importsUnder = (dir) => {
  const found = new Set();
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const path = join(d, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (/\.tsx?$/.test(entry)) {
        const text = readFileSync(path, "utf8");
        for (const m of text.matchAll(/from "(@wapi\/[^"/]+)/g)) found.add(m[1]);
      }
    }
  };
  walk(dir);
  return found;
};

/** Where each `@wapi/*` workspace lives, by reading the manifests the root declares. */
const workspaceDirs = () => {
  const root = JSON.parse(readFileSync("package.json", "utf8"));
  const dirs = new Map();
  for (const pattern of root.workspaces ?? []) {
    const base = pattern.replace(/\/\*$/, "");
    const candidates = pattern.endsWith("/*")
      ? readdirSync(base).map((n) => join(base, n))
      : [pattern];
    for (const dir of candidates) {
      const manifest = join(dir, "package.json");
      if (!existsSync(manifest)) continue;
      const name = JSON.parse(readFileSync(manifest, "utf8")).name;
      if (typeof name === "string") dirs.set(name, dir.replaceAll("\\", "/"));
    }
  }
  return dirs;
};

/** The paths a named Dockerfile stage copies in from the build context. */
const copiedBy = (stage) => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const after = dockerfile.split(`AS ${stage}`)[1];
  if (after === undefined) {
    fail(`Dockerfile has no stage named ${stage} — this guard is looking at the wrong thing.`);
    return [];
  }
  const body = after.split("\nFROM ")[0];
  return [...body.matchAll(/^COPY (?:--from=\S+ )?(\S+)/gm)]
    .map((m) => m[1])
    .filter((p) => !p.startsWith("/app"));
};

/**
 * Every workspace manifest reaches the `deps` stage.
 *
 * Separate from the import check below, and a different failure: `bun install --frozen-lockfile`
 * refuses to run when a workspace named in the lockfile has no manifest in the build context, so
 * *adding a workspace at all* breaks the image — even one that ships nothing and nothing imports.
 * `apps/video` did exactly that, and the import check could not have seen it.
 */
const dirs = workspaceDirs();
const dockerfile = readFileSync("Dockerfile", "utf8");
const depsStage = dockerfile.split("AS deps")[1]?.split("\nFROM ")[0] ?? "";
const manifests = new Set(
  [...depsStage.matchAll(/^COPY (\S+\/package\.json)/gm)].map((m) => m[1]),
);

const uncopied = [...dirs.values()]
  .map((dir) => `${dir}/package.json`)
  .filter((m) => !manifests.has(m) && existsSync(m));

if (uncopied.length) {
  fail(`${uncopied.length} workspace manifest(s) the deps stage does not copy:`, [
    ...uncopied,
    "",
    "`bun install --frozen-lockfile` fails without them, even for a workspace nothing deploys.",
    "Add each to the `deps` stage in Dockerfile.",
  ]);
} else {
  console.log(`  ok    every workspace manifest reaches the deps stage`);
}

const copied = copiedBy("web-builder");
const missing = [];

for (const name of [...importsUnder("apps/web/src")].sort()) {
  const dir = dirs.get(name);
  if (!dir) {
    missing.push(`${name} — imported but no workspace declares that name`);
    continue;
  }
  const present = copied.some((c) => dir === c || dir.startsWith(`${c.replace(/\/$/, "")}/`));
  if (!present) missing.push(`${name} (${dir}) — imported by apps/web but not copied`);
}

if (missing.length) {
  fail(`${missing.length} workspace import(s) the web image would not contain:`, [
    ...missing,
    "",
    "web-builder copies: " + copied.join(" "),
    "Add the missing directory to the web-builder stage in Dockerfile.",
  ]);
} else {
  console.log(`  ok    every workspace apps/web imports is copied into web-builder`);
}

console.log(failed ? "\ndocker copy check failed" : "\nok — the web image contains what it imports");
process.exit(failed ? 1 : 0);
```

It reads the root `workspaces`, every manifest's `name`, the `deps` stage's manifest COPY lines, and the `web-builder` stage's COPY paths. Adapt the stage names and the `@wapi/` scope to the project.
