# nextjs-rsc-boundaries: complete files

Verbatim from wapi (Next 16.3, React 19.2). The audit page is the reference for URL state with a single client component; the filter bar is that component.

## The one client component: apps/web/src/components/audit-filters.tsx

From `apps/web/src/components/audit-filters.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

/**
 * The filter bar.
 *
 * Each badge owns one query-string key, and clicking it opens a small popover to type or pick a
 * value. A badge rather than a row of always-open inputs because the bar carries seven filters and
 * six of them are usually empty: seven empty text boxes is a form, and nobody reads a form to look
 * at a log.
 *
 * **Filters live in the URL, and that is the whole point.** The panel, the pager and the list all
 * read the same query string, so a narrowed view can be linked, reloaded, and gone back from — and
 * "the 429s from this address yesterday" is a thing you can send to somebody rather than a thing
 * you describe to them.
 *
 * This is the one client component in the page. The list and the detail panel stay on the server so
 * bodies keep going through the build-time highlighter; only choosing a filter needs a keystroke.
 */
export function AuditFilters({
  fields,
  toggles,
}: {
  fields: FilterField[];
  /** Filters with no value to enter — "errors only" is on or off. */
  toggles: { active: boolean; key: string; label: string; value: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);

  /**
   * Navigate with one key changed.
   *
   * `page` and `selected` are always dropped: page 4 of the old filter is rarely page 4 of the new
   * one, and a row selected under the previous filter may not be in the new result at all — leaving
   * either behind produces an empty list or a panel showing a row you can no longer see.
   */
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

  return (
    <div className="mt-8 flex flex-wrap items-center gap-2">
      {toggles.map((t) => (
        <button
          className={badgeClass(t.active)}
          key={t.key + t.value}
          onClick={() => apply(t.key, t.active ? null : t.value)}
          type="button"
        >
          {t.label}
        </button>
      ))}

      {fields.map((f) => {
        const value = params.get(f.key);
        return (
          <div className="relative" key={f.key}>
            <button className={badgeClass(Boolean(value))} onClick={() => setOpen(open === f.key ? null : f.key)} type="button">
              {value ? (
                <>
                  <span className="text-[var(--muted-foreground)]">{f.label}</span>{" "}
                  <span className="font-[560]">{display(f, value)}</span>
                </>
              ) : (
                f.label
              )}
              {value ? (
                /*
                 * A span, not a nested button — a button inside a button is invalid HTML and the
                 * inner one stops receiving clicks in some browsers. `stopPropagation` keeps the
                 * clear from also opening the popover behind it.
                 */
                <span
                  aria-label={`Clear ${f.label} filter`}
                  className="ml-2 inline-block text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    apply(f.key, null);
                  }}
                  role="button"
                  tabIndex={-1}
                >
                  ×
                </span>
              ) : null}
            </button>

            {open === f.key ? (
              <ValuePopover
                field={f}
                initial={value ?? ""}
                onCancel={() => setOpen(null)}
                onSubmit={(v) => apply(f.key, v.trim() || null)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const badgeClass = (on: boolean) =>
  "rounded-[var(--radius)] border px-3 py-1.5 text-[0.8rem] transition-colors " +
  (on
    ? "border-[var(--foreground)] text-[var(--foreground)]"
    : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]");

/** The little panel a badge opens. One input, its suggestions, and the two ways out. */
function ValuePopover({
  field,
  initial,
  onCancel,
  onSubmit,
}: {
  field: FilterField;
  initial: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const listId = `audit-filter-${field.key}`;

  /**
   * Escape closes it, and so does a click anywhere else.
   *
   * Without the outside click the only way out is the badge that opened it, which is a trap the
   * moment somebody opens a second badge and expects the first to close.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener("keydown", onKey);
    // Deferred: the click that opened this popover is still propagating, and would close it.
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      clearTimeout(t);
    };
  }, [onCancel]);

  return (
    <div
      className="absolute z-20 mt-2 w-[280px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[0_18px_40px_rgba(10,10,10,0.14)]"
      ref={ref}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <label className="block text-[0.75rem] text-[var(--muted-foreground)]" htmlFor={listId}>
          {field.label}
        </label>
        <input
          // Autofocus is right here: the popover exists only to take one value.
          autoFocus
          className="mt-1.5 w-full rounded-[calc(var(--radius)-4px)] border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-[0.85rem] outline-none focus:border-[var(--ring)]"
          id={listId}
          list={field.suggestions?.length ? `${listId}-options` : undefined}
          onChange={(e) => setValue(e.target.value)}
          placeholder={field.placeholder}
          value={value}
        />
        {field.suggestions?.length ? (
          <datalist id={`${listId}-options`}>
            {field.suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}

        <div className="mt-2.5 flex items-center gap-2">
          <button className="btn btn-primary px-3 py-1 text-[0.8rem]" type="submit">
            Apply
          </button>
          <button
            className="text-[0.8rem] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
```

