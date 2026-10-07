# GitHub Pages + a custom subdomain

The flow that put `crafter-games/the-ones-game` on https://theones.crafter.run. DNS is managed with the
user's Crafter Station CLI, `crafters` (v0.4.0, `~/.bun/bin/crafters`; base domain `crafter.run`,
Spaceship DNS). For any other DNS provider, the only DNS step is "CNAME `<sub>` → `<owner>.github.io`".

Current state of that repo (read with `gh api repos/crafter-games/the-ones-game/pages`): `cname`
`theones.crafter.run`, source `main` `/`, `https_enforced: true`, certificate `approved`.

## What went wrong the first time

- **A CNAME can't contain a path.** The user asked to point theones.crafter.run "a
  https://crafter-games.github.io/the-ones-game". The DNS target is the **owner's** Pages host,
  `crafter-games.github.io`. The repo's Pages settings (`cname`) map that host plus the domain to this repo.
- **Setting the domain through the API makes GitHub commit a `CNAME` file** (commit `ca96487 Create CNAME`
  in that repo). The local clone is then behind: `git pull` before the next push, or the push is rejected.
- **The legacy builds API lies.** `repos/<repo>/pages/builds/latest` reported `errored: Page build failed`
  for two builds while the `pages-build-deployment` Actions run **succeeded**. A loop waiting for
  `built` hung for 600 s. Check the Actions run instead. Overlapping pushes also cancel earlier runs
  (that repo shows a `cancelled` run between two `success`es), so a cancelled run isn't a failure.
- **Enforcing HTTPS before the certificate exists fails.** Wait for `https_certificate.state == approved`.

## The commands

```bash
REPO=crafter-games/the-ones-game; OWNER=${REPO%%/*}; SUB=theones; DOM=$SUB.crafter.run

# 1. Pages on, first time only (and commit an empty .nojekyll so files like _x aren't dropped)
gh api -X POST repos/$REPO/pages -f "source[branch]=main" -f "source[path]=/"

# 2. DNS: check the name is free, preview, then create the CNAME
crafters domain list --json | grep -o "\"name\":\"$SUB[^\"]*\""      # no output = free
crafters domain add $SUB -t $OWNER.github.io --dry-run                # expect a spaceship:addCNAME action
crafters domain add $SUB -t $OWNER.github.io

# 3. Map the domain to the repo (GitHub commits a CNAME file → pull)
gh api -X PUT repos/$REPO/pages -f cname=$DOM && git pull -q

# 4. Enforce HTTPS once the certificate is approved (-F = typed boolean; -f sends the string "true")
gh api repos/$REPO/pages -q '.https_certificate.state'                # repeat until: approved
gh api -X PUT repos/$REPO/pages -F https_enforced=true

# 5. Verify through Actions, not the legacy builds API
gh run list --repo $REPO --limit 3
curl -s "https://$DOM/?v=$RANDOM" | grep -o "<title>[^<]*"            # cache-busted
curl -sI "http://$DOM" | grep -i '^location'                          # → https://
curl -sI "https://$OWNER.github.io/${REPO#*/}/" | grep -i '^location' # old URL 301s to the domain
```

`crafters domain add` **without** `-t` targets a Vercel project (it reads `.vercel/project.json`). For
Pages always pass `-t <owner>.github.io`. Its flags (`-t/--target`, `--dry-run`, `--json`, `--domain`) are
listed by `crafters domain add --help`.

## Waiting on DNS, certificates and deploys from Claude Code

A foreground `sleep` is blocked, and a `for i in $(seq 1 60); do … && break; done` with no sleep exits
instantly, which looks like a failure. Use one of these:

- deploys: `gh run watch <run-id> --repo $REPO --exit-status`
- DNS or certificate: the Monitor tool with an until-loop, for example
  `until nslookup $DOM 8.8.8.8 2>/dev/null | grep -qi github; do sleep 10; done`
  or `until [ "$(gh api repos/$REPO/pages -q .https_certificate.state)" = approved ]; do sleep 20; done`
- or tell the user it takes a few minutes, and check again later.

## After the domain is live

Update `og:url`, `canonical`, and every OG/Twitter image URL to the new domain. Re-run
`scripts/check-landing.mjs index.html --live`. Regenerate any **asset** with the old URL baked in: THE
ONES' trailer end card still shows `crafter-games.github.io/the-ones-game`.
