---
name: shell-safe-patching
description: Edit source files without the shell silently corrupting escape sequences — never pipe code containing regexes or backslashes through a bash/python heredoc, patch with Write/Edit or a script file instead, and sweep for control bytes afterwards. Use before editing code from a shell (sed, heredoc, python -c, node -e), when a regex reads correctly but never matches, when a file broke after a scripted edit, or when a string contains \b, \n, \d, \x or other backslash escapes.
metadata:
  author: Jibaru
  version: 1.0.0
---

# shell-safe-patching

Patching code through a shell heredoc (`python - <<'PY'`, `node -e "…"`, `cat <<EOF`, `sed`)
runs the text through two or three layers of escape processing. Any of them can quietly turn
`\b` into a backspace byte or `\n` into a real newline. The result **reads correctly** in
`cat` and `grep`, compiles, passes the linter, and does the wrong thing.

This happened at least eight times across three projects in the same week: three times
patching [whatsapp-bot-sst](https://github.com/Jibaru/whatsapp-bot-sst), four times in
[wapi](https://github.com/crafter-station/wapi), and three times while writing the skills in
this repo. It's mechanical, so the fix is a fixed procedure rather than more care.

## The procedure

1. **Code containing a backslash goes through the Write or Edit tool. Never a heredoc.**
   Regex literals, escape sequences, Windows paths, `printf` formats, JSON with `\"`: all of them.
2. **If the patch must be programmatic** (many files, computed replacements), write it as a
   **script file** with the Write tool, then run it:

   ```js
   // scratch/patch.mjs, written with the Write tool, run with `node scratch/patch.mjs`
   // (illustrative replacement: swap in the real old/new strings)
   import { readFileSync, writeFileSync } from "node:fs";

   const file = "src/modules/library/search.ts";
   const before = readFileSync(file, "utf8");
   const old = "const bare = question.match(/\\b(\\d{4,6})\\b/);";
   const next = "const bare = question.match(/(?<!\\d)(\\d{4,6})(?!\\d)/);";
   if (!before.includes(old)) throw new Error(`pattern not found in ${file}`);
   writeFileSync(file, before.replace(old, next));
   console.log(`patched ${file}`);
   ```

   Inside a `.mjs` file there's exactly one escaping layer, JavaScript's, and you can
   read it. The `includes` guard makes a missed match fail loudly instead of passing as a
   no-op. Delete the script afterwards.
3. **After any shell-driven edit, sweep for control bytes** with the bundled script:

   ```bash
   node <this-skill>/scripts/find-control-bytes.mjs src scripts
   # src/x.ts:95:17  0x08      ← corruption: file, line, column, byte
   ```

   Any hit in source code is corruption until proven otherwise. Prefer the script to
   `grep -P '[\x00-\x08…]'`: in some locales (Git Bash on Windows among them) `grep -P` refuses
   to run, and a fallback that builds the pattern with `$(printf …)` can end up empty and match
   **every** file. A sweep that reports everything is as useless as one that reports nothing.
4. **Run `node --check file.mjs` / `tsc --noEmit` after the edit.** Corruption sometimes breaks
   syntax, as in the wapi case below. When it doesn't, step 3 is what catches it.

## Recognise it from the inside

**Symptom: a regex that reads correctly and never matches.** Before doubting the logic, dump
the line's bytes:

```bash
grep -n 'd{6' src/modules/documents/ingest.ts | head -1
sed -n '95p' src/modules/documents/ingest.ts | od -c
```

The whatsapp-bot-sst case (caught during the session, before it was committed):

```
0000000    r  e  t  u  r  n     /  ^  \  d  {  6  ,
0000020    } \b  /  .  t  e  s  t  (  t  i  t  l  e  .  t
```

The `\b` between `}` and `/` is a single byte, 0x08 (backspace), not a backslash and a `b`.
The regex required a literal backspace after the digits, so it never matched a real title. On
screen the line looked identical to the intended `/^\d{6,}\b/`.

**Symptom: "Invalid or unexpected token" in a file you just generated.** In this repo, a node
script written through a bash heredoc turned the `\n` inside a template literal into real line breaks:

```
${child.getLog().split("
                       ^
SyntaxError: Invalid or unexpected token
```

**Symptom: a regex lost its backslashes.** A heredoc-driven `node -e` edit turned
`/\.(blend|usdc)$/` into `/.(blend|usdc)$/`. It still worked, but it matched any character
instead of a dot. No error appears, so only reading the bytes back catches it.

**Symptom: the test fixture is corrupted.** While testing this skill's own sweep script, a
"clean" fixture written with `printf 'const ok = /^\\d{6,}\\b/;\n' > ok.ts` came out with a
0x08 in it: `printf` interprets `\b` in its format string as backspace. The script flagged both
the corrupted and the "clean" file, and it was right both times. Write fixtures with the Write
tool too.

## A related trap that isn't the shell: `\b` and accented letters

Even a correctly written `\b` fails on Spanish text. Without the `u` flag, `\b` only treats
`[A-Za-z0-9_]` as word characters, so in `"el último reporte"` there's no boundary between
the space and `ú`. whatsapp-bot-sst's `asksForCurrent` matched "hoy" and missed "último",
which was the key word of the question that started the bug (commit `11af394`). The fix uses
Unicode-aware lookarounds:

```ts
/(?<!\p{L})(últim[oa]s?|ultim[oa]s?|hoy|ahora|reciente|recientes|actual|actuales|al día|en vivo|esta semana|este mes|acaba de|de hoy)(?!\p{L})/iu
```

(`src/modules/agent/tools/search-library.ts`, with a dedicated test.) For any text that
might contain non-ASCII letters, use `(?<!\p{L})…(?!\p{L})` with the `u` flag instead of `\b`.

## Done means

- [ ] Every edit to content containing a backslash went through Write/Edit or a script file.
- [ ] `scripts/find-control-bytes.mjs` reports the touched files clean.
- [ ] The edited files parse (`node --check`, `tsc --noEmit`, or the project's typecheck).
- [ ] Any regex you wrote has a test with a string that must match and one that must not, and
      text with accents if the input is natural language.