## The server page that builds its props: apps/web/src/app/audit/page.tsx

From `apps/web/src/app/audit/page.tsx`:

```tsx
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { AuditDetail } from "@/components/audit-detail";
import { AuditFilters, type FilterField } from "@/components/audit-filters";
import { AuditRow } from "@/components/audit-row";
import { Empty, Pager } from "@/components/pager";
import { type AuditFilter, auditFilterOptions, getAuditLog, listAuditLogs, listSessions } from "@/lib/data";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type Params = {
  code?: string;
  credential?: string;
  ip?: string;
  method?: string;
  page?: string;
  route?: string;
  selected?: string;
  session?: string;
  status?: string;
  ua?: string;
};

/**
 * The audit trail.
 *
 * A list and a detail sidebar, both rendered on the server, with every filter and the selection in
 * the query string. That last part is what makes the whole page work: the sidebar is not client
 * state, it is `?selected=<id>` — so the panel keeps the build-time highlighter for bodies, a
 * narrowed view can be linked and reloaded, and the browser's back button steps through selections
 * the way it should.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const selectedId = sp.selected ? Number(sp.selected) : undefined;

  const filter: AuditFilter = {
    ...(sp.session ? { sessionId: Number(sp.session) } : {}),
    ...(sp.status === "errors" ? { status: "errors" as const } : {}),
    ...(sp.code && Number(sp.code) ? { code: Number(sp.code) } : {}),
    ...(sp.method ? { method: sp.method } : {}),
    ...(sp.route ? { route: sp.route } : {}),
    ...(sp.ip ? { ip: sp.ip } : {}),
    ...(sp.credential ? { credential: sp.credential } : {}),
    ...(sp.ua ? { userAgent: sp.ua } : {}),
  };

  const [{ rows, total }, sessions, options, selected] = await Promise.all([
    listAuditLogs(page, PER_PAGE, filter),
    listSessions(),
    auditFilterOptions(),
    // Fetched by id rather than found in `rows`: a permalinked selection may sit on another page,
    // and it is account-scoped either way, so a stray id cannot reach somebody else's row.
    selectedId ? getAuditLog(selectedId) : Promise.resolve(null),
  ]);

  /** A row's href: the current query string with `selected` swapped, so filters survive a click. */
  const rowHref = (id: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "selected") q.set(k, String(v));
    q.set("selected", String(id));
    return `/audit?${q.toString()}`;
  };

  const closeHref = () => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "selected") q.set(k, String(v));
    const s = q.toString();
    return `/audit${s ? `?${s}` : ""}`;
  };

  const fields: FilterField[] = [
    {
      key: "route",
      label: "Endpoint",
      placeholder: "/api/send-message",
      // The tail identifies a route, so that is the end the badge keeps.
      clip: { keep: "end" as const, max: 26 },
      suggestions: options.routes,
    },
    { key: "ip", label: "IP", placeholder: "203.0.113 matches the subnet", suggestions: options.ips },
    { key: "method", label: "Method", placeholder: "POST", suggestions: options.methods },
    {
      key: "credential",
      label: "Credential",
      placeholder: "session, pat or none",
      suggestions: ["session", "pat", "none"],
    },
    { key: "code", label: "Status", placeholder: "429" },
    {
      key: "ua",
      label: "User agent",
      placeholder: "curl, node, wapi-cli…",
      // A user agent is identified by its head — "wapi-cli/0.3.1" before anything else.
      clip: { keep: "start" as const, max: 18 },
    },
    {
      key: "session",
      label: "Session",
      placeholder: sessions[0] ? `${sessions[0].id}` : "session id",
      // Names are ambiguous — two sessions may share one — so the value is the id, shown by name.
      labels: Object.fromEntries(sessions.map((x) => [String(x.id), x.name])),
      suggestions: sessions.map((x) => String(x.id)),
    },
  ];

  return (
    <>
      <AppNav active="audit" />
      <main className="shell py-12">
        <header>
          <p className="kicker">Audit</p>
          <h1 className="title mt-3">
            Every call, <em>and what we answered.</em>
          </h1>
          <p className="lede mt-5 max-w-[640px]">
            One row per API request: which credential acted, from where, what came in, what went
            out, and how long it took. Credentials are never stored — only which kind was used.
          </p>
        </header>

        <AuditFilters
          fields={fields}
          toggles={[{ active: sp.status === "errors", key: "status", label: "Errors only", value: "errors" }]}
        />

        {total === 0 ? (
          <Empty
            hint="Every call to the API is logged here. If you have filters on, try clearing them — otherwise the trail simply starts at the first request after this shipped."
            title="Nothing matches"
          />
        ) : (
          <div
            className={
              "mt-6 " +
              // The list narrows rather than the panel overlaying it, so the row you picked stays
              // visible beside what it opened.
              (selected ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]" : "")
            }
          >
            <div>
              <div className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--border)]">
                {rows.map((r) => (
                  <AuditRow href={rowHref(r.id)} key={r.id} row={r} selected={r.id === selectedId} />
                ))}
              </div>
              <Pager basePath="/audit" page={page} perPage={PER_PAGE} total={total} />
            </div>

            {selected ? (
              <aside
                /*
                 * Sticky, so the panel stays put while the list scrolls under it — the list is 50
                 * rows and the panel is the thing being read. Its own scroll is capped to the
                 * viewport because a response body can be long.
                 */
                className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="code text-[0.8rem] text-[var(--muted-foreground)]">
                    entry #{selected.id}
                  </p>
                  <div className="flex items-center gap-3 text-[0.8rem]">
                    <Link
                      className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      href={`/audit/${selected.id}`}
                      // The permalink, for sending to somebody. The panel is for reading here.
                      title="Open this entry on its own page"
                    >
                      Permalink
                    </Link>
                    <Link
                      aria-label="Close the detail panel"
                      className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      href={closeHref()}
                      scroll={false}
                    >
                      ×
                    </Link>
                  </div>
                </div>
                <h2 className="code mt-2 text-[0.95rem] break-all">
                  {selected.method} {selected.route ?? selected.path}
                </h2>
                <div className="mt-4">
                  <AuditDetail compact row={selected} />
                </div>
              </aside>
            ) : null}
          </div>
        )}

        {total > 0 ? (
          <p className="mt-6 text-[0.8rem] leading-[1.7] text-[var(--muted-foreground)]">
            Bodies are dropped after 7 days and rows after 90. Request and response bodies carry
            message text and recipient numbers, so a deployment that would rather not keep them can
            set <code className="code">AUDIT_BODIES=off</code> and retain the metadata trail only.
          </p>
        ) : null}
      </main>
    </>
  );
}
```

