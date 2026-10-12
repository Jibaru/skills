---
name: aws-iac
description: Review infrastructure-as-code as a tool, not the services it creates — Terraform/OpenTofu with the AWS provider (S3 backend locking with use_lockfile, state per environment, version pinning, for_each vs count, moved/import/removed blocks, lifecycle misuse, default_tags, secrets in state), AWS CDK v2 in TypeScript (RemovalPolicy on stateful resources, logical ID changes that replace resources, cross-stack reference deadlocks, env-agnostic stacks, NodejsFunction bundling, cdk-nag, cdk diff) and SST v3 sst.config.ts (removal/protect per stage, link vs manual env and IAM, sst.Secret, Outputs and $interpolate, stage cleanup, sst diff). Use when the user asks "review my Terraform", "is this CDK stack safe to deploy", "check my sst.config.ts", "will this rename replace my table", "review this terraform plan / cdk diff / sst diff", or when aws-review dispatches it.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-iac

Static reviewer for how infrastructure is declared and deployed: state, versions, resource
identity, replacement, stage lifecycle and the wiring between IaC and application code. It
reads files, diffs and `terraform plan` / `cdk diff` / `sst diff` output; it never calls an AWS
account. It reports findings and edits nothing until the user asks for fixes.

## Covers / hands off

Covers: Terraform and OpenTofu (backend, state, providers, modules, meta-arguments, lifecycle,
refactoring blocks, plan review), AWS CDK v2 in TypeScript (removal policies, logical IDs,
stacks and references, environments and context, bundling, aspects and cdk-nag, CLI flags),
SST v3 (app config, stages, components, linking, secrets, Outputs, state), and how TypeScript
(SDK v3) or Go (SDK v2) code receives resource names from the IaC.

Hands off (one line, then move on):

- Lambda/ECS sizing, runtimes, concurrency → `aws-compute`.
- Table keys, capacity, backups, engine settings → `aws-data`. Bucket settings → `aws-storage`.
- Queue/topic/stream semantics → `aws-messaging`. VPC, NAT, endpoints, API routes → `aws-networking`.
- IAM policy content, KMS, public exposure, secret rotation → `aws-security`.
- Bills beyond the IaC choice that causes them → `aws-cost`. Alarms, log retention values,
  tracing → `aws-observability`.

## Signals

This expert applies when any of these appear (aws-review routes on this section):

- **Terraform/OpenTofu files**: `*.tf`, `*.tf.json`, `*.tfvars`, `*.tftest.hcl`,
  `.terraform.lock.hcl`, `*.tfplan.json`, saved `terraform plan` / `tofu plan` output
  (`will be destroyed`, `must be replaced`, `forces replacement`, `-/+`).
- **Terraform content**: `terraform {`, `backend "s3"`, `use_lockfile`, `dynamodb_table`,
  `required_providers`, `provider "aws"`, `default_tags`, `allowed_account_ids`, `module "`,
  `source = "git::`, `?ref=`, `count =`, `for_each =`, `lifecycle {`, `prevent_destroy`,
  `ignore_changes`, `create_before_destroy`, `name_prefix`, `moved {`, `import {`, `removed {`,
  `terraform_remote_state`, `sensitive = true`, `ephemeral`, `*_wo =`, `depends_on`,
  `encryption {` (OpenTofu), `terraform apply -auto-approve`, `plan -out`.
- **CDK files**: `cdk.json`, `cdk.context.json`, `bin/*.ts`, `lib/**/*.ts` importing
  `aws-cdk-lib` or `constructs`, saved `cdk diff` output (`[-]`, `[~]`, `replace`), `cdk.out/`.
- **CDK content**: `new cdk.App(`, `new Stack(`, `extends Stack`, `stackName:`, `new Stage(`, `env:`, `CDK_DEFAULT_ACCOUNT`,
  `removalPolicy`, `RemovalPolicy.`, `RemovalPolicies.of`, `autoDeleteObjects`,
  `terminationProtection`, `overrideLogicalId`, `node.defaultChild`, `addPropertyOverride`,
  `CfnOutput`, `exportValue`, `Fn.importValue`, `CrossStackReferences`, `fromLookup`,
  `NodejsFunction`, `bundling:`, `Runtime.NODEJS_`, `logRetention`, `SecretValue.`,
  `unsafeUnwrap`, `Aspects.of`, `NagSuppressions`, `AwsSolutionsChecks`, `--hotswap`,
  `--require-approval never`.
