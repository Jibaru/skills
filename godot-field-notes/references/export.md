# Export without the editor GUI (Godot 4.7.2, Windows host)

Everything here was done from a terminal, with no editor window. Read the installed version's
`--help`, and the command-line reference for your version. `--export-release` takes the preset name
exactly as written in `export_presets.cfg`, and **the target directory must already exist**.

## 1. Windows .exe end to end

**1. Export templates.** The `.tpz` is ~1.28 GB. Extract only the entries you need into
`%APPDATA%\Godot\export_templates\<version>.stable\`. The folder name must match the engine version
exactly (`4.7.2.stable`). PowerShell:

```powershell
$t = "$env:APPDATA\Godot\export_templates\4.7.2.stable"; New-Item -ItemType Directory -Force $t | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [IO.Compression.ZipFile]::OpenRead("tools\templates.tpz")
foreach ($e in $z.Entries) { if ($e.Name -match '^(windows_.*x86_64.*|macos\.zip|version\.txt)$') { [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $t $e.Name), $true) } }
$z.Dispose()
```

From Git Bash, `unzip` works too (`tar` can't read zips there):
`unzip -o -j templates.tpz templates/macos.zip -d "$APPDATA/Godot/export_templates/4.7.2.stable/"`.

**2. Preset essentials** (THE ONES `export_presets.cfg`, preset 0, abridged to the keys that mattered):

```ini
[preset.0]
name="Windows Desktop"
platform="Windows Desktop"
export_filter="all_resources"
include_filter="CREDITS.md, assets/credits.json"
exclude_filter="playtest/*, scenes/trailer.tscn, scripts/trailer.gd, devtools/*, assets/source/*, tools/*, scenes/*_preview.tscn, scenes/veg_preview.tscn, scenes/dress_preview.tscn, scenes/npc_preview.tscn, scenes/vhs_preview.tscn"
export_path="build/windows/TheOnes.exe"

[preset.0.options]
binary_format/embed_pck=true          ; one ~500 MB exe instead of exe + pck
texture_format/s3tc_bptc=true
texture_format/etc2_astc=false
binary_format/architecture="x86_64"
application/modify_resources=true     ; writes the icon and version info into the exe
application/icon="res://assets/icon/icon.ico"
application/file_version="0.7.3.0"
application/product_version="0.7.3.0"
application/company_name="Crafter Games"
application/product_name="The Ones"
```

- `include_filter` ships non-resource files the game reads at runtime (a credits screen reading `CREDITS.md`).
- `export_filter="all_resources"` exports **everything** not excluded, including unused or
  restricted models. Exclude them explicitly, or delete them.

**3. Icon sizes.** The export warns once per missing size (localized: `Falta el tamaño del icono "16"`).
Build a multi-size ICO from 16/32/48/64/128/256 px PNGs: scale with ffmpeg `scale=…:flags=lanczos`, then pack
the PNGs into an ICO container (6-byte header, a 16-byte directory entry per image, then the PNG blobs).
*(Session technique, not a committed script. The `icongen` skill in this repo writes ICO containers too.)*

**4. Export with the console binary and a generous timeout:**

```bash
mkdir -p build/windows
timeout 1200 ./tools/Godot_v4.7.2-stable_win64_console.exe --headless --path . --export-release "Windows Desktop" build/windows/TheOnes.exe
```

**5. Smoke-test the real exe** and read its log under `%APPDATA%\Godot\app_userdata\<project name>\logs\`:

```powershell
$p = Start-Process build\windows\TheOnes.exe -PassThru; Start-Sleep 25; if (-not $p.HasExited) { $p.Kill() }
Get-ChildItem "$env:APPDATA\Godot\app_userdata\The Ones\logs" | sort LastWriteTime -desc | select -First 1 | % { Select-String -Path $_.FullName -Pattern "ERROR|SCRIPT" }
```

**6. Zip and ship:**

```powershell
Compress-Archive -Path TheOnes.exe,CREDITS.md,LEEME.txt -DestinationPath ../release/TheOnes-win64.zip -Force
```

Tell players about SmartScreen: "More info" → "Run anyway". `Compress-Archive` is slow and caps around 2 GB.
It's fine for 500 MB, and beyond that use `tar -a -c -f out.zip …` (Windows' bsdtar).

## 2. macOS from Windows: universal, ad-hoc signed, free

The first export failed with only `Cannot export project with preset "macOS" due to configuration
errors`. Re-running with `--verbose` showed the real reason (in Spanish on this machine): universal
and arm64 builds **refuse to export unless ETC2/ASTC import is enabled**. Set this in `project.godot`,
then run a full re-import (slow, tens of minutes on a big project, so use `timeout 3000`):

```ini
[rendering]
textures/vram_compression/import_etc2_astc=true
```

The preset that worked (`export_presets.cfg`, preset 1, abridged):

```ini
[preset.1]
name="macOS"
platform="macOS"
export_filter="all_resources"
include_filter="CREDITS.md, assets/credits.json"
exclude_filter="playtest/*, scenes/trailer.tscn, scripts/trailer.gd, devtools/*, assets/source/*, tools/*, scenes/*_preview.tscn, scenes/veg_preview.tscn, scenes/dress_preview.tscn, scenes/npc_preview.tscn, scenes/vhs_preview.tscn"
export_path="build/macos/TheOnes.zip"

