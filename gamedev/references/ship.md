# Shipping

Always playtest the **build**, not only the dev server:

```bash
npm run build
node <game-playtest>/scripts/playtest-web.mjs playtest/scripts/smoke.json --dist dist
```

## Web

`npm run build` (with `--base ./`) produces a self-contained `dist/`.

| Target | How |
| --- | --- |
| itch.io | Zip the **contents** of `dist/` (so `index.html` is at the zip root) and upload as HTML5. Set the viewport to the game's size. Or use `butler` (below). |
| GitHub Pages | Push `dist/` to a `gh-pages` branch, or use the Pages action. |
| Netlify / Vercel / VPS | Static folder, no server code needed. The `vps` skill deploys to Dokploy. |

Godot web exports need `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers. On itch.io, tick
"SharedArrayBuffer support".

## Desktop from a web game: Tauri 2

This needs a Rust toolchain (`rustup`). On Windows it also needs the WebView2
runtime, which ships with Windows 10/11.

```bash
npm i -D @tauri-apps/cli@^2
npx tauri init --ci --app-name my-game --window-title "My Game" \
  --frontend-dist ../dist --dev-url http://localhost:5173 \
  --before-dev-command "npm run dev" --before-build-command "npm run build"
```

Then edit `src-tauri/tauri.conf.json`:

- `identifier`: change the default `com.tauri.dev` to your own reverse-DNS
  id (e.g. `dev.yourname.mygame`), or the build refuses to run.
- `app.windows[0]`: set `width`/`height` to the game's aspect ratio, and add
  `"fullscreen": true` if wanted.

```bash
npx tauri icon path/to/icon-1024.png     # generates every platform icon
npx tauri dev                            # run as a desktop app
npx tauri build                          # installer(s) in src-tauri/target/release/bundle/
npx tauri build --no-bundle              # just the executable, faster
```

Tauri builds for the OS it runs on. For Windows, macOS and Linux builds, use
the `tauri-apps/tauri-action` GitHub Action with a matrix.

Electron is the alternative when the game needs identical Chromium
rendering on every OS, or Steamworks through `steamworks.js`. It costs a
~100 MB download versus Tauri's few MB.

## Desktop from Godot

1. Install export templates once: Editor → Manage Export Templates, or
   download `Godot_v<ver>_export_templates.tpz` and extract it to the
   templates folder.
2. Create presets (Project → Export) and commit `export_presets.cfg`.
3. Build headless:

```bash
godot --headless --path . --export-release "Windows Desktop" export/windows/MyGame.exe
godot --headless --path . --export-release "Linux" export/linux/MyGame.x86_64
godot --headless --path . --export-release "Web" export/web/index.html
```

The preset names must match the `name=` lines in `export_presets.cfg` exactly. In
Godot 4 the Linux platform is `Linux`, not "Linux/X11". For Steam, use GodotSteam.
For exporting on Windows with no editor GUI (templates from the `.tpz`, `embed_pck`, the icon
sizes, a smoke test of the real exe, and a free ad-hoc-signed universal macOS build), see
`godot-field-notes/references/export.md`. It was proven end to end shipping THE ONES.

## GitHub release (desktop builds)

A private source repo can't serve public downloads. Keep a separate public repo
(`<game>-game`) for the landing page and the releases. **Keep the asset names constant
across versions** (`Game-win64.zip`, `Game-macos.zip`), so
`https://github.com/<org>/<repo>/releases/latest/download/<name>` links on the landing page
and in the README never change. Don't print the version or size next to those links: they go stale
on the next release.

Each release bumps the version in two files (THE ONES did seven releases this way,
v0.6.0 → v0.7.3): `project.godot` (`config/version="0.7.3"`) and `export_presets.cfg`
(`application/file_version="0.7.3.0"`, `application/product_version="0.7.3.0"`, and the macOS
`application/short_version` / `application/version`).

```bash
VER=0.7.3; OLD=0.7.2
grep -rl "$OLD" project.godot export_presets.cfg | xargs -r sed -i "s/$OLD/$VER/g"
git diff --stat project.godot export_presets.cfg      # check exactly these two changed

GODOT=./tools/Godot_v4.7.2-stable_win64_console.exe   # the console build, or there is no output
timeout 1200 $GODOT --headless --path . --export-release "Windows Desktop" build/windows/Game.exe
timeout 3000 $GODOT --headless --path . --export-release "macOS" build/macos/Game.zip

mkdir -p build/release && rm -f build/release/Game-win64.zip
cp CREDITS.md README.txt build/windows/
(cd build/windows && powershell -NoProfile -Command "Compress-Archive -Path Game.exe,CREDITS.md,README.txt -DestinationPath ../release/Game-win64.zip -Force")
cp build/macos/Game.zip build/release/Game-macos.zip   # the Godot zip as-is: re-zipping on Windows drops the exec bit
```

Write the release notes with the **Write tool** into the scratchpad. On Windows, use the absolute
scratchpad path, not `/tmp`: Git Bash's `/tmp` isn't the `C:\tmp` that native tools see. Heredocs
with quotes or non-ASCII text broke in practice. Keep the notes player-facing, spoiler-free, and
include first-launch instructions:

```markdown
**GAME — v0.7.3**

- Player-facing, spoiler-free changes.

**Windows** — `Game-win64.zip`: unzip, run `Game.exe`. SmartScreen: "More info" → "Run anyway".
**macOS** — `Game-macos.zip`: unzip, move to Applications. First launch: System Settings →
Privacy & Security → **Open Anyway** (installing through the itch app avoids this).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

```bash
gh release create v$VER build/release/Game-win64.zip build/release/Game-macos.zip \
  --repo ORG/REPO-game --title "GAME v$VER" --notes-file "$SCRATCH/notes.md"
# later fixes: gh release upload v$VER build/release/Game-win64.zip --clobber
#              gh release edit v$VER --notes-file "$SCRATCH/notes.md"

# verify the stable links resolve to the new assets
for a in win64 macos; do
  curl -sIL "https://github.com/ORG/REPO-game/releases/latest/download/Game-$a.zip" | grep -i content-length | tail -1
done
```

`Compress-Archive` caps out around 2 GB per file. For anything bigger, use `tar -a -c -f out.zip ...`
(Windows' bsdtar). Ship the GitHub release and itch with the **same version** every time.

## itch.io

See `references/itch.md`: the agent workflow (local butler, interactive login, the URL
the user must give you), a push loop with retries, and the failures that actually happened.

## Release checklist

- [ ] Playtest passes on the production build (`--dist`)
- [ ] `CREDITS.md` included, or credits shown in-game, if any asset needs attribution
- [ ] Title, icon (`icongen` skill), window size and fullscreen toggle
- [ ] Audio starts only after the first user input (browsers block autoplay)
- [ ] Pause on focus loss (`document.hidden` / `NOTIFICATION_APPLICATION_FOCUS_OUT`)
- [ ] No `console.error` in the playtest report
- [ ] Desktop: opens **fullscreen** by default, with window mode and resolution settings
      (`godot-field-notes/references/display-settings.md`)
- [ ] README/LEEME inside the zip with the SmartScreen and Gatekeeper first-launch steps
- [ ] Trailer, landing page and store screenshots are spoiler-free (`game-trailer` Rule 0)
- [ ] GitHub release and itch carry the same version
- [ ] Unused and non-redistributable assets are excluded from the export (`game-assets audit`).
      THE ONES shipped an unused 12 MB model and a "Free Standard" one by accident
- [ ] The user has **listened** to the build. You can't hear audio, so say so
- [ ] Generated audio: the provider plan allows commercial use, and AI use is declared on the store page