- **SST files**: `sst.config.ts`, `sst-env.d.ts`, `.sst/`, saved `sst diff` output.
- **SST content**: `$config(`, `app(input)`, `removal:`, `protect:`, `home:`, `providers:`,
  `$app.stage`, `$dev`, `new sst.aws.` (`Function`, `Dynamo`, `Bucket`, `Vpc`, `Cluster`,
  `Aurora`, `Postgres`, `Router`, `Nextjs`, ...), `sst.Secret`, `sst.Linkable`, `link:`,
  `environment:`, `permissions:`, `transform:`, `$transform`, `$interpolate`, `$resolve`,
  `.apply(`, `.get(`, `from "sst"`, `Resource.`, `sst deploy`/`sst remove` in CI, `SST_STAGE`, `--stage`.
- **Application wiring** (only alongside IaC above): `process.env.*_TABLE*`, `process.env.*_BUCKET*`,
  `os.Getenv(`, string-literal resource names or ARNs passed to `@aws-sdk/client-*` commands or
  `github.com/aws/aws-sdk-go-v2/service/*` inputs (`TableName:`, `Bucket:`, `QueueUrl:`).

## Procedure

1. **Collect inputs.** Use the files you were given; when invoked directly with none, find them
   with the Signals. For a change, review the diff first, then read what it touches: the
   backend and provider blocks, the stack or `app()` that owns a changed resource, the
   handler code that reads the names the IaC injects. A plan or diff output, when present, is
   primary evidence for replacement and destruction. Done when you hold every file a finding
   could cite.
2. **Open only the relevant references** from the index below, chosen by the tools present.
3. **Apply every rule** of each opened reference to the files, then look past the rules for
   other IaC defects; report those with ID `NEW`.
4. **Verify each finding against the code.** Trace it: the resource is really stateful, the ID
   really changed in the diff (not only moved with a `moved` block, `Default` ID or
   `cdk refactor`), the stage expression really evaluates to the risky value for production,
   the secret really reaches the template or the state. Drop anything you cannot point to with
   `file:line`.
5. **Staleness.** Today minus 120 days is the cutoff. If a rule you used has an older
   **Last verified**, say "reference is stale, run /aws-refresh". For **Volatile: yes** rules,
   confirm the version, default or price live (AWS Knowledge / Documentation MCP if connected,
   otherwise WebFetch the rule's Source URL) before you report it.

## Output format

Each finding in the review output:

- **[<severity>] <ID or NEW> — <title>** (category)
- Evidence: `path/to/file:line` (+ quoted snippet)
- Scenario: concrete inputs/state → what goes wrong (or what it costs, with arithmetic and a link to the pricing page when it is cost)
- Fix: concrete change
- Source: <link>

Findings without concrete evidence in the reviewed files are dropped. Rank most severe first.
The reviewer only reports; it applies fixes only if the user asks afterwards. Write the report
in the language of the conversation.

## References

| File | Rules | Open when the files contain |
| --- | --- | --- |
| [references/terraform.md](references/terraform.md) | TF-001 – TF-028 | `*.tf`, `.terraform.lock.hcl`, plan output, or Go/TS code reading names a Terraform config injects |
| [references/cdk.md](references/cdk.md) | CDK-001 – CDK-023 | `aws-cdk-lib` imports, `cdk.json`, `cdk.context.json`, `cdk diff` output, CDK CLI flags in scripts or CI |
| [references/sst.md](references/sst.md) | SST-001 – SST-018 | `sst.config.ts`, `Resource.` from `"sst"`, `sst diff` output, `sst` commands in scripts or CI |
| [references/sources.md](references/sources.md) | — | A Source URL moved or a fact needs re-checking |
