# Terraform / OpenTofu with the AWS provider

Rules TF-001 – TF-028. Current at verification: Terraform 1.16.x, OpenTofu 1.10+,
`hashicorp/aws` 6.68.0. OpenTofu differences are called out where they change the verdict.

---

### TF-001 — Lock the S3 backend state
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** A `backend "s3"` block must enable locking: `use_lockfile = true` (S3 native locking, Terraform 1.10+), or `dynamodb_table` while migrating.
- **Why:** Without a lock, two `apply` runs (two engineers, or CI plus a laptop) read the same state and both write it back; the last writer wins, the other run's resources become orphaned or get recreated, and the state no longer matches the account.
- **Detect:** `backend "s3" {` with neither `use_lockfile` nor `dynamodb_table`; `use_lockfile = false` (the default is `false`); `-lock=false` in CI scripts or Makefiles.
- **Fix:**
  ```hcl
  terraform {
    backend "s3" {
      bucket       = "acme-tfstate-prod"
      key          = "orders/terraform.tfstate"
      region       = "us-east-1"
      encrypt      = true
      use_lockfile = true
    }
  }
  ```
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/backend/s3 , https://docs.aws.amazon.com/prescriptive-guidance/latest/terraform-aws-provider-best-practices/backend.html
- **Last verified:** 2026-10-12

### TF-002 — Migrate DynamoDB state locking to `use_lockfile` (Terraform only)
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform
- **Rule:** On Terraform, replace `dynamodb_table` with `use_lockfile = true` (both can be set during the migration, then drop the table). On OpenTofu, DynamoDB locking stays supported; do not flag it there.
- **Why:** HashiCorp states DynamoDB-based locking is deprecated and will be removed in a future minor version; a lock table is one more resource, IAM grant and bill to keep, and an upgrade can break `init` when it disappears.
- **Detect:** `dynamodb_table =` inside `backend "s3"` when the repo uses `terraform` (not `tofu`: check `.terraform-version`, `required_version`, CI using `hashicorp/setup-terraform` vs `opentofu/setup-opentofu`); an `aws_dynamodb_table` with `hash_key = "LockID"`.
- **Fix:** add `use_lockfile = true`, run `terraform init -reconfigure`, apply once with both, then remove `dynamodb_table` and the lock table.
- **Volatile:** yes
- **Source:** https://developer.hashicorp.com/terraform/language/backend/s3 , https://opentofu.org/docs/language/settings/backends/s3/
- **Last verified:** 2026-10-12

### TF-003 — Protect the state: encryption, versioning, no secrets in backend config
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform
- **Rule:** The state bucket must have versioning on and server-side encryption (`encrypt = true`, optionally `kms_key_id`), and backend credentials must come from the environment, never `-backend-config` literals or the block itself.
- **Why:** State stores every attribute in plaintext, including generated passwords; a deleted or corrupted state without versioning means re-importing everything by hand. Values passed by `-backend-config` or hardcoded in the block are copied into `.terraform/` and into plan files.
- **Detect:** `backend "s3"` without `encrypt = true`; the bucket's own config (often in a bootstrap stack) with no `aws_s3_bucket_versioning` `status = "Enabled"`; `access_key`/`secret_key`/`token` in the backend block; `-backend-config="secret_key=..."` in scripts. OpenTofu: no `terraform { encryption { ... } }` block while state holds secrets.
- **Fix:** enable `aws_s3_bucket_versioning` on the state bucket, set `encrypt = true` (+ `kms_key_id` when policy requires CMK), pass credentials via `AWS_PROFILE`/OIDC. On OpenTofu add client-side state encryption:
  ```hcl
  terraform {
    encryption {
      key_provider "aws_kms" "state" {
        kms_key_id = "alias/tfstate"
        region     = "us-east-1"
        key_spec   = "AES_256"
      }
      method "aes_gcm" "state" {
        keys = key_provider.aws_kms.state
      }
      state {
        method   = method.aes_gcm.state
        enforced = true
      }
    }
  }
  ```
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/backend/s3 , https://developer.hashicorp.com/terraform/language/state/sensitive-data , https://opentofu.org/docs/language/state/encryption/
- **Last verified:** 2026-10-12

