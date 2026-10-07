---
name: retrieval-quality
description: Fix RAG and document search that misses what is clearly in the library — search metadata as well as content, add an exact normalized-identifier arm next to semantic and keyword search, keep identifier extractors from grabbing the wrong number, and replace portal-generated filenames with real titles. Use when a bot says "I don't have that document" about one it just saved, when search by a code, law number, SKU or case number returns unrelated results, when building hybrid search (pgvector + full-text + RRF), or when citations show filenames like "8649148 ds n 014 2026 tr".
metadata:
  author: Jibaru
  version: 1.0.0
---

# retrieval-quality

Retrieval fails in ways the index can't show you. The document is there, perfectly
indexed, and still unreachable for the question people actually ask. This skill comes
from one bug in [whatsapp-bot-sst](https://github.com/Jibaru/whatsapp-bot-sst), a WhatsApp
bot answering workplace-safety questions over a library of Peruvian regulations (Postgres +
pgvector + full-text, fused with RRF). Commits `04f718a` and `ffca867` cite it. Files are in
`src/modules/library/search.ts` unless noted.

## The case

The group saved D.S. 014-2026-TR. The bot confirmed it was saved "as
8649148 ds n 014 2026 tr exp mot". Asked about it, the bot answered with D.S. 006-2014-TR, then
"I don't have that one identified".

The document was **fine**: `ready`, 57,247 characters, 31 chunks, indexed. Measured, the
problem was elsewhere: **the extracted text doesn't contain "014" even once.** The PDF opens with
"PARTICIPACIÓN CIUDADANA EN LAS ELECCIONES…" and never prints its own number. The only place
the number appeared was the filename, which the classifier had used to fill in the `code`. Search
looked only at chunk content.

**Diagnose first by measuring the document**, before tuning ranking: status, chunk count, and
whether the queried string occurs in the chunks at all (`select count(*) from document_chunks
where document_id = $1 and content ilike '%014%'`). In this case the answer was zero.

## 1. Search the document's identity, not only its content

Add an arm that matches the query against `title || code` and contributes the document's
**first** chunks (a regulation's identity is at the start). It contributes only a few chunks,
so it can't crowd out content matches:

```sql
metadata as (
  select id, rank from (
    select c.id,
           row_number() over (partition by c.document_id order by c.ordinal) as rank
    from document_chunks c
    join documents d on d.id = c.document_id
    where d.is_active
      and to_tsvector('spanish', coalesce(d.title, '') || ' ' || coalesce(d.code, ''))
          @@ ${tsquery}
      ${categoryFilter} ${companyFilter}
  ) ranked
  where rank <= ${METADATA_CHUNKS}          -- 3
),
```

## 2. An identifier is looked up, not ranked

Relevance is the wrong tool for identifiers:

- **Full-text**: natural questions need the tsquery relaxed from `&` to `|`, so
  "decreto supremo 014 2026 TR" becomes `decreto | suprem | 014 | 2026 | tr`. That matches half
  the library and buries the one regulation carrying that number.
- **Embeddings**: worse. Every regulation number looks like every other one.

So extract the identifier from the question, **normalize it to what doesn't change** (digits and
letters joined, no separators), and compare it exactly against code and title in its own
arm, weighted higher in the fusion:

```ts
const code = normCode(trimmed);
const exactFilter = code
  ? sql`and regexp_replace(lower(coalesce(d.code, '') || ' ' || d.title), '[^a-z0-9]', '', 'g')
        like ${`%${code}%`}`
  : undefined;
```

```sql
exacta as (
  select id, rank from (
    select c.id,
           row_number() over (partition by c.document_id order by c.ordinal) as rank
    from document_chunks c
    join documents d on d.id = c.document_id
    where d.is_active ${exactFilter ?? sql`and false`}
      ${categoryFilter} ${companyFilter}
  ) ranked
  where rank <= ${METADATA_CHUNKS}
),
-- …
fused as (
  select coalesce(s.id, k.id, m.id, e.id) as id,
         coalesce(1.0 / (${RRF_K} + s.rank), 0)
           + coalesce(1.0 / (${RRF_K} + k.rank), 0)
           + coalesce(1.0 / (${RRF_K} + m.rank), 0)
           + coalesce(2.0 / (${RRF_K} + e.rank), 0) as score,   -- exact arm: double weight
  -- full outer joins of semantic, keyword, metadata, exacta
```

With `RRF_K = 60`, the exact arm counts `2.0 / (60 + rank)`. That's enough to put an exact hit
first without making it the only result. Every phrasing normalizes to the same key:

```
"014-2026-TR"                 → 0142026tr
"decreto supremo 014 2026 TR" → 0142026tr
"la 014 2026 tr"              → 0142026tr
"D.S. 014-2026-TR"            → 0142026tr
```

Measured against the real library, all three phrasings from the conversation went from not found
to ranked first. **Equally part of the fix:** ordinary queries were checked too ("EPP",
"comité", reporting deadlines), and they still returned their own documents. An exact arm that
breaks normal search is no fix.

## 3. Keep the identifier extractor from being greedy

The first `normCode` (commit `04f718a`) had optional separators:

```ts
const numbered = question.match(/\b(\d{1,4})\s*[-/]?\s*(\d{4})\s*[-/]?\s*([a-z]{2,5})\b/i);
```

Someone pasted the bot's own earlier message, "Ya estaba guardada en la biblioteca como
8649148 ds n 014 2026 tr exp mot". The regex split the download id as `864` + `9148` + `ds`
and returned `8649148ds`, a fragment of the portal's id that belongs to no regulation. The exact
search looked for an invented code, while the correct number sat a few words further on.

The fix (`ffca867`) makes the separators mandatory:

```ts
export function normCode(question: string): string | undefined {
  const numbered = question.match(/\b(\d{1,4})[\s\-/]+(\d{4})[\s\-/]+([a-z]{2,5})\b/i);
  if (numbered) return `${numbered[1]}${numbered[2]}${numbered[3]}`.toLowerCase();

  // Una ley se nombra solo con su número: «la 29783».
  const bare = question.match(/\b(\d{4,6})\b/);
  return bare ? bare[1] : undefined;
}
```

**Test the extractor against strings that contain other long numbers**: ids, phone numbers,
dates, the bot's own previous messages pasted back. `src/modules/library/search.test.ts` includes
the group's message verbatim, exactly as it was pasted.

## 4. A portal-generated title poisons search and citations at once

`8649148 ds n 014 2026 tr exp mot` was both the only thing the document could be found by
**and** what the bot cited. The classifier already read the document, so now it proposes a
readable title. The title is applied **only when the current one looks generated**, because a
name a person wrote gets respected:

```ts
export function looksGenerated(title: string): boolean {
  return /^\d{6,}/.test(title.trim());
}
```

(`src/modules/documents/ingest.ts`. "Ley 29783" has five digits and is a good title, so position matters,
not digit count.) With only the general instruction ("if the filename is already readable,
return null"), the model returned `null` about half the time, accepting the portal's id as a
title. What fixed it was saying so **for that case** (`src/modules/documents/classify.ts`):

```ts
...(options.generatedTitle
  ? [
      "Ese nombre es el identificador con que un portal sirvió el archivo, no un título.",
      "Tienes que proponer uno: no devuelvas null.",
    ]
  : []),
```

After that it proposed a title every time. A backfill (`pnpm retitle`) fixed the six existing
documents in the client's library.

## Checklist for a library with identifiers

Regulations, SKUs, case numbers, part codes, invoice numbers:

- [ ] For a "missing" document: measured whether the identifier occurs in its chunks at all.
- [ ] Title and code are searchable (a metadata arm), not only chunk content.
- [ ] There's an exact arm on a normalized key, weighted above relevance in the fusion.
- [ ] The extractor's tests include strings with other long numbers, and the system's own output.
- [ ] Generated filenames are detected and replaced with real titles, with a conditional
      instruction to the model for that case and a backfill for existing rows.
- [ ] Ordinary topic queries were re-run after the change and still return their documents.
