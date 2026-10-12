# aws-iac — expected findings

Fixture: a Terraform root (`terraform/`), a Go Lambda (`cmd/worker/`), a CDK app (`cdk/`) and
an SST app (`sst/`) for the same "orders" service. Production is `prod` everywhere: the CDK app
instantiates `Orders-prod`, and the SST workflow deploys `--stage prod`.

## Planted issues (12)

| # | Evidence | Rule | Why |
| --- | --- | --- | --- |
| 1 | `terraform/backend.tf:11` | TF-001 | `backend "s3"` has neither `use_lockfile = true` nor `dynamodb_table`: concurrent applies are not locked. |
| 2 | `terraform/main.tf:30` | TF-009 | `count = length(var.queue_names)` with `var.queue_names[count.index]`: removing `order-created` shifts indexes and recreates the other queues (in-flight messages lost). |
| 3 | `terraform/main.tf:52` | TF-016 | `aws_lambda_function.worker` uses `filename` from `archive_file` with no `source_code_hash`/`code_sha256`: new builds never deploy. |
| 4 | `terraform/main.tf:73` | TF-013 | `password = var.db_password` on `aws_db_instance`: stored in plaintext in state; `sensitive = true` on the variable does not prevent it. Use `manage_master_user_password` or `password_wo`. |
| 5 | `terraform/main.tf:98` | TF-015 | `aws_security_group.api` has an inline `ingress` block while `aws_vpc_security_group_ingress_rule.api_from_alb` (line 106) targets the same group: each apply removes the other's rule. |
| 6 | `cmd/worker/main.go:34` | TF-025 | `TableName: aws.String("orders-prod")` hardcoded although Terraform injects `ORDERS_TABLE` (main.tf environment block): dev and every other env write to the prod table. |
| 7 | `cdk/lib/orders-stack.ts:18` | CDK-001 | `RemovalPolicy.DESTROY` on the orders `TableV2` with no stage gate, and the stack is deployed as `Orders-prod` (`cdk/bin/app.ts:7`): a destroy or logical ID change deletes production data. |
| 8 | `cdk/lib/orders-stack.ts:27` | CDK-010 | `NodejsFunction` without `runtime`, and `cdk/cdk.json` lacks `@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion`: defaults to deprecated `NODEJS_16_X`. |
| 9 | `cdk/lib/orders-stack.ts:32` | CDK-012 | `stripe.secretValue.unsafeUnwrap()` into `environment`: the template gets a Secrets Manager dynamic reference that CloudFormation resolves into the Lambda environment in plaintext (readable with `lambda:GetFunctionConfiguration`, stale after rotation). |
| 10 | `sst/sst.config.ts:5` | SST-001 | `isProd` compares against `"production"`, but CI deploys `--stage prod` (`sst/.github/workflows/deploy.yml:25`): prod gets `removal: "remove"`, `protect: false`, the dev AWS profile (line 13) and no Dynamo deletion protection (line 21). One root cause; a report that cites lines 10, 13 or 21 under SST-001 or SST-002 counts as this hit. |
| 11 | `sst/sst.config.ts:35` | SST-006 | `STRIPE_KEY: process.env.STRIPE_KEY!` via `environment`: plaintext in function config and empty when the deploying shell lacks the variable. Use `sst.Secret` + `link`. |
| 12 | `sst/sst.config.ts:36` | SST-008 | `` `${api.url}/webhooks/stripe` `` template literal on an Output: the env var gets the stringified Output, not the URL. Use `$interpolate`. |

## Decoys (must NOT be flagged)

| Evidence | Pattern | Why it is correct |
| --- | --- | --- |
| `terraform/main.tf:90` | `ignore_changes = [task_definition]` on `aws_ecs_service.api` | CI deploys new task definitions; ignoring exactly that attribute is the documented narrow use (TF-012 allows it). |
| `sst/sst.config.ts:28` + `sst/src/orders.ts:12` | `link: [table]` and `TableName: Resource.Orders.name` | The recommended SST wiring (SST-005, SST-017): scoped permissions and per-stage name. |

## Also correct (not scored, but flagging them is a false positive)

- `terraform/main.tf:1-11` provider with `allowed_account_ids` and `default_tags`.
- `terraform/main.tf:13-27` table with `deletion_protection_enabled` and `prevent_destroy`; `terraform/main.tf:67-82` DB with `deletion_protection`, final snapshot and `prevent_destroy`.
- `cdk/bin/app.ts` explicit `env`, `terminationProtection`, cdk-nag aspect; `cdk/cdk.json` weak cross-stack references; `CheckoutLogs` log group with retention; `table.grantReadWriteData`.
- `sst/.github/workflows/deploy.yml` runs `sst diff` before `sst deploy` with a concurrency group, and passes `--stage prod` to both (SST-018 satisfied).

## Defensible but not scored (neither a hit nor a false positive)

- TF-004 on `terraform/backend.tf:11-16`: one backend key while the root takes `var.env`; the fixture does not show whether per-env `-backend-config` is used.
- TF-007 about a missing `.terraform.lock.hcl`: the fixture omits it on purpose to keep the tree small.
- SST-009 about the object form `providers.aws` without a version (`sst/sst.config.ts:13`): `version: "3.17.0"` is pinned; the narrowed rule does not require a provider pin.

Out of lane for aws-iac (hand off, not scored): the unauthenticated Stripe webhook route and
missing signature verification in `sst/src/stripe.ts` (→ `aws-security`).