## Why selection is a link: apps/web/src/components/audit-row.tsx

From `apps/web/src/components/audit-row.tsx`:

```tsx
import Link from "next/link";
import type { AuditLog } from "@wapi/db";

/**
 * One line in the audit list.
 *
 * A link, still — but now to `?selected=<id>` on the list itself rather than to a separate page.
 * The reason the first version linked out at all was that expanding in place needed client state,
 * which would have forced bodies to render as plain text: the highlighter runs at build time on the
 * server, so a client-rendered panel cannot use it.
 *
 * Selecting through the query string keeps both. The panel is still a server component with full
 * highlighting, the row is still a plain link that middle-clicks and opens in a new tab, and the
 * filters stay in the URL beside it. `/audit/<id>` remains as a permalink for sending to somebody.
 */
const tone = (status: number) => (status >= 400 ? "var(--destructive)" : "var(--muted-foreground)");

export function AuditRow({
  href,
  row,
  selected,
}: {
  href: string;
  row: AuditLog;
  selected: boolean;
}) {
  return (
    <Link
      className={
        "flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[0.875rem] transition-colors " +
        (selected ? "bg-[var(--muted)]" : "bg-[var(--card)] hover:bg-[var(--muted)]")
      }
      href={href}
      // Scrolling to the top on every row click would throw away the reader's place in the list.
      scroll={false}
    >
      {/*
        A left rule on the selected row rather than a background alone: the hover state is the same
        wash, so without it the row under the cursor and the row being shown look identical.
      */}
      <span
        aria-hidden
        className="-ml-4 mr-0 h-5 w-[2px] shrink-0"
        style={{ background: selected ? "var(--foreground)" : "transparent" }}
      />
      <span className="code w-[52px] shrink-0 font-[560]">{row.method}</span>
      {/* The pattern, not the concrete path: a hundred group ids read as one endpoint. */}
      <span className="code min-w-[180px] flex-1 truncate">{row.route ?? row.path}</span>
      <span className="code w-[40px] shrink-0" style={{ color: tone(row.status) }}>
        {row.status}
      </span>
      <span className="w-[60px] shrink-0 text-right text-[var(--muted-foreground)]">
        {row.durationMs != null ? `${row.durationMs}ms` : ""}
      </span>
      {/* Which credential acted — the audit question. The token itself is never stored. */}
      <span className="w-[62px] shrink-0 text-[var(--muted-foreground)]">
        {row.credentialKind ?? "none"}
      </span>
      {/*
        The address, which is the column this list was missing. Hidden below `lg` rather than
        wrapped: on a narrow screen it pushes the time onto a second line and turns a scannable
        list into a stack of paragraphs. It is always in the panel.
      */}
      <span className="code hidden w-[120px] shrink-0 truncate text-[var(--muted-foreground)] lg:inline">
        {row.ip ?? "—"}
      </span>
      <span className="code shrink-0 text-[0.8rem] text-[var(--muted-foreground)]">
        {row.createdAt.toISOString().slice(11, 19)}
      </span>
    </Link>
  );
}
```

