---
name: nextjs-rsc-boundaries
description: Fix and prevent failures at the server/client component boundary in the Next.js 16 App Router — what props can cross, why a page compiles and still crashes on load, how to make the type system reject the bug, URL state instead of client state, and the test that has to actually run. Use when you see "Functions cannot be passed directly to Client Components", when the user says "my page compiles but crashes on load", "where do I put useState", "use client", "how do I pass data to a client component", or before adding interactivity to a server-rendered page.
metadata:
  author: Jibaru
  version: 1.0.0
---

# nextjs-rsc-boundaries

Server components render on the server, and client components hydrate in the browser. Every prop going
from one to the other is **serialized**. Most boundary bugs come from that one fact, and the worst
part is that they show up at render time, after `tsc` and `next build` have both passed. Everything
here comes from [wapi](https://github.com/crafter-station/wapi) (`apps/web`). The paths cited are in
that repo.

**Versions: Next 16, React 19.2.** `params` and `searchParams` are Promises in Next 16 (on
Next 14 they're plain objects). Read the installed docs: from the app directory,
`node -p "require.resolve('next/package.json')"`, then `dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
In a hoisted monorepo that resolves to the root `node_modules`.

## The failure that actually happens

The page loads blank. The server log shows:

```
⨯ Error: Functions cannot be passed directly to Client Components unless you explicitly expose it
by marking it with "use server". Or maybe you meant to call this function rather than return it.
  {key: "ua", label: ..., placeholder: ..., short: function short}
                                                 ^^^^^^^^^^^^^^
```

The cause was in `apps/web/src/components/audit-filters.tsx`, a `"use client"` component whose
props are built by the server page `apps/web/src/app/audit/page.tsx`. One field was a function:

```ts
// BEFORE: compiles, typechecks, crashes on render
export type FilterField = {
  key: string;
  label: string;
  placeholder: string;
  /** Renders the chosen value shorter than it is stored, for keys like a long route pattern. */
  short?: (value: string) => string;
};
```

**It compiled because the type allowed it.** `tsc` passed, and `next build` compiled cleanly.
A serialization failure only happens when the component **renders**. So the fix belongs in
the type, not at the call site. Replace behaviour with data the client can interpret:

```ts
// AFTER: data, not closures (apps/web/src/components/audit-filters.tsx)
export type FilterField = {
  /** The query-string key this badge owns. */
  key: string;
  label: string;
  placeholder: string;
  /** Offered in a datalist — typed values are still allowed, so a new IP is not locked out. */
  suggestions?: string[];
  /**
   * A friendlier badge label for a stored value — a session id shown as its name.
   *
   * Data, not a function, and that is not a style choice: this component is a client component and
   * its props are built on the server, so a callback here crashes the page with "Functions cannot
   * be passed directly to Client Components". A lookup serialises; a closure does not.
   */
  labels?: Record<string, string>;
  /** Long values are clipped in the badge. `keep` is the end worth reading. */
  clip?: { keep: "start" | "end"; max: number };
};

/** What a badge shows for a chosen value: a friendly label if there is one, else clipped. */
function display(field: FilterField, value: string): string {
  const label = field.labels?.[value];
  if (label) return label;
  const max = field.clip?.max;
  if (!max || value.length <= max) return value;
  // A route is identified by its tail and a user agent by its head, so which end is kept matters.
  return field.clip?.keep === "start" ? `${value.slice(0, max - 1)}…` : `…${value.slice(-(max - 1))}`;
}
```

The closure is gone, and the same behaviour is described as data (`labels`, `clip`) and run in the client.

### Close the loop: reintroduce the bug and watch the compiler reject it

Put the broken shape back at the call site and run the typecheck:

```
apps/web/src/app/audit/page.tsx(92,57): error TS2353: Object literal may only specify known
properties, and 'short' does not exist in type 'FilterField'.
```

What used to be a runtime crash is now a compile error. Do this loop for every boundary fix: **fix the
type → reintroduce the bug → confirm the compiler refuses it → remove it.** A rule like "don't
pass functions" doesn't stop the next variant. A prop type made only of serializable data does.

## What crosses the boundary

Server → client props must be serializable by React (Next docs, `05-server-and-client-components.md`,
"Good to know", which links React's list):

| Crosses | Does not cross |
| --- | --- |
| string, number, bigint, boolean, `null`, `undefined` | functions (except Server Functions marked `"use server"`) |
| plain objects and arrays of the above | class instances, objects with methods or a null prototype |
| `Date`, `Map`, `Set`, typed arrays, `ArrayBuffer` | `Symbol()` (only `Symbol.for(...)` registered symbols cross) |
| Promises (unwrap with `use()` in the client) | closures over server state: DB clients, request objects |
| already-rendered JSX passed as a prop (`children`, slots) | |

Rule of thumb: if it carries **behaviour**, it doesn't cross. Pass the data, and have the client
component own the behaviour.

## The pattern that removes most boundaries: state in the URL

Before writing `"use client"` + `useState`, ask whether the state should survive a link, a reload
and the back button. For filters, selection, tabs and pagination, it should.

wapi's audit page has a list, a detail sidebar, 7 filters and pagination, and **all of it is query
string** (`?selected=123&ip=203.0.113&page=2`). The page reads it on the server
(`apps/web/src/app/audit/page.tsx`):

```ts
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const selectedId = sp.selected ? Number(sp.selected) : undefined;
  // … filters from sp, then data fetched in parallel, all on the server
```

There is **one** client component on the page: the filter bar, because typing a value takes keystrokes.
What that buys:

- The **detail panel stays a server component**, so JSON bodies go through the syntax highlighter,
  which runs on the server and doesn't exist in the browser. As client state they'd render as plain
  text. `apps/web/src/components/audit-row.tsx` records that constraint in its header comment.
  It's why the first version linked to a separate page instead of expanding in place. The sidebar
  respects it: it isn't `useState`, it's `?selected=<id>`.
- Linkable, reloadable, and the back button steps through selections. The row is still an `<a>`, so a
  middle click opens it in a new tab.

**Navigate without losing your place:**

```tsx
<Link href={rowHref(r.id)} scroll={false}>   {/* without scroll={false}, every click jumps to the top */}
```

**Changing a filter drops `page` and `selected` on purpose** (`audit-filters.tsx`, `apply`): page 4
of the old filter is rarely page 4 of the new one, and a selected row may not exist in the new
result. Leaving either behind gives an empty list or a panel showing a row you can't see.

```ts
const apply = (key: string, value: string | null) => {
  const next = new URLSearchParams(params.toString());
  if (value) next.set(key, value);
  else next.delete(key);
  next.delete("page");
  next.delete("selected");
  setOpen(null);
  const q = next.toString();
  router.push(`/audit${q ? `?${q}` : ""}`);
};
```

## Related failures, by symptom

- **A secret shows up in the client bundle**: the data module wasn't fenced. Start it with
  `import "server-only";` (wapi: `apps/web/src/lib/data.ts`). Importing it from a client component
  then fails the **build** instead of leaking at runtime.
- **A client component behaves strangely or never renders its data**: it's `async`.
  Client components can't be async. Fetch in a server parent and pass the data down, or pass a
  Promise and unwrap it with `use()`.
- **`params.id` is undefined, or there's a warning about accessing params synchronously**: in Next 16
  they're Promises. Use `const { id } = await params;` (`dist/docs/.../file-conventions/page.md`).
- **A value is `undefined` in the browser but set on the server**: env vars reach the client only
  with the `NEXT_PUBLIC_` prefix, inlined at **build** time, and **public**. Never put a credential there.
- **An inner button doesn't respond to clicks**: a `<button>` inside a `<button>` is invalid HTML,
  and some browsers stop delivering clicks to the inner one. wapi's filter badge uses
  `<span role="button" aria-label="Clear … filter">` with `e.stopPropagation()` for its clear "×"
  (`audit-filters.tsx`).

## The verification gap, stated plainly

**Typecheck and `next build` do not catch serialization failures. Only rendering does.**

wapi had a browser test that would have caught this crash on the first frame. It didn't run.
Clerk setup was failing locally, and in CI the browser job skips itself when the
`CLERK_SECRET_KEY` secret is missing (`.github/workflows/ci.yml`, the `clerk` step:
`::notice::Skipping browser tests — no CLERK_SECRET_KEY secret.`). The user found the bug.

That leads to two rules:

1. **Any change to a page or to props crossing the boundary needs a test that loads the page**
   and fails on console errors, not only one that typechecks.
2. **A test that never runs is worth nothing.** Check that it actually executed: look for
   the job's skip notice in the CI log, count the tests reported, and run it locally. A green
   check with the browser job skipped proves nothing.

## Done means

- [ ] Every prop type on a `"use client"` component contains only serializable data. No function
      fields unless they're Server Functions.
- [ ] For a boundary fix: you reintroduced the old shape and saw the compiler reject it.
- [ ] State that should be linkable is in the URL. `useState` holds only ephemeral UI state
      (an open popover, a draft input).
- [ ] The page was **loaded** in a browser test or by hand with the server log visible, with
      no `⨯ Error` and no console errors.
- [ ] The browser test job actually ran in CI and wasn't skipped.
