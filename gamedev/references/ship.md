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

The preset names must match `export_presets.cfg` exactly. For Steam, use
GodotSteam. The `godot-export` and `steam-publish` skills cover the details.

## itch.io with butler

```bash
butler login
butler push dist yourname/my-game:html5 --userversion 0.1.0
butler push src-tauri/target/release/bundle/nsis yourname/my-game:windows --userversion 0.1.0
```

Download butler from https://itch.io/docs/butler/. The `itch-publish` skill has page
setup and channel conventions.

## Release checklist

- [ ] Playtest passes on the production build (`--dist`)
- [ ] `CREDITS.md` included, or credits shown in-game, if any asset needs attribution
- [ ] Title, icon (`icongen` skill), window size and fullscreen toggle
- [ ] Audio starts only after the first user input (browsers block autoplay)
- [ ] Pause on focus loss (`document.hidden` / `NOTIFICATION_APPLICATION_FOCUS_OUT`)
- [ ] No `console.error` in the playtest report
