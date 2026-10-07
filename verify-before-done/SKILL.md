---
name: verify-before-done
description: Make "it works" and "it's fixed" true before saying them — check the test or measurement exercises the path production runs, measure data volume before time on slow pages, repeat measurements, prove a regression test fails without the fix, and report what was ruled out and what could not be reached. Use before declaring a bug fixed or a feature verified, when a fix "passed locally" but production still fails, when a page or query is slow, when writing a regression test, or when the user says "it still doesn't work", "it was working on my machine", "why is this slow", "are you sure it's fixed".
metadata:
  author: Jibaru
  version: 1.0.0
---

# verify-before-done

A green check means what it exercised works. When that isn't what production runs, the
green check is worse than no check, because it closes a bug that is still open. Every rule
below exists because a check passed and production was still broken. The source is one
debugging session on [whatsapp-bot-sst](https://github.com/Jibaru/whatsapp-bot-sst) (Next 16,
Drizzle, pgvector, Playwright, Docker on a VPS) that produced twelve commits and seven real
bugs, several of them introduced while fixing the previous one. Commits cited are in that repo.

This skill works alongside a debugging workflow such as `diagnosing-bugs` and `tdd` if they're
installed. Those build the feedback loop. This one checks the loop is aimed at the right
thing.

## 1. Check loop parity before trusting the loop

Before writing "reproduced", "fixed" or "verified", answer these in your report:

- **Same resolution?** Same modules, paths and binaries as production: symlink vs real path,
  `next dev` vs `output: "standalone"`, `require()` vs the bundler's traced path.
- **Same network and geography?** If the service runs on another continent from its
  dependency, measure with injected latency rather than from your machine.
- **Same data and credentials?** Check which environment your local `.env` points at **first**.
  If it's a stale or retired environment, every measurement is of a dead system.
- **Is the assertion the requirement, or a step before it?** "Navigated" isn't "the page is
  visible".

When you can't reach the real path, **say so in the report** instead of calling it verified.

### Case A: the smoke test resolved a different copy (commit `8209c17`)

Chromium was added to the Docker image. The smoke test did `require("playwright-core")` and
passed ("chromium starts 152.0.7977.82"). Production logged:

```
Cannot find module '/app/node_modules/.pnpm/playwright-core@1.63.0/
node_modules/playwright-core/browsers.json'
```

pnpm gives the package two paths: the symlink at `node_modules/playwright-core` and the real
copy under `.pnpm/`. The fix repaired the symlink, and `require()` goes through the symlink.
Next's standalone server asks for the real path, because output tracing resolved it at build
time. The test checked one copy and production loaded the other.

The fix completes **every** copy and guards both ways. A build-time assertion in the `Dockerfile`:

```dockerfile
for f in node_modules/playwright-core/browsers.json \
         node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json; do \
  if [ ! -f "$f" ]; then echo "FALTA $f — playwright-core quedó incompleto"; exit 1; fi; \
done
```

and a smoke test that ships **inside** the image (`scripts/checks/render-smoke.cjs`), finds every
copy with `find node_modules -name playwright-core -maxdepth 4 -type d`, and `require`s each
one by its path. **Checking that a file exists doesn't prove the package loads.** What failed
in production was a `require`, so the test performs a `require`.

### Case B: latency measured from the wrong place (commit `11af394`)

A page from Peru's IGP (its geophysics institute) wouldn't load in production. Locally, in
Lima, it took 0.35 s. The VPS is in France. With delay injected per request, and a fixed
1.2 s wait after `load`:

```
delay= 400ms   text=2226   ok
delay= 900ms   text=   0   page loads empty
delay=1500ms   text=   0   page loads empty
```

`load` fired just as fast. The content is put in by JavaScript **afterwards**, so the
screenshot was blank and the model correctly reported "I couldn't read the page". The fix waits
for content instead of a clock: it polls
`document.body?.innerText.trim().length` with a 15 s budget (`CONTENT_BUDGET_MS` in
`src/modules/browser/render.ts`). `domcontentloaded` was tried too and was worse, because the text
doesn't exist yet at that point. The code records that.

### Case C: the assertion was a step, not the requirement (commit `bd9270b`)

The panel's mobile check navigated from the menu drawer and passed: "navigating from the
drawer works". The bug was that the drawer **didn't close** and covered the new page.
Navigation worked fine. Nobody checked that anything was visible afterwards. The check in
`scripts/checks/panel.ts` now asserts the drawer is gone after navigating.

## 2. Slow page or query: measure bytes before milliseconds

