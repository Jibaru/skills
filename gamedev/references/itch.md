# itch.io: agent workflow and real failures

Distilled from shipping THE ONES (Godot, Windows + macOS) to
https://jibaru97.itch.io/the-ones. Each step below exists because skipping it failed.
For store-page conventions and channel naming, see the `itch-publish` skill. This file covers
what an agent hits in practice.

## 1. Install butler locally

Install it into `tools/butler/` (gitignored), not globally:

```bash
# Windows (Git Bash). Swap windows-amd64 for darwin-amd64 / linux-amd64 elsewhere.
curl -sL -o butler.zip https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default
powershell -NoProfile -Command "Expand-Archive -Force butler.zip tools/butler"
rm butler.zip
tools/butler/butler.exe -V
```

Use `powershell Expand-Archive` on Windows, because Git Bash's `tar` can't read zips. Checking the URL
with `curl -I` returns 403, since the redirect is a signed storage URL that only accepts GET. Test with
`curl -sL -r 0-99 -o /dev/null -w '%{http_code}'` (expect 206).

## 2. Hand the user two things at once

The agent can't do either of these:

1. **Create the page**: itch.io/game/new, saved as **Draft**, Kind = **Downloadable**. Prepare the text
   in advance from `assets/itch-page.md`, filled in: title, tagline, ES/EN description,
   tags, AI-generation disclosure, cover 630×500, screenshots. itch's trailer field wants a
   **YouTube/Vimeo URL**, not an mp4.
2. **Log in**: `butler login` opens browser OAuth, so the user runs it with the `!` prefix:
   `! tools/butler/butler.exe login`

## 3. Ask for the public URL; don't discover it

Ask the user for `https://USER.itch.io/SLUG`. Every way of discovering it failed:

- The key butler saves is wharf-scoped:
  `https://itch.io/api/1/$KEY/me` → `{"errors":["api key does not permit `profile:me`"]}`.
  It can't read the profile or `/my-games`.
- The number in `https://itch.io/game/edit/5111576` (which the user pasted first) isn't accepted
  by butler.
- Guessing usernames with `butler status guess/slug` wastes calls on
  `invalid target (bad user)` and `invalid game`.

Then confirm the target:

```bash
tools/butler/butler.exe status USER/SLUG    # "No channel found" = target OK, nothing pushed yet
```

## 4. Push with --json and retries

Progress-bar output was 57 KB per push, so always use `--json`, redirected to a log in the
scratchpad. Both pushes once died at the very end with `error: HTTP 525 for /wharf/builds/.../files/...`
(transient Cloudflare). A retry succeeded immediately.

```bash
VER=0.7.3
for c in windows osx; do
  src=build/windows; [ "$c" = osx ] && src=build/macos/Game.zip
  for try in 1 2 3; do
    tools/butler/butler.exe push "$src" USER/SLUG:$c --userversion "$VER" --json > "$SCRATCH/push_$c.log" 2>&1 && break
    grep -ao '"message":"[^"]*"' "$SCRATCH/push_$c.log" | tail -2
    if grep -q "verify your account" "$SCRATCH/push_$c.log"; then
      echo "the user must verify their itch email first (itch.io/user/settings)"; break 2
    fi
  done
done
```

The first ever push failed with
`Please verify your account's email address before uploading a build`. Only the user can fix
that, and retrying won't help, so the loop stops.

## 5. Wait for processing, then hand back

Right after a successful push, `butler status` doesn't list the channel yet ("Build is now
processing"). Use the Monitor tool with an until-loop, or `run_in_background`, rather than
a busy loop:

```bash
until tools/butler/butler.exe status USER/SLUG 2>&1 | grep -q windows && \
      tools/butler/butler.exe status USER/SLUG 2>&1 | grep -q osx; do sleep 10; done
tools/butler/butler.exe status USER/SLUG
```

Then tell the user to check the platform tags under **Uploads** and flip **Draft → Public**.

## macOS builds pushed from Windows

- Push the Godot-exported **`.zip` file** as-is: `butler push build/macos/Game.zip USER/SLUG:osx`.
  butler reads the unix permission bits from the zip. Unzipping on NTFS and pushing the folder
  drops the executable bit, and the app won't launch.
- Without notarization (which needs the paid Apple Developer program), browser downloads hit Gatekeeper's
  "Open Anyway". **Installs through the itch app don't get the quarantine flag**, so there's no prompt.
  Say so on the page.

## Every release

Ship GitHub and itch together, with the same `--userversion`. The GitHub sequence is in `ship.md`.