[preset.1.options]
export/distribution_type=1
binary_format/architecture="universal"
application/icon="res://assets/icon/icon_1024.png"
application/bundle_identifier="com.crafter-games.theones"
application/short_version="0.7.3"
application/version="0.7.3"
application/min_macos_version_x86_64="10.15"
application/min_macos_version_arm64="11.00"
codesign/codesign=1            ; built-in ad-hoc signing, works from Windows, no Apple account
notarization/notarization=0
texture_format/s3tc_bptc=true
texture_format/etc2_astc=true
```

Verify with `unzip -l build/macos/TheOnes.zip`. Look for `The Ones.app/Contents/MacOS/The Ones`,
`Contents/Resources/The Ones.pck` and `_CodeSignature/CodeResources`. The result was a 504 MB universal app.

- **Upload Godot's zip as-is** (the GitHub release asset and `butler push …:osx`). Unzipping and
  re-zipping on Windows/NTFS loses the executable bit, and the app won't launch.
- **Gatekeeper**: the player opens it via System Settings → Privacy & Security → **Open Anyway**.
  Apps installed through the itch.io app don't get the quarantine flag, so there's no prompt.
- **Notarization requires a paid Apple Developer account** (99 USD/yr). When asked "no hay forma de que sea
  gratis ese certificado?" (is there no way to get that certificate free?), the honest answer is no,
  but the ad-hoc route above is free.
- **No Mac was available to test.** Say so to the user rather than implying it was verified.

## 3. Headless rules

- **One Godot process at a time.** A six-test background batch got OOM-killed. A parallel export plus
  playtest would too. Don't export while the playtest suite runs.
- **Re-import after adding assets** or editing `.import` files: `godot --headless --path . --import`.
  `--import` "starts the editor, waits for any resources to be imported, and then quits".
- **Messages are localized.** Grep `ERROR:`, `WARNING:`, `SCRIPT ERROR:`, `Parse Error:`, not the text
  ("Modificación de Recursos", "No se puede exportar…").
- **Harmless at exit** (especially with the headless dummy renderer): `N resources still in use at exit`,
  `RID allocations … leaked at exit`, `Leaked instance dependency`. **Real**: `SCRIPT ERROR`,
  `Parse Error`, `Failed loading`.
- **Quick sanity check** after a change: `timeout 60 godot --path . --quit-after 400`, then grep for `ERROR`.
  `--quit-after` counts main-loop **iterations** (frames), not seconds.