### TF-004 — Give each environment its own backend, not only a workspace
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** Production state lives in its own backend (bucket or at least key and IAM boundary, ideally its own account); CLI workspaces alone are not the isolation for prod vs dev.
- **Why:** Workspaces share one backend and one set of credentials, so a developer who can plan dev can write prod state; one `terraform workspace select` mistake applies dev variables to prod.
- **Detect:** `terraform.workspace` used to pick account, sizes or names (`terraform.workspace == "prod" ? ...`); a single `backend "s3"` with no per-env `key`/bucket while `envs/prod`, `envs/dev` tfvars exist; CI running `terraform workspace select prod`.
- **Fix:** one root (or one `-backend-config=envs/prod.s3.tfbackend` partial config) per environment, with separate state buckets or keys guarded by different IAM roles; keep workspaces for short-lived copies of one environment.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/cli/workspaces , https://docs.aws.amazon.com/prescriptive-guidance/latest/terraform-aws-provider-best-practices/backend.html
- **Last verified:** 2026-10-12

### TF-005 — Never hardcode AWS credentials in provider or backend blocks
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform
- **Rule:** `provider "aws"` and `backend "s3"` take credentials from the environment (profile, SSO, OIDC role), never `access_key`/`secret_key` literals or tfvars.
- **Why:** The keys land in Git history, in `.terraform/` and in plan files; long-lived keys in a repo are the most common path to account takeover.
- **Detect:** `access_key =`, `secret_key =`, `token =` in `provider "aws"` or `backend "s3"`; `AKIA[0-9A-Z]{16}` anywhere in `*.tf`/`*.tfvars`; variables named `aws_secret_key`.
- **Fix:** remove the arguments, rotate the exposed key, and use `assume_role { role_arn = ... }` with credentials from `AWS_PROFILE` or GitHub OIDC. Hand off key rotation to `aws-security`.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs , https://developer.hashicorp.com/terraform/language/backend/s3
- **Last verified:** 2026-10-12

