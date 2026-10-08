---
name: worklog
description: Summarize what was done on a given day, or within a range of hours on that day, by reading GitHub (gh) and Linear (lineark CLI or the Linear MCP), and write it as a short Spanish bullet list where each line says what was done, why it matters, and which PR or issue it closed. Use when the user asks "dame lo realizado el miércoles 15", "qué hice ayer", "lo realizado el jueves 13 de agosto entre las 8pm y 10pm", "resumen del día", "daily", "standup", "worklog", or "what did I do on Friday".
metadata:
  author: Jibaru
  version: 1.0.0
---

# worklog

Turns one day of work (or a window of hours inside it) into a short report in Spanish. GitHub
and Linear are the evidence. Nothing goes into the report that the evidence doesn't show.

## 1. Ask before reading anything

Ask these in **one** message (with `AskUserQuestion` if it's available) and wait for the answer:

1. **Which Linear tool?** Offer, in this order: `lineark` CLI (usual), the Linear MCP, or "no
   Linear". Don't pick for them. A machine can have both, pointed at different workspaces.
2. **Which Linear projects and/or teams?** (e.g. team `CLO`, project "T-Cuido Express").
3. **Which GitHub repos?** `owner/name`, one or more. If the session is inside a repo, offer it
   as the default, but still ask.
4. **Only my work, or everyone's?** Default: only the authenticated user (`@me` in gh, `me` /
   `--mine` in lineark).

If the user already gave any of these in the request, don't ask again.

## 2. Resolve the date window

- Timezone: **America/Lima (UTC-5, no DST)** unless the user says otherwise. Build every query
  with an explicit offset (`-05:00`) or convert to UTC. Never use bare UTC dates: an evening in
  Lima is already the next day in UTC. A PR opened on 7 Oct at 20:43 Lima has
  `createdAt: 2026-10-08T01:43:23Z`.
- Missing month/year: use the current month and year. If that date is still in the future, use
  the most recent past occurrence. If the weekday the user said doesn't match the date ("miércoles
  15" when the 15th is a Thursday), **stop and ask**. Don't guess which one is wrong.
- No hours given: `00:00:00` to `23:59:59` local time. Hours given: "entre las 8pm y 10pm" means
  `20:00:00` to `21:59:59`.
- State the resolved window in the first line of the answer, e.g.
  `Miércoles 15 de octubre de 2026, 20:00–22:00 (hora de Lima)`.

## 3. Collect from GitHub

For each repo `R`, with `S=2026-10-07T00:00:00-05:00` and `E=2026-10-07T23:59:59-05:00`:

```bash
# PRs touched in the window (created, merged, closed or updated). Filter by timestamp next.
gh pr list -R "$R" --state all --search "involves:@me updated:$S..$E" --limit 100 \
  --json number,title,state,author,createdAt,mergedAt,closedAt,url,closingIssuesReferences

# Commits in the window (UTC in the API)
gh api "repos/$R/commits?since=<S as UTC>&until=<E as UTC>&author=<login>&per_page=100" \
  --jq '.[] | {sha: .sha[0:7], date: .commit.author.date, msg: (.commit.message | split("\n")[0])}'

# Issues closed or opened in the window
gh issue list -R "$R" --state all --search "involves:@me updated:$S..$E" --limit 100 \
  --json number,title,state,createdAt,closedAt,url

# Reviews given or received on a candidate PR
gh pr view <N> -R "$R" --json reviews,comments,commits
```

`updated:` returns anything touched in the window, including a bot comment on an old PR. **Keep
an item only if one of its own events falls inside the window**: `createdAt`, `mergedAt`,
`closedAt`, a commit, a review, or a comment by the user.

"Everyone's work": drop `involves:@me` and the `author=` filter.

## 4. Collect from Linear

**lineark** (no date filter, so filter the JSON yourself):

```bash
lineark issues list --team CLO --project "<project>" --show-done -l 250 --format json
lineark issues read CLO-123 --format json   # comments, state, relations, dates
```

Keep issues whose `completedAt` or `canceledAt` falls inside the window. For issues that are
still open, read the candidates (those linked from the PRs found in step 3, or found with
`lineark issues search`) and keep them only if a comment or state change falls inside the window.

**Linear MCP**: `list_issues` with the team/project and `updatedAt` filter, then `get_issue` /
`list_comments` per candidate. Same rule: an event of the issue must fall inside the window.

**Cross-link** both sources: a Linear issue and the PR that closed it (branch name like
`user/clo-2410-…`, `Closes CLO-2410`, `Fixes #46`) are **one** line, not two.

## 5. Write the report

Spanish, one bullet per unit of work, in chronological order. Template:

```
- <Qué se hizo, en lenguaje de producto> (<PR #N>) — cerró #M, review incluido.
```

Rules:

- **Lead with the outcome, not the mechanism.** "Listado admin con paginación real por
  LastEvaluatedKey y orden por estado", not "refactor de listBookings".
- **Add the why when it isn't obvious**, in a short clause: "aprovechando la ventana gratis",
  "con auto-sanado".
- **Reference tail**, in this order and only when true: `(PR #N)`, `— cerró #M` (or the Linear
  ID), `review incluido` / `con review resuelto` when there were review rounds, `desplegada` only
  if a deploy is recorded somewhere in the evidence.
- **Group** a PR and its review-fix commits into one line. Group several issues closed for the
  same reason into one line ("Cerradas #19 y #36 con auditoría y justificación: …").
- **Open work counts.** A PR still open at the end of the window: "(PR #133, en review)".
- Nothing in the window: say so, and list what you checked (repos, projects, window).

Example of the target style:

```
- Cerradas #19 y #36 con auditoría y justificación: lo construible ya estaba hecho, lo pendiente quedó en su único tracker (DECISIONS).
- Proyección del GSI1 ampliada con specialty/cycle/bio para la tarjeta del catálogo (PR #56), aprovechando la ventana gratis, con review resuelto y desplegada.
- Listado admin con paginación real por LastEvaluatedKey y orden por estado (PR #57) — cerró #46, review incluido.
- Auditoría del cambio de teléfono dentro de la transacción del claim (PR #58) — cerró #53.
- Aceptación de términos consciente de versión, atómica y con auto-sanado (PR #59) — cerró #52, review incluido.
- Dos deploys a dev verificados: dev = main, brecha cero.
```

## 6. What the evidence can't show

Deploys from a terminal, meetings, calls and investigations that left no PR, commit, issue or
comment are **invisible** to GitHub and Linear. Don't invent them, and don't drop them silently
either. After the report, ask in one line: "¿Algo fuera de GitHub/Linear que agregar (deploys,
reuniones, investigación)?" A line like "Dos deploys a dev verificados" goes in only if the user
confirms it or the evidence records it (a PR comment, a deploy workflow run, a Linear comment).

Before sending, check every `#N` and Linear ID in the report against the data collected. A wrong
number in a report someone forwards is worse than a missing line.
