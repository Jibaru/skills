# Running Godot (and its tooling) from an agent on Windows

Git Bash on Windows looks like Linux and isn't. Each item below cost at least one failed round in
the THE ONES session. Quoted error text is literal.

## The rules

- **Scratch files go in the session scratchpad, never `/tmp`.**
- **Content with quotes, non-ASCII text, regexes or backslashes goes through the Write tool**, never a heredoc.
- **`.cjs` when you need `require`.**
- **PowerShell `Expand-Archive` / `Compress-Archive` for zips.**
- **`run_in_background` or Monitor, never `sleep`.**
- **Never trust a bare `python`.**
- **Absolute paths on every call.**
- **Never Read an output in the same parallel batch as the command that creates it.**
- **One GPU-heavy process at a time.**

## W1. `python` is the Microsoft Store stub

`python - <<'EOF' … || echo "no python"` hung for 120 s, got moved to the background, and needed
`Stop-Process python*`. `which python` printed `…/Microsoft/WindowsApps/python`. That's the Store's
app-execution alias, which waits on the Store. Treat any `WindowsApps` path as "no Python". Probe
with `timeout 5 python -c "print(1)"`, prefer `node -e`, and for Blender work use
`blender -b --python script.py` (Blender's bundled Python).

## W2. Heredocs with mixed quotes break

`/usr/bin/bash: -c: line 65: unexpected EOF while looking for matching '` showed up three times. The cause was long
heredocs mixing quotes, `¿…`, and apostrophes, followed by `node -e "…\"…"`. Write the content to a
scratchpad file with the Write tool, then `cat >>` it or merge it with Node. Keep `node -e` bodies free of nested quotes, or
use a `.cjs` file. (Same family as the escape corruption covered by the `shell-safe-patching` skill.)

## W3. `/tmp` isn't the same directory for every program

`cat > /tmp/blk.gd`, then Node's `readFileSync('/tmp/blk.gd')`, gave `ENOENT 'C:\tmp\blk.gd'`. Likewise
`require('/tmp/ja.json')` failed. Git Bash maps `/tmp` to its MSYS temp folder, while native programs
(node, godot, ffmpeg) resolve it to `C:\tmp`. Use the scratchpad with a drive-letter forward-slash path,
`S="C:/Users/<u>/AppData/Local/Temp/claude/<project>/<session>/scratchpad"`, and `cygpath -w` when a tool
needs backslashes.

## W4. `.mjs` + `require`

`ReferenceError: require is not defined in ES module scope`. Use `.cjs`, or `import fs from "node:fs"`.
Note that `node -e` is CommonJS.

## W5. `sleep` is blocked

`Blocked: sleep 30 followed by: curl …`. Subagents' `sleep 240; cat tasks/….output` got blocked too. Use
`run_in_background` and wait for the notification. Don't poll task files. For external conditions,
use Monitor with an until-loop:
`until curl -s https://…/ | grep -q "v0.7.0"; do sleep 5; done`. A no-sleep busy loop
(`for i in $(seq 1 30); do curl … && break; done`) exits instantly and looks like a failure.

## W6. `tar` can't open zips in Git Bash

`tar -xf godot.zip` gives `This does not look like a tar archive` (GNU tar). Use
`powershell -NoProfile -Command "Expand-Archive -Force a.zip dest"`. For selective extraction from
big archives (the 1.28 GB `.tpz` templates), use `unzip -o -j templates.tpz templates/macos.zip -d DEST` (Git
Bash has `unzip`), or `[IO.Compression.ZipFile]::OpenRead` with a filter (`export.md` §1).

## W7. Release zips

```bash
(cd build/windows && powershell -NoProfile -Command "Compress-Archive -Path TheOnes.exe,CREDITS.md,LEEME.txt -DestinationPath ../release/TheOnes-win64.zip -Force")
```

Delete the old zip first. `Compress-Archive` is slow and caps around 2 GB. It's fine for 480 MB.

## W8. curl corrupts non-ASCII request bodies

A POST with Japanese text returned
`{"type":"invalid_unicode","message":"Request body contains invalid UTF-8 encoding."}`. Write the JSON with
the Write tool and send it with `--data-binary @body.json -H "Content-Type: application/json; charset=utf-8"`, or
use Node `fetch` with `JSON.stringify`.

## W9. "File has been modified since read"

Re-Read right before a full-file Write, and prefer Edit. Expect this when subagents share files. A failed
Write followed by a screenshot showed the **old** page, which was nearly misread as the new one. Confirm the
write succeeded before trusting anything downstream.

## W10. "Shell cwd was reset to …"

This happens after `cd` into another repo. Use absolute paths, `cd X && …` in one call, or `( cd X && … )`.

## W11. Missing binutils

`strings: command not found`. Git Bash has no binutils. Use `cat`, `od -c`, or a Node one-off.

## W12. Read in the same batch as its generator

`File does not exist`, or a stale image, happened four times. A Read issued in the same parallel batch as the
Bash that builds the file races it. Sequence dependent calls.

## W13. Memory: one Godot at a time

`Background command 'Run all milestone playtests' was stopped because the system is running low on
memory`, and the output file held only `[killed]`. A heavy scene is ~600 MB of VRAM per instance.
Run one Godot process of any kind at a time (playtest, export, `--write-movie`, import). Write results
progressively (`--summary`, `tee -a`). Don't pipe long background jobs through `grep`/`head`. They're
block-buffered, and the output is lost on kill.

## W14. No output from Godot

Use `Godot_v4.x-stable_win64_console.exe`. The GUI binary detaches and prints nothing.

## W15. Bash tool time limit

The default is 120 s. Pass a timeout up to 600000 ms and wrap with coreutils `timeout 600 …`. Anything longer goes
in `run_in_background`.

## W16. ffmpeg `drawtext`

It spams `Fontconfig error: Cannot load default config file` (there's no fontconfig on Windows), and a `C:` path
breaks filter parsing (`No option name near '/Windows/Fonts/arial.ttf…'`, because `:` separates filter
options). Copy the TTF into the working directory and use a relative `fontfile=f.ttf`.

## W17. CRLF warnings

Commit with `git -c core.autocrlf=false commit …`, or set `core.autocrlf` once per repo.
