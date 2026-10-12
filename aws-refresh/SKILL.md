---
name: aws-refresh
description: Refresh the AWS review kit's reference rules against the official AWS, Terraform, CDK and SST docs — re-verify sources, fix moved links, correct changed limits, prices and defaults, and add rules for new features. Use when a review says "reference is stale, run /aws-refresh", or the user asks to "update the AWS skills", "refresh aws references", "actualiza las skills de aws", or names one expert to refresh (e.g. "refresh aws-data").
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-refresh

Keeps the `aws-*` experts current. Each expert keeps its rules in `references/*.md`, and every
rule carries a `Source` URL and a `Last verified` date. `references/sources.md` lists every URL
so links can be found again after they move.

## 1. Find the source repo

Edit the git repository the kit was installed from. The installed copies get overwritten on
the next install. The path is in `SOURCE_REPO` next to this file, written by
`install-aws.sh`/`install-aws.ps1`. If that file is missing, ask the user for the path. Done
when `<repo>/aws-review/SKILL.md` exists.

## 2. Pick the targets

- If the user named experts, refresh those.
- Otherwise, refresh every expert that has at least one rule with `Last verified` older than
  120 days before today.
- If nothing is stale and the user still asked for a refresh, refresh everything.

Before going on, list the targets to the user with how many stale rules each one has.

## 3. Refresh in parallel

Launch one subagent per target expert in a single message, with this brief:

> You maintain `<repo>/<expert>/`. Today is `<date>`. Use only the official sources listed in
> `references/sources.md` (docs.aws.amazon.com, aws.amazon.com pricing/blogs/Builders' Library/
> Well-Architected, repost.aws, github.com/aws*, docs.powertools.aws.dev,
> registry.terraform.io, developer.hashicorp.com, opentofu.org, the CDK docs, sst.dev).
> 1. For every rule, fetch its Source. If the page moved, find the new official URL. If the
>    claim changed (a limit, price, default, deprecation or runtime version), rewrite the rule.
>    If nothing official supports it anymore, delete it. Set `Last verified` to today on every
>    rule you confirmed.
> 2. Check that the Detect and Fix snippets still match the current Terraform AWS provider,
>    aws-cdk-lib v2, SST v3, AWS SDK for JavaScript v3 and aws-sdk-go-v2.
> 3. Check "What's New with AWS" and the service release notes since the oldest Last verified
>    date. Add rules for changes that a reviewer should flag, using the next free ID.
> 4. Update `references/sources.md` and keep `aws-review/evals/<expert>/expected.md` consistent
>    with any rule ID you removed.
> Return: rules confirmed, changed (old → new, with the source), removed, added, and anything
> still uncertain.

## 4. Report and reinstall

Show the user the combined changelog (changed, removed, added, uncertain), grouped by expert,
and `git diff --stat` for the repo. Suggest re-running the evals
(`aws-review/evals/README.md`), and then `./install-aws.sh` (or `.\install-aws.ps1`) to
update the installed copies. Commit only if the user asks.