### TF-006 — Pin the provider to the intended account
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** Each environment's `provider "aws"` sets `allowed_account_ids` (or assumes an env-specific role) so a run against the wrong credentials fails before planning.
- **Why:** A stale `AWS_PROFILE` makes `apply` create a copy of prod in dev, or destroy dev resources from a prod plan; the provider check stops it in seconds.
- **Detect:** `provider "aws" {` with no `allowed_account_ids`/`forbidden_account_ids` and no `assume_role` in roots that deploy prod.
- **Fix:**
  ```hcl
  provider "aws" {
    region              = var.region
    allowed_account_ids = [var.account_id]
    assume_role { role_arn = "arn:aws:iam::${var.account_id}:role/terraform-deploy" }
  }
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- **Last verified:** 2026-10-12

### TF-007 — Constrain provider versions and commit the lock file
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** Root modules declare `required_providers` with `~>` bounds (e.g. `~> 6.0`) and commit `.terraform.lock.hcl`; reusable modules declare only a minimum (`>=`).
- **Why:** With no constraint and no lock file, the next `init` in CI pulls a new major provider (v5→v6 changed `region` handling and removed arguments) and the plan suddenly proposes replacements or fails.
- **Detect:** no `required_providers` block; `version` missing or `>= x` with no upper bound in a root; `.terraform.lock.hcl` listed in `.gitignore` or absent; `terraform init -upgrade` in CI.
- **Fix:**
  ```hcl
  terraform {
    required_version = ">= 1.11"
    required_providers {
      aws = { source = "hashicorp/aws", version = "~> 6.0" }
    }
  }
  ```
  and commit `.terraform.lock.hcl`; upgrade deliberately with `init -upgrade` in a reviewed PR.
- **Volatile:** yes
- **Source:** https://developer.hashicorp.com/terraform/language/expressions/version-constraints , https://developer.hashicorp.com/terraform/language/files/dependency-lock , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade
- **Last verified:** 2026-10-12

### TF-008 — Pin remote module sources
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform
- **Rule:** Registry modules set `version`; Git modules set `?ref=` to a tag or commit SHA.
- **Why:** The lock file does not record module versions; an unpinned module pulls whatever is on the default branch at `init`, so a change or a compromised upstream lands in prod without review.
- **Detect:** `module "..." { source = "terraform-aws-modules/...` with no `version`; `source = "git::...` or `github.com/...` without `?ref=`; `?ref=main`/`master`.
- **Fix:** `source = "git::https://github.com/acme/tf-modules.git//vpc?ref=v3.2.1"` or a commit SHA; registry: `version = "5.8.1"`.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/files/dependency-lock , https://docs.aws.amazon.com/prescriptive-guidance/latest/terraform-aws-provider-best-practices/structure.html
- **Last verified:** 2026-10-12

### TF-009 — Use `for_each` with stable keys instead of `count` over a list
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** When instances differ by something other than their index (names, configs from a list or map), use `for_each` keyed by a stable value; keep `count` for identical copies or a 0/1 toggle.
- **Why:** With `count = length(var.queues)`, removing the first element shifts every index, so Terraform destroys and recreates every following resource (queues lose messages, tables lose data, ARNs change for consumers).
- **Detect:** `count = length(var.` together with `var.<x>[count.index]` or `element(var.<x>, count.index)`; any `count.index` used to pick a name.
- **Fix:**
  ```hcl
  resource "aws_sqs_queue" "this" {
    for_each = toset(var.queue_names)
    name     = each.key
  }
  ```
  plus `moved` blocks (TF-010) from `aws_sqs_queue.this[0]` to `aws_sqs_queue.this["orders"]` so the switch itself replaces nothing.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/meta-arguments/for_each , https://developer.hashicorp.com/terraform/language/meta-arguments/count
- **Last verified:** 2026-10-12

### TF-010 — Add `moved` blocks when a resource address changes
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** Every rename, move into or out of a module, or `count`→`for_each` conversion in a diff ships with a `moved { from, to }` block.
- **Why:** Terraform tracks objects by address; a renamed block is planned as destroy-old plus create-new, which for a database, bucket or queue means data loss or downtime.
- **Detect:** in a diff, a `resource "<type>" "<old>"` removed and the same type with near-identical arguments added under a new name or inside a new `module`; plan output showing the pair `will be destroyed` / `will be created` for one logical resource; `terraform state mv` in scripts.
- **Fix:**
  ```hcl
  moved {
    from = aws_dynamodb_table.orders
    to   = module.orders.aws_dynamodb_table.this
  }
  ```
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/moved
- **Last verified:** 2026-10-12

### TF-011 — Guard stateful resources with `prevent_destroy` and the service's own protection
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** Production databases, tables, buckets with data, KMS keys and Cognito pools set `lifecycle { prevent_destroy = true }` and the resource's deletion protection (`deletion_protection = true` on `aws_db_instance`/`aws_rds_cluster` with `skip_final_snapshot = false`; `deletion_protection_enabled = true` on `aws_dynamodb_table`).
- **Why:** A replacement-forcing change (engine, key schema, name) or an accidental `destroy` deletes the data. `prevent_destroy` makes the plan fail, but it does not protect a resource whose block is deleted from the config, so the AWS-side flag is the second line.
- **Detect:** `aws_db_instance`, `aws_rds_cluster`, `aws_dynamodb_table`, `aws_s3_bucket`, `aws_kms_key`, `aws_cognito_user_pool`, `aws_efs_file_system` in a prod root without `prevent_destroy`; `deletion_protection` absent or `false` (default `false` on `aws_db_instance`) or `deletion_protection_enabled` absent on `aws_dynamodb_table`; `skip_final_snapshot = true` in prod.
- **Fix:**
  ```hcl
  resource "aws_db_instance" "main" {
    deletion_protection       = true
    skip_final_snapshot       = false
    final_snapshot_identifier = "main-final"
    lifecycle { prevent_destroy = true }
  }
  ```
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance
- **Last verified:** 2026-10-12

### TF-012 — Scope `ignore_changes` to attributes another system owns
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** `ignore_changes` lists only attributes that something else legitimately updates (CI-deployed `task_definition` or `image_uri`, autoscaled `desired_count`); never `all`, and never to silence a perpetual diff you have not explained.
- **Why:** `ignore_changes = all` means Terraform creates and destroys the resource but never updates it, so fixes in code (encryption, timeouts, policies) silently never reach AWS and drift grows unseen.
- **Detect:** `ignore_changes = all`; `ignore_changes` containing `tags`, `policy`, `environment`, `ingress` or security-relevant arguments; an `ignore_changes` added in the same diff that "fixes" a plan.
- **Fix:** name the narrow attribute (`ignore_changes = [task_definition]` on `aws_ecs_service` deployed by CI is fine); fix the root cause of perpetual diffs (TF-015, TF-022) instead of hiding them.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle
- **Last verified:** 2026-10-12

### TF-013 — Keep secrets out of state with write-only or service-managed arguments
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform
- **Rule:** Pass passwords and secret strings through write-only arguments (`password_wo` + `password_wo_version`, `secret_string_wo` + `secret_string_wo_version`, Terraform 1.11+) or let the service own them (`manage_master_user_password = true`); `sensitive = true` on a variable does not keep it out of state.
- **Why:** `password = var.db_password` is stored in plaintext in the state and plan; anyone with state read (CI logs, `terraform_remote_state` consumers, the bucket) has the database password.
- **Detect:** `password = var.`/`master_password =` on `aws_db_instance`/`aws_rds_cluster`; `secret_string = var.` on `aws_secretsmanager_secret_version`; `random_password` results fed into non-write-only arguments; `value = var.<secret>` on `aws_ssm_parameter` with `type = "SecureString"`.
- **Fix:**
  ```hcl
  resource "aws_db_instance" "main" {
    manage_master_user_password = true   # Secrets Manager owns and rotates it
  }
  # or, when you must supply it (hashicorp/random ephemeral resource, never stored):
  #   ephemeral "random_password" "db" { length = 32 }
  #   password_wo         = ephemeral.random_password.db.result
  #   password_wo_version = 1   # bump to rotate; store the value via secret_string_wo
  ```
  Hand off rotation and access to `aws-security`.
- **Volatile:** yes
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret_version , https://registry.terraform.io/providers/hashicorp/random/latest/docs/ephemeral-resources/password , https://developer.hashicorp.com/terraform/language/state/sensitive-data
- **Last verified:** 2026-10-12

### TF-014 — Mark secret outputs `sensitive` (or `ephemeral`)
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform
- **Rule:** Outputs that expose secrets, tokens or connection strings set `sensitive = true`; inside child modules, `ephemeral = true` keeps a value that comes from an ephemeral context out of state and plan (not allowed on root-module outputs).
- **Why:** Without it the value prints in plan/apply logs that CI keeps for months. `sensitive` only redacts display: the value stays in state and `terraform output -json`/`-raw` still prints it.
- **Detect:** `output "..." { value = ...password... | ...secret... | ...token... | ...connection_string... }` without `sensitive`; `terraform output -json` piped into logs in CI.
- **Fix:** `output "db_password" { value = ..., sensitive = true }`; better, output the secret's ARN and let consumers read Secrets Manager.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/values/outputs , https://developer.hashicorp.com/terraform/language/block/output
- **Last verified:** 2026-10-12

### TF-015 — Do not mix inline rules/policies with their standalone resources
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** Manage security group rules with `aws_vpc_security_group_ingress_rule`/`_egress_rule` (one CIDR each) and role policies with `aws_iam_role_policy`/`aws_iam_role_policy_attachment`; never combine those with inline `ingress`/`egress` blocks or the deprecated `inline_policy`/`managed_policy_arns` on the same object.
- **Why:** Both mechanisms claim exclusive ownership, so every apply removes what the other added: rules flap, traffic drops between applies, and plans never converge.
- **Detect:** `aws_security_group` with `ingress {`/`egress {` blocks and any `aws_vpc_security_group_*_rule` or `aws_security_group_rule` whose `security_group_id` points at it; `aws_iam_role` with `inline_policy`/`managed_policy_arns` plus an `aws_iam_role_policy*` for the same role.
- **Fix:**
  ```hcl
  resource "aws_security_group" "api" { vpc_id = var.vpc_id }
  resource "aws_vpc_security_group_ingress_rule" "https" {
    security_group_id = aws_security_group.api.id
    cidr_ipv4         = var.vpc_cidr
    ip_protocol       = "tcp"
    from_port         = 443
    to_port           = 443
  }
  ```
  Use `aws_iam_role_policies_exclusive` if you need exclusive inline-policy management.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role
- **Last verified:** 2026-10-12

### TF-016 — Make Lambda code changes visible to the plan
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** An `aws_lambda_function` deployed from a local `filename` sets `code_sha256` (preferred: it also catches out-of-band code changes) or `source_code_hash`, fed from `archive_file`'s `output_base64sha256`; with `s3_key` it uses a content-addressed key or `s3_object_version`.
- **Why:** Without a changing hash, the plan sees the same `filename` and reports no changes: the new build is never uploaded and prod keeps running the old code while CI is green.
- **Detect:** `aws_lambda_function` with `filename =` and no `source_code_hash`/`code_sha256`; `s3_bucket`/`s3_key` with a fixed key like `"lambda/latest.zip"` and no `s3_object_version`.
- **Fix:**
  ```hcl
  data "archive_file" "worker" {
    type        = "zip"
    source_file = "${path.module}/../build/bootstrap"
    output_path = "${path.module}/../build/worker.zip"
  }
  resource "aws_lambda_function" "worker" {
    filename         = data.archive_file.worker.output_path
    code_sha256      = data.archive_file.worker.output_base64sha256
    runtime          = "provided.al2023"
    handler          = "bootstrap"
  }
  ```
  Go functions need a binary named `bootstrap` on `provided.al2023`; runtime choice itself → `aws-compute`.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function , https://docs.aws.amazon.com/lambda/latest/dg/golang-package.html
- **Last verified:** 2026-10-12

### TF-017 — Derive account, region, partition and ARNs instead of hardcoding them
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** Build ARNs from resource attributes or `data.aws_caller_identity`, `data.aws_region`, `data.aws_partition`; never paste account IDs, regions or ARNs of resources the config manages.
- **Why:** A hardcoded prod ARN in a module deployed to dev grants dev access to prod (or breaks dev); a hardcoded `arn:aws:` breaks in GovCloud/China; a hardcoded ARN skips the dependency edge, so ordering bugs appear on first deploy.
- **Detect:** 12-digit literals in `*.tf` outside `allowed_account_ids`; `"arn:aws:` string literals for resources declared in the same config; `"us-east-1"` literals inside resources.
- **Fix:**
  ```hcl
  data "aws_caller_identity" "current" {}
  data "aws_partition" "current" {}
  locals {
    kms_arn = "arn:${data.aws_partition.current.partition}:kms:${var.region}:${data.aws_caller_identity.current.account_id}:alias/app"
  }
  # better: reference aws_kms_key.app.arn directly
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/partition
- **Last verified:** 2026-10-12

### TF-018 — Publish shared values instead of reading another state with `terraform_remote_state`
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform
- **Rule:** Share values between configurations through `aws_ssm_parameter` (or a data source on the real resource), not `data "terraform_remote_state"`.
- **Why:** The consumer needs read access to the whole producer state, which often contains secrets; the coupling also breaks when the producer renames an output.
- **Detect:** `data "terraform_remote_state"`; IAM for CI roles granting `s3:GetObject` on another stack's `*.tfstate`.
- **Fix:** producer writes `aws_ssm_parameter "vpc_id"`; consumer reads `data "aws_ssm_parameter" "vpc_id"` or `data "aws_vpc"` with a tag filter.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/state/remote-state-data
- **Last verified:** 2026-10-12

### TF-019 — Express dependencies with references, not `depends_on`
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** Use `depends_on` only for hidden dependencies Terraform cannot see; never on whole modules or on data sources by habit.
- **Why:** `depends_on` makes Terraform treat more values as unknown and defer data source reads to apply, so plans show `(known after apply)` everywhere and propose replacements of resources that did not change.
- **Detect:** `depends_on = [module.` on a `module` block or resource; `depends_on` inside `data "..."` blocks; plans full of `known after apply` for IDs that did not change.
- **Fix:** reference the attribute you actually need (`subnet_ids = module.network.private_subnet_ids`), which creates the edge implicitly.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/meta-arguments/depends_on , https://developer.hashicorp.com/terraform/language/data-sources
- **Last verified:** 2026-10-12

### TF-020 — Import and forget through config blocks, not ad-hoc state commands
- **Severity:** low
- **Category:** readability
- **Applies to:** Terraform
- **Rule:** Bring existing resources in with `import { to, id }` blocks (reviewed in a plan; `-generate-config-out` drafts the HCL) and stop managing one with `removed { from ... lifecycle { destroy = false } }` (check `required_version` supports the block), instead of `terraform import` / `terraform state rm` run by hand.
- **Why:** CLI state surgery is invisible to review and to other environments, and the same import has to be repeated per env; HashiCorp recommends `removed` over `terraform state rm` because it lets you preview the result in a plan.
- **Detect:** `terraform import`, `terraform state rm`, `terraform state mv` in READMEs, Makefiles, CI or runbooks for routine changes.
- **Fix:**
  ```hcl
  import {
    to = aws_s3_bucket.assets
    id = "acme-assets-prod"
  }
  removed {
    from = aws_s3_bucket.legacy
    lifecycle { destroy = false }
  }
  ```
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/import , https://developer.hashicorp.com/terraform/language/block/removed , https://developer.hashicorp.com/terraform/language/state/remove
- **Last verified:** 2026-10-12

### TF-021 — Keep `provider` blocks out of child modules
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** Child modules declare `required_providers` (and `configuration_aliases` when needed) but never `provider "aws" { ... }`; the root passes providers with `providers = { aws = aws.x }`.
- **Why:** A module with its own provider configuration cannot use `count`, `for_each` or `depends_on`, and removing it from the root fails because the provider would vanish together with its resources, leaving them unmanageable.
- **Detect:** `provider "aws" {` in any file under `modules/`; errors like "cannot be used with count because it contains a nested provider configuration".
- **Fix:** move the provider to the root; in the module `terraform { required_providers { aws = { source = "hashicorp/aws", version = ">= 6.0", configuration_aliases = [aws.replica] } } }`.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/modules/develop/providers , https://docs.aws.amazon.com/prescriptive-guidance/latest/terraform-aws-provider-best-practices/structure.html
- **Last verified:** 2026-10-12

### TF-022 — Put common tags in `default_tags`, once
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform
- **Rule:** Set organization tags (`Environment`, `Service`, `CostCenter`) in the provider's `default_tags`; per-resource `tags` only add or override keys.
- **Why:** Copy-pasted tag maps drift, so cost allocation reports miss resources; managing tags of a resource both on the resource and through a separate tag resource (`aws_ec2_tag` on an `aws_vpc`) produces a perpetual diff. `aws_autoscaling_group` does not receive `default_tags`.
- **Detect:** the same `tags = { Environment = ..., Project = ... }` map on many resources; `tags = local.common_tags` everywhere and no `default_tags`; `aws_autoscaling_group` relying on `default_tags` alone; `aws_ec2_tag` targeting a resource that also sets `tags`.
- **Fix:**
  ```hcl
  provider "aws" {
    default_tags { tags = { Environment = var.env, Service = "orders" } }
  }
  ```
  and an explicit `tag { ... propagate_at_launch = true }` on autoscaling groups.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/resource-tagging
- **Last verified:** 2026-10-12

### TF-023 — Write policies with `aws_iam_policy_document` or `jsonencode`, not heredoc JSON
- **Severity:** low
- **Category:** readability
- **Applies to:** Terraform
- **Rule:** Build IAM and resource policies with `data "aws_iam_policy_document"` or `jsonencode({...})`.
- **Why:** Heredoc JSON breaks on a trailing comma only at apply time, interpolates ARNs as raw strings, and whitespace differences cause noisy diffs that hide real permission changes in review.
- **Detect:** `policy = <<EOF` / `assume_role_policy = <<POLICY` / `<<-EOT` containing `"Statement"`.
- **Fix:**
  ```hcl
  data "aws_iam_policy_document" "read_orders" {
    statement {
      actions   = ["dynamodb:GetItem", "dynamodb:Query"]
      resources = [aws_dynamodb_table.orders.arn]
    }
  }
  ```
  Policy content → `aws-security`.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role
- **Last verified:** 2026-10-12

### TF-024 — Block plans that replace or destroy stateful resources
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** When plan output is in scope, every `-/+`, `must be replaced`, `forces replacement` or `will be destroyed` on a stateful resource needs an explanation in the change (intentional migration, `moved` block missing, immutable argument edited); unexplained ones are findings. Run `terraform plan -refresh-only` to review drift separately.
- **Why:** One innocuous-looking argument (a table `name`, an RDS `identifier`, a bucket name, `availability_zone`) forces replacement, and the apply deletes the data.
- **Detect:** plan text `# aws_dynamodb_table.* must be replaced`, `# forces replacement`, `-/+ resource`, `will be destroyed` for `aws_db_instance`, `aws_rds_cluster`, `aws_dynamodb_table`, `aws_s3_bucket`, `aws_efs_file_system`, `aws_kms_key`, `aws_cognito_user_pool`; JSON plans with `"actions": ["delete","create"]`.
- **Fix:** add the missing `moved` block, revert the immutable argument, or plan a data migration; add `prevent_destroy` (TF-011) so the plan fails next time.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle , https://developer.hashicorp.com/terraform/language/moved
- **Last verified:** 2026-10-12

### TF-025 — Inject resource names into code; never hardcode them in TS or Go
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, TypeScript, Go
- **Rule:** Code reads table, bucket, queue and topic names/URLs from configuration the IaC sets from resource attributes (Lambda `environment`, ECS task env, SSM); literals in SDK calls are findings.
- **Why:** A hardcoded `"orders-prod"` makes dev and PR environments write to prod, and any replacement or rename of the resource breaks the code at runtime with `ResourceNotFoundException`.
- **Detect:** TS: `TableName: "`, `Bucket: "`, `QueueUrl: "https://sqs.` in `@aws-sdk/client-*` command inputs. Go: `TableName: aws.String("`, `Bucket: aws.String("`, `QueueUrl: aws.String("` in `github.com/aws/aws-sdk-go-v2/service/*` inputs. Terraform side: `aws_lambda_function` with no `environment { variables = { ... = aws_dynamodb_table.x.name } }`.
- **Fix:**
  ```hcl
  environment { variables = { ORDERS_TABLE = aws_dynamodb_table.orders.name } }
  ```
  ```go
  table := os.Getenv("ORDERS_TABLE")
  if table == "" { log.Fatal("ORDERS_TABLE not set") }
  out, err := client.GetItem(ctx, &dynamodb.GetItemInput{TableName: aws.String(table), Key: key})
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function
- **Last verified:** 2026-10-12

### TF-026 — Use the per-resource `region` argument instead of a provider alias per region (provider v6+)
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform
- **Rule:** On `hashicorp/aws` 6.x, resources that only need a different region set `region = "..."` instead of declaring and threading one aliased provider per region.
- **Why:** Alias-per-region multiplies provider blocks, `providers = {}` maps and module plumbing; a forgotten `provider = aws.eu` silently creates the resource in the default region.
- **Detect:** several `provider "aws" { alias = "...", region = "..." }` blocks differing only in region, with `required_providers` already at `~> 6.`.
- **Fix:**
  ```hcl
  resource "aws_s3_bucket" "replica" {
    bucket = "acme-replica-eu"
    region = "eu-west-1"
  }
  ```
  Keep aliases when credentials or accounts differ.
- **Volatile:** yes
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/enhanced-region-support , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade
- **Last verified:** 2026-10-12

### TF-027 — Apply the reviewed saved plan, not a fresh one
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform
- **Rule:** CI applies production with `terraform plan -out=tfplan` reviewed and then `terraform apply tfplan`; never `terraform apply -auto-approve` that re-plans after the review, and treat the plan file as a secret artifact.
- **Why:** Without a saved plan, `apply` builds a new plan at apply time, so drift, a merged PR or a new provider default between review and apply lands unreviewed (including destroys). Plan files hold sensitive values in cleartext even when the terminal output hides them.
- **Detect:** workflows running `terraform apply -auto-approve` (or `tofu apply -auto-approve`) for prod without a saved plan argument; plan uploaded as a public or long-retention artifact; `terraform show -json tfplan` printed to logs.
- **Fix:**
  ```yaml
  - run: terraform plan -input=false -out=tfplan
  - run: terraform show -no-color tfplan > plan.txt   # attach for review
  # after approval, in the same pipeline run and workspace:
  - run: terraform apply -input=false tfplan
  ```
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/cli/commands/apply , https://developer.hashicorp.com/terraform/cli/commands/plan
- **Last verified:** 2026-10-12

### TF-028 — Do not add `create_before_destroy` to resources with fixed unique names
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** Use `create_before_destroy = true` only where the old and new object can coexist: use `name_prefix` (or no name) on resources whose names must be unique, and remember the setting propagates to the resource's dependencies.
- **Why:** On the next replacement Terraform creates the new object first; with a fixed `name` (security group, IAM role, launch template, target group, bucket) the create fails with a name conflict, the apply stops halfway, and the old object stays in place.
- **Detect:** `lifecycle { create_before_destroy = true }` on a resource that also sets a literal or per-env `name =` (`aws_security_group`, `aws_iam_role`, `aws_lb_target_group`, `aws_launch_template`, `aws_s3_bucket`, `aws_db_parameter_group`).
- **Fix:**
  ```hcl
  resource "aws_security_group" "api" {
    name_prefix = "orders-api-${var.env}-"
    vpc_id      = var.vpc_id
    lifecycle { create_before_destroy = true }
  }
  ```
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle
- **Last verified:** 2026-10-12
