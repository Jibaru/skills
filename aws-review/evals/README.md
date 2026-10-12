# AWS review kit evals

One folder per expert. Each holds a small fixture (TypeScript, Go, Terraform, CDK and/or SST)
with planted issues and an `expected.md` that lists every plant as `file:line → rule ID → why`,
plus a few correct decoys that must not be flagged.

Run one after changing an expert or after `/aws-refresh`:

1. In Claude Code, from this repo: *"run aws-<expert> on aws-review/evals/aws-<expert>"*
   (or *"run aws-review on aws-review/evals/"* to test the routing too).
2. Compare the report with `expected.md`:
   - **recall**: planted issues found / planted issues
   - **false positives**: findings on decoys or on lines that `expected.md` does not list
3. A miss means the rule's **Detect** is too vague or the rule is missing. A false positive
   means the rule is too broad. Fix the reference, not the fixture.

The installers leave this folder out, so it never reaches `~/.claude/skills`.
