---
name: aws-review
description: Review AWS code and infrastructure with a panel of expert reviewers (compute, data, storage, messaging, networking, IaC, security, cost, observability) that run in parallel and return one ranked report of bugs, security holes, cost waste, reliability risks and simplifications. Use when the user asks to "review my AWS code", "revisa mi infra", "review this Terraform / CDK / SST", "is this Lambda/DynamoDB setup right", "how can I cut my AWS bill", or wants a review of a diff, branch or PR that touches AWS.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-review

Orchestrator of the AWS review kit. It decides which experts apply, runs them as parallel
subagents, merges what they find and hands back one report. It reviews files only: it never
calls an AWS account, and it reports without editing anything.

The experts are sibling skills, each with a `## Signals` section that says when it applies:

| Expert | Reviews |
| --- | --- |
| `aws-compute` | Lambda, ECS/Fargate, EC2, App Runner |
| `aws-data` | DynamoDB, RDS/Aurora, ElastiCache |
| `aws-storage` | S3, CloudFront |
| `aws-messaging` | SQS, SNS, EventBridge, Kinesis, MSK, Step Functions |
| `aws-networking` | VPC, NAT, load balancers, API Gateway, Route 53 |
| `aws-iac` | Terraform/OpenTofu, CDK (TypeScript), SST v3 as tools |
| `aws-security` | IAM, KMS, secrets, public exposure |
| `aws-cost` | Cost leaks across every service |
| `aws-observability` | Alarms, logs, metrics, tracing |

## 1. Fix the scope

Settle what is under review, in this order of preference:

1. What the user named (files, folders, a PR number, a branch).
2. The current change: `git diff <base>...HEAD` plus uncommitted work, with `<base>` the
   merge-base with the default branch.
3. The whole repository, when there is no change and nothing was named.

Also take any `terraform plan`, `cdk diff` or `sst diff` output the user pasted or that sits in
the repo. Done when you hold a concrete file list (for a diff: changed files plus the IaC and
handler files they wire into).

## 2. Route

Read the `## Signals` section of each expert's `SKILL.md` and match it against the file list
(grep the files for the listed resource types, constructs, components and SDK imports).
Then apply these routing rules:

- `aws-security` and `aws-cost` run whenever any AWS resource or SDK call is in scope.
- `aws-observability` runs whenever compute or messaging runs.
- `aws-iac` runs whenever a Terraform, CDK or SST file is in scope.

Done when each of the nine experts is marked *run* (with its file subset) or *skipped* (with
the reason).

## 3. Dispatch

Launch every *run* expert in one message, one subagent each, so they work concurrently. Give
each this brief:

> Load the `<expert>` skill with the Skill tool and follow it. Review these files: `<subset>`
> (the change under review is `<diff command or "whole files">`). Read neighbouring files when
> you need context. Return only the findings in the skill's output format, plus a line listing
> any rule you used whose Last verified date is older than 120 days.

The reviewing happens inside the experts. Here you only orchestrate and merge.

## 4. Merge

- **Duplicates**: findings with the same evidence and the same root cause collapse into one.
  Keep the most specific rule ID and list the other experts that also raised it.
- **Trade-offs**: when two findings pull opposite ways (cost says drop Multi-AZ, reliability
  says keep it), put them together under *Trade-offs* with both positions and what each costs.
  Leave the choice to the user.
- **Re-check**: for every critical and high finding, open the evidence file yourself and
  confirm the code really says what the finding claims. Drop the ones that fail.

## 5. Report

Write in the user's language:

1. **Summary**: one line per severity with its count, then which experts ran and which were
   skipped (and why).
2. **Findings**, most severe first, in the shared format:
   - **[severity] ID — title** (category · expert)
   - Evidence: `file:line` with the quoted snippet
   - Scenario: concrete input or state → what breaks, or what it costs (show the arithmetic
     and link the pricing page)
   - Fix: the concrete change
   - Source: link
3. **Trade-offs**, if there are any.
4. **Stale references**: rules older than 120 days that were used. Suggest `/aws-refresh`.

End by offering to apply the fixes. Apply them only after the user picks which ones.

## Evals

`evals/<expert>/` holds fixtures with planted issues and an `expected.md` for each expert.
See [evals/README.md](evals/README.md) to run them after changing a skill.
