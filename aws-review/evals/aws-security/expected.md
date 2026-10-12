# aws-security eval: expected findings

Fixture: an orders service with Terraform (`infra/main.tf`), a CDK stack
(`infra/reports-stack.ts` + `src/export.ts`), SST (`sst.config.ts` + `src/handler.ts`) and a Go
Lambda worker (`cmd/worker/main.go`). Run with *"run aws-security on aws-review/evals/aws-security"*.

## Planted issues (12)

Line numbers point at the line a correct finding should cite (± 2 lines is a match). Where two
IDs are listed, either counts.

| # | Evidence | Rule ID | Why |
| --- | --- | --- | --- |
| 1 | `infra/main.tf:47` | IAM-018 | GitHub OIDC trust for the prod deploy role uses `StringLike` `repo:acme/*`: any repository and any branch or PR workflow in the org can assume `gha-deploy-prod`. |
| 2 | `infra/main.tf:67-68` | IAM-005 | Deploy role has `iam:PassRole` on `*` together with `lambda:CreateFunction`/`UpdateFunctionConfiguration`, so a workflow can attach any role in the account to a function it controls (privilege escalation). |
| 3 | `infra/main.tf:100-105` | KMS-003 | SSE-KMS default encryption on the uploads bucket without `bucket_key_enabled = true`: one KMS request per object PUT/GET ($0.03 per 10,000). |
| 4 | `infra/main.tf:150` | EXP-003 | Postgres port 5432 open to `0.0.0.0/0` on the database security group. |
| 5 | `infra/main.tf:164` | EXP-004 | `publicly_accessible = true` on the RDS instance; with #4 the database login is reachable from the internet. |
| 6 | `infra/reports-stack.ts:24` | SEC-004 / SEC-001 | `secretValueFromJson('apiKey').unsafeUnwrap()` into `environment`: the template only holds a `{{resolve:secretsmanager:...}}` dynamic reference, but CloudFormation resolves it at deploy, so the partner API key is stored in plaintext in the Lambda configuration (readable via `lambda:GetFunctionConfiguration` and the console) and never picks up rotation. |
| 7 | `infra/reports-stack.ts:30` | EXP-005 | Function URL with `FunctionUrlAuthType.NONE`; `src/export.ts` does no authentication and returns any tenant's reports for a caller-supplied `tenantId`. |
| 8 | `sst.config.ts:29` | EXP-006 | `POST /admin/refunds` has no `auth` (SST routes are public by default) while the API already has a JWT authorizer used by the GET route; anyone can issue refunds. |
| 9 | `src/handler.ts:19` | SEC-012 | Logs the Stripe secret key and all request headers (including `Authorization`) to CloudWatch Logs. |
| 10 | `cmd/worker/main.go:22` | IAM-020 | Hardcoded access key pair via `credentials.NewStaticCredentialsProvider` instead of the Lambda role from the default chain. |
| 11 | `cmd/worker/main.go:28` | SEC-007 | `GetSecretValue` on every invocation (config and client also rebuilt per call in `handler`, line 48) with no cache: latency plus $0.05 per 10,000 calls. |
| 12 | `cmd/worker/main.go:39` | EXP-016 | `InsecureSkipVerify: true` on the partner HTTP client: the bearer token can be captured by anyone who can intercept TLS. |

## Decoys (must NOT be flagged)

| Evidence | Looks like | Why it is correct |
| --- | --- | --- |
| `infra/main.tf:130-137` | IAM-008 (service principal on a Lambda permission) | The S3 permission pins both `source_arn` and `source_account`, exactly as the confused-deputy guidance requires. |
| `infra/reports-stack.ts:28` | IAM-003 / IAM-004 (function data access) | `table.grantReadData(exportFn)` is the scoped, construct-managed grant the rules recommend. |

## Not expected

Also correct and should not produce findings: the uploads bucket's Block Public Access and
TLS-deny policy, KMS key rotation and 30-day window, `manage_master_user_password = true`,
the SST `sst.Secret` + `link` wiring, and the JWT-protected `GET /orders/{id}` route.
Low-severity KMS-002 (single data key) and IAM-016 (no Access Analyzer step in CI) remarks are
tolerated but not required.