## The CI gate that skipped the browser tests: .github/workflows/ci.yml

From `.github/workflows/ci.yml`, lines 292-341:

```yaml
      - name: Install
        run: bun install --frozen-lockfile

      - name: Are Clerk credentials available?
        id: clerk
        # Secrets cannot be read in a job-level `if`, so the gate is a step output. A fork's pull
        # request has no secrets and skips rather than fails.
        env:
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
        run: |
          if [ -n "$CLERK_SECRET_KEY" ]; then
            echo "available=true" >> "$GITHUB_OUTPUT"
          else
            echo "available=false" >> "$GITHUB_OUTPUT"
            echo "::notice::Skipping browser tests — no CLERK_SECRET_KEY secret. See apps/web/e2e/README.md."
          fi

      - name: Migrate
        if: steps.clerk.outputs.available == 'true'
        run: bun run --cwd packages/db migrate

      - name: Boot the stack
        if: steps.clerk.outputs.available == 'true'
        run: |
          PORT=3102 bun run --cwd apps/gateway start > /tmp/gateway.log 2>&1 &
          PORT=3101 bun apps/api/src/index.ts > /tmp/api.log 2>&1 &
          bun apps/webhook-worker/src/index.ts > /tmp/worker.log 2>&1 &

      - name: Wait for the stack
        if: steps.clerk.outputs.available == 'true'
        run: |
          up() { curl -fsS "http://127.0.0.1:$1/health" > /dev/null; }
          for i in $(seq 1 60); do
            if up 3101 && up 3102; then echo "up after ${i}s"; exit 0; fi
            sleep 1
          done
          echo "::error::stack did not come up"
          cat /tmp/gateway.log /tmp/api.log /tmp/worker.log; exit 1

      - name: Install Chromium
        if: steps.clerk.outputs.available == 'true'
        run: bunx playwright install --with-deps chromium

      - name: Browser tests
        if: steps.clerk.outputs.available == 'true'
        env:
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY }}
        run: bun run --cwd apps/web e2e
```

A step output gates the job because secrets can't be read in a job-level `if`. It's correct for forks, which have no secrets. The cost is that a green run can contain zero browser tests. Look for the `::notice::` line in the log.
