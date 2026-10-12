# Sources

Every official URL the aws-iac rules cite, grouped by topic. All Last verified 2026-10-12.
If a link moves, search the title on the same domain and update the rule's **Source** too.

## Terraform core (developer.hashicorp.com)

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://developer.hashicorp.com/terraform/language/backend/s3 | S3 backend: `use_lockfile` (default false), DynamoDB locking deprecated, `encrypt`, versioning warning, credentials in `-backend-config` leak into `.terraform` and plans | 2026-10-12 |
| https://developer.hashicorp.com/terraform/cli/workspaces | Workspaces share one backend; not an isolation boundary for separate credentials | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/expressions/version-constraints | `~>` in roots, minimum-only in reusable modules, pin third-party modules | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/files/dependency-lock | Commit `.terraform.lock.hcl`; lock file does not track module versions | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/meta-arguments/for_each | `for_each` stable keys, known-at-plan and non-sensitive requirements | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/meta-arguments/count | When to use `count` vs `for_each` | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/moved | `moved` blocks avoid destroy/recreate on renames and count→for_each | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle | `prevent_destroy` does not stop removal of the block, `ignore_changes = all`, `create_before_destroy` and unique-name constraints, propagation to dependencies | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/state/sensitive-data | State is plaintext; encrypt at rest; ephemeral values and write-only arguments | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/values/outputs | `sensitive` hides display only, still in state; `-json`/`-raw` reveal | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/block/output | `ephemeral` outputs only in child modules, never in the root module | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/state/remote-state-data | `terraform_remote_state` needs full state access; publish via SSM/S3 instead | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/meta-arguments/depends_on | `depends_on` as last resort; conservative plans, module impact | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/data-sources | Data source reads deferred to apply, `known after apply` cascade | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/import | `import` blocks, `-generate-config-out` | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/block/removed | `removed` block with `lifecycle { destroy = false }` (page states no minimum version) | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/state/remove | `removed` block recommended over `terraform state rm` because it can be previewed | 2026-10-12 |
| https://developer.hashicorp.com/terraform/cli/commands/apply | Automatic plan mode vs saved plan mode, `-auto-approve` caveat | 2026-10-12 |
| https://developer.hashicorp.com/terraform/cli/commands/plan | `-out` saved plans; sensitive values stored in cleartext in plan files | 2026-10-12 |
| https://developer.hashicorp.com/terraform/language/modules/develop/providers | Modules with provider blocks are incompatible with `count`/`for_each`/`depends_on` | 2026-10-12 |

## OpenTofu (opentofu.org)

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://opentofu.org/docs/language/settings/backends/s3/ | S3 backend: `use_lockfile`; DynamoDB locking fully supported, no deprecation planned | 2026-10-12 |
| https://opentofu.org/docs/language/state/encryption/ | Client-side state/plan encryption, `aws_kms` key provider, `aes_gcm`, `enforced` | 2026-10-12 |

## AWS provider for Terraform (registry.terraform.io, hashicorp/aws 6.68.0)

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs | Provider arguments: `allowed_account_ids`, `assume_role`, `default_tags` (not applied to `aws_autoscaling_group`), per-resource `region` override | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade | v6 breaking changes, per-resource `region` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/enhanced-region-support | Per-resource `region` argument in v6 | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/resource-tagging | Tagging guide; `aws_ec2_tag` plus parent `tags` = perpetual diff; `aws_autoscaling_group` excluded from `default_tags` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance | `password_wo` (Terraform 1.11+), `manage_master_user_password`, `deletion_protection` default false, `skip_final_snapshot` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret_version | `secret_string_wo` + `secret_string_wo_version` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group | Do not mix inline `ingress`/`egress` with rule resources; use `aws_vpc_security_group_*_rule` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role | `inline_policy` and `managed_policy_arns` deprecated and exclusive; use policy/attachment resources; `jsonencode`/`aws_iam_policy_document` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function | `code_sha256` (catches out-of-band changes) vs `source_code_hash` to trigger code updates | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/random/latest/docs/ephemeral-resources/password | Ephemeral `random_password` for write-only arguments (hashicorp/random 3.9.1) | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity | Account ID data source | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/partition | Partition data source for ARNs | 2026-10-12 |

## AWS Prescriptive Guidance for Terraform (docs.aws.amazon.com)

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/prescriptive-guidance/latest/terraform-aws-provider-best-practices/backend.html | S3 native locking recommended (Terraform 1.10+), DynamoDB deprecated, versioning, separate backends per environment | 2026-10-12 |
| https://docs.aws.amazon.com/prescriptive-guidance/latest/terraform-aws-provider-best-practices/structure.html | Module structure, no provider blocks in modules, pinned module sources, default tags, attachment resources | 2026-10-12 |

