# aws-cost eval: expected findings

Fixture: a dev "orders" stack. Terraform VPC + ECS worker (`infra/network.tf`), a CDK checkout
API (`cdk/lib/api-stack.ts` + `src/handlers/checkout.ts`), an SST app with Aurora
(`sst.config.ts`) and a Go SQS/S3 ingest worker (`worker/main.go`). Prices are us-east-1 as of
2026-10-12.

A passing review reports every planted issue below (rule ID may be a close sibling if the
reasoning matches) and reports none of the decoys.

## Planted issues

| # | Evidence | Rule | Why |
| --- | --- | --- | --- |
| 1 | `infra/network.tf:47-48` (with `:3` env `dev`, `:8` three AZs) | COST-001 | Three NAT gateways (plus three EIPs at `:42-45`) in a dev VPC: 3 × $0.045 × 730 = $98.55/month + 3 × $3.65 IPv4; one NAT saves 2 × ($32.85 + $3.65) = $73.00/month. |
| 2 | `infra/network.tf:53-60` (no `aws_vpc_endpoint` anywhere) + `worker/main.go:59` | COST-002 | The ingest worker runs in private subnets (`infra/network.tf:99-100`) and downloads S3 objects; with no S3 gateway endpoint every GB pays NAT processing ($0.045/GB). |
| 3 | `infra/network.tf:69-71` | COST-014 | Flow-log log group has no `retention_in_days`, so logs never expire. |
| 4 | `infra/network.tf:73-75` | COST-021 | Flow logs with `traffic_type = "ALL"` go to CloudWatch Logs (default destination) instead of S3 / REJECT-only. |
| 5 | `infra/network.tf:97` | COST-031 | Dev queue worker runs on regular Fargate (`launch_type = "FARGATE"`); it already handles SIGTERM (`worker/main.go`), so Fargate Spot (up to 70% off) fits. |
| 6 | `cdk/lib/api-stack.ts:37` (and `:13`) | COST-026 | Both functions omit `architecture`, so they run x86_64; arm64 is 20% cheaper per GB-s. |
| 7 | `cdk/lib/api-stack.ts:37` (and `:13`) | COST-014 | Functions have neither `logGroup` nor `logRetention`; the auto-created `/aws/lambda/*` groups never expire. |
| 8 | `cdk/lib/api-stack.ts:50` | COST-059 | `LambdaRestApi` with plain proxy and no REST-only feature: HTTP API costs $1.00 vs $3.50 per million requests. |
| 9 | `cdk/lib/api-stack.ts:25` + `src/handlers/checkout.ts:29` | COST-060 | Short (1-minute timeout), all-Lambda/Pass checkout flow started once per API request on a Standard state machine (default type): ~6 transitions per checkout billed at $0.000025 each; Express fits. |
| 10 | `sst.config.ts:14` | COST-043 | `sst.aws.Aurora` with default scaling (min 0.5 ACU) in every stage: 0.5 × $0.12 × 730 = $43.80/month per dev/preview stage; use `min: "0 ACU"` outside production. |
| 11 | `src/handlers/checkout.ts:36-45` | COST-019 (also COST-020) | `UserId` dimension creates one custom metric per user ($0.30/metric-month), and `PutMetricData` is called synchronously on every request. |
| 12 | `src/handlers/checkout.ts:14-16` | COST-062 | `GetSecretValue` on every invocation ($0.05 per 10,000 calls + latency) instead of caching across invocations. |
| 13 | `worker/main.go:79` | COST-066 | `kms.Decrypt` per record inside the batch loop: one KMS request ($0.03/10,000) per record instead of envelope encryption with a reused data key. |

## Decoys (must NOT be flagged)

| Evidence | Looks like | Why it is correct |
| --- | --- | --- |
| `worker/main.go:44-56` | COST-062 secret per call | The DB secret is fetched once per process via `sync.Once` and reused. |
| `cdk/lib/api-stack.ts:21-23` | COST-014 missing retention | The state machine's log group has `RetentionDays.ONE_MONTH` and ERROR level. |
| `worker/main.go:92-96`, `:118-121` | COST-068 short polling / per-message deletes | The consumer long-polls (`WaitTimeSeconds: 20`), receives in batches of 10 and deletes with one `DeleteMessageBatch` per batch. |
| `sst.config.ts:19-25` | COST-026 x86 / COST-004 needless VPC | The function is `arm64`, and it is in the VPC because it links the Aurora database. |
| `sst.config.ts:8` | COST-075 retained stages | `removal` is `remove` for every non-production stage. |
| `sst.config.ts:12` | COST-001 NAT per AZ | `sst.aws.Vpc` with defaults creates no NAT gateway. |