Time tells you that something is slow. Volume tells you what's slow. Measure the payload at each
boundary (database → app, app → client) with `Buffer.byteLength(JSON.stringify(x))` and compare it
with what the UI actually renders. **A gap of two orders of magnitude is the cause, not a detail.**

The case (commit `2a1ca4a`): "the documents section is slow, maybe it's generating each URL or
downloading something". Reading the code ruled out both hypotheses in a minute: `storage().url()`
only concatenates strings, and the table makes no per-row requests. The cause was
`pageDocuments` doing `.select()` of every column. The `documents` row holds the full
extracted text, the segments as JSON (the document again, chunked) and a 1536-dimension
embedding that arrives as text and has to be parsed. Same 25 rows:

```
select() every column   : 2857 ms   2454 KB
only what the table shows:  423 ms     19 KB
```

That's 131× more data than needed to render 16 fields, and none of it ever left the server.

**Rule for list views: select only the columns the list renders.** That's
`.select(SUMMARY_COLUMNS)` plus a `DocumentSummary = Pick<Document, …16 fields>` type in
`src/modules/documents/repository.ts`, so the type also stops a wide row reaching the list.
Single-row reads (`findById`, `findByHash`) keep `.select()` **on purpose**, because they need
the whole document. The rule is about lists. It matters most for embedding and extracted-text
columns, which are invisible when you read a `select()` call.

## 3. Repeat the measurement, and report the cold one separately

The first call in a process pays for opening connections, JIT and cold caches. Measure four times
and report the stable figure. Report the first one separately so nobody chases it. Same
investigation: `1434, 411, 401, 411 ms`. The first ~1 s was the pool opening its second
connection, which only shows against a remote database. **That wasn't the bug**, and saying so
matters as much as naming the bug, because it's the next thing someone would "fix".

## 4. Report what it wasn't

Hypotheses ruled out by measurement go in the report and the commit message: "not the URL
generation (string concatenation), not per-row fetches (there are none)". That saves the
next person from repeating the attempt.

## 5. A regression test must fail without the fix

Every regression test gets checked both ways: **revert the fix, watch the test go red,
restore it.** If it doesn't go red, the test covers something that already worked, not the
bug. This applies even to a one-line fix, and especially then.

```
with the fix:    OK    and after navigating the drawer closes
without the fix: FAIL  and after navigating the drawer closes
```

Write it into the commit message ("verified both ways", as `bd9270b` does).

## 6. Write realistic negative cases first

When you write a heuristic, write the strings it **must not** match before the ones it must.
The task (commit `04f718a`) was to tell a human-written title from a download identifier. The first
heuristic was "five digits in a row", and its own test killed it immediately: **"Ley 29783" is
five digits and a perfectly good title.** What gives an identifier away is position:

```ts
export function looksGenerated(title: string): boolean {
  return /^\d{6,}/.test(title.trim());
}
```

(`src/modules/documents/ingest.ts`). The positive cases were real filenames from the client's
library: `8649148 ds n 014 2026 tr exp mot`, `6359927 …`, `3572362 …`, `8010935 …`.

## 7. Headless screenshots: check accented text renders

Without a font package, headless Chromium draws a box for each accented character, and the screenshot
"looks fine" until someone reads it. `render-smoke.cjs` measures the width of `"áéíóúñ"` against
`"aeioun"` at the same size and fails if the ratio exceeds **1.15**. With a missing font the
widths diverge. Any check whose output is an image needs a numeric assertion like this one. A
screenshot nobody measures verifies nothing.

## 8. Tool and job failures go to the server log too

The first time the browser failed in production, the reason existed only inside the
WhatsApp chat ("the page didn't load"). The server logs had nothing, and a whole round went to
guessing. After adding
`console.error("[navegador] no se pudo leer la página", { enlace, motivo })`
(`src/modules/agent/tools/page.ts`), the next failure gave the exact `MODULE_NOT_FOUND` within a
minute. Every error returned to a user or a model is also logged on the server. They're
two audiences, and the log is the one you debug from.

## Done means

- [ ] The report states which environment you tested against, and that it's the one that failed.
- [ ] The check exercises the production path (same resolution, network conditions, data), or the
      report says which part couldn't be reached.
- [ ] The assertion is the user-visible requirement, not a step before it.
- [ ] For performance: bytes per boundary measured, the stable figure from repeated runs, the cold
      start reported separately.
- [ ] The regression test was seen to fail with the fix reverted.
- [ ] Ruled-out hypotheses are written down.