## AWS CDK v2 (docs.aws.amazon.com/cdk)

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/cdk/v2/guide/resources.html | Removal policies (CDK default RETAIN), `autoDeleteObjects`, cross-stack reference strength (strong/weak/both), deadly embrace, `exportValue` workaround | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/identifiers.html | Logical ID generation, `Default` ID heuristic, ID change = replacement | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/refactor.html | `cdk refactor` (preview, `--unstable=refactor`), refactor separate from other changes | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html | Don't change logical IDs of stateful resources, generated names, removal policies and log retention, separate stateful stacks with termination protection, commit `cdk.context.json`, synth-time decisions, grants, constructs vs stacks | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/context.html | Context caching, commit `cdk.json` and `cdk.context.json`, `cdk context --reset` | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/configure-env.html | Explicit `env` recommended for production; env-agnostic limits (no lookups, two AZs) | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/cfn-layer.html | Mixins, Facades (Grants), escape hatches, raw overrides bypass typing | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-deploy.html | `--hotswap` drift and not for production, `--express`, `--require-approval` default `broadening`, `--no-rollback`, `--revert-drift` | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-diff.html | `cdk diff --method` (`auto` default with template fallback, `change-set`, `template`), `--change-set` deprecated, `--fail`, `--security-only`, symbols | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.Stack.html | `stackName` defaults to the construct ID (top-level stacks) or a hashed construct path | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib-readme.html | `SecretValue` sources, `unsafePlainText`, unsafe-usage error at synth, dynamic references; `RemovalPolicies.of()`; `terminationProtection`; `AspectPriority` (same priority = no guaranteed order) | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html | `NodejsFunction` default runtime (`NODEJS_16_X` without `useLatestRuntimeVersion` flag), `@aws-sdk/*` externals, `bundleAwsSDK`, bundling options | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda-readme.html | `logRetention` legacy vs `logGroup`, `useCdkManagedLogGroup` flag | 2026-10-12 |

## cdk-nag (aws.amazon.com / docs.aws.amazon.com)

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://aws.amazon.com/blogs/devops/manage-application-security-and-compliance-with-the-aws-cloud-development-kit-and-cdk-nag/ | `AwsSolutionsChecks`, `NagSuppressions` with reasons | 2026-10-12 |
| https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/check-aws-cdk-applications-or-cloudformation-templates-for-best-practices-by-using-cdk-nag-rule-packs.html | cdk-nag rule packs pattern | 2026-10-12 |

## AWS Lambda (docs.aws.amazon.com)

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html | Deprecated: nodejs16.x 2024-06-12, nodejs18.x 2025-09-01, nodejs20.x 2026-04-30 (block create 2027-07-29, block update 2027-08-31); supported: nodejs22.x (deprecates 2027-04-30), nodejs24.x (2028-04-30); recommendation to package the SDK | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/golang-package.html | Go on `provided.al2023`, binary named `bootstrap` | 2026-10-12 |

## SST v3 (sst.dev)

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://sst.dev/docs/reference/config/ | `removal` values and default `retain` (keeps buckets/tables, removes the rest), applies also to resources removed from config on `sst deploy`/`sst dev`; `protect` makes `sst remove` error out; `providers` string version pinning; `version`; recommends no imports in `sst.config.ts` | 2026-10-12 |
| https://sst.dev/docs/components/ | `transform`, `$transform` ordering, Outputs with `$interpolate`/`.apply`/`$resolve`, renaming a component recreates it | 2026-10-12 |
| https://sst.dev/docs/linking/ | `link` injects values, generates types, grants permissions; `Linkable`, `Linkable.wrap`, `Linkable.env` | 2026-10-12 |
| https://sst.dev/docs/component/linkable/ | `Linkable.wrap` with `sst.aws.permission` include | 2026-10-12 |
| https://sst.dev/docs/component/secret/ | `sst.Secret`, `sst secret set`, `--fallback`, placeholder caveat, `Resource.X.value` | 2026-10-12 |
| https://sst.dev/docs/component/aws/function/ | Env vars 4 KB limit, `link` grants permissions, `url` default authorization `none`, defaults (Node 24, 1024 MB, 20 s, x86_64, 1-month log retention) | 2026-10-12 |
| https://sst.dev/docs/component/aws/dynamo/ | `deletionProtection`, stream, ttl | 2026-10-12 |
| https://sst.dev/docs/component/aws/aurora/ | Aurora transform keys (`cluster`, `instance`, ...), `.get()` across stages, pricing notes | 2026-10-12 |
| https://sst.dev/docs/component/aws/cluster/ | `Cluster.get()` for sharing an ECS cluster across stages | 2026-10-12 |
| https://sst.dev/docs/component/aws/vpc/ | `nat` options (`managed` ~$65/month for 2 AZs, `ec2`), `Vpc.get()` | 2026-10-12 |
| https://sst.dev/docs/share-across-stages/ | Share only expensive, non-pay-per-use resources across stages | 2026-10-12 |
| https://sst.dev/docs/iam-credentials/ | `providers.aws.profile` per stage | 2026-10-12 |
| https://sst.dev/docs/state/ | State bucket and SSM passphrase, do not delete passphrase, `sst refresh`, out-of-band changes | 2026-10-12 |
| https://sst.dev/docs/reference/cli/ | `sst diff`, `sst remove`, `sst unlock`, `sst refresh`; default stage = local username stored in `.sst/stage`; `--stage` and `SST_STAGE` | 2026-10-12 |
| https://sst.dev/docs/reference/sdk/ | `Resource` (Node) and `resource.Get` (Go, `github.com/sst/sst/v3/sdk/golang/resource`) | 2026-10-12 |
