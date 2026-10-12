# Expected findings — aws-networking

Fixture: a production stack (`local.env = "prod"`) with a Terraform VPC, ALB and Route 53 zone,
a Go web service behind the ALB, a CDK REST API with a Lambda TOKEN authorizer, and an SST app
with an HTTP API. Run: *"run aws-networking on aws-review/evals/aws-networking"*.

## Planted issues (12)

| # | Evidence | Rule | Why |
| --- | --- | --- | --- |
| 1 | `infra/network.tf:82` (NAT at `:70-71`) | NAT-001 | All three private route tables send `0.0.0.0/0` to one zonal NAT in `us-east-1a`: losing that AZ cuts egress for all AZs, and 2/3 of egress pays cross-AZ $0.01/GB each way. A finding that also cites VPC-015, or proposes NAT-003 (regional NAT) as the fix, is the same plant. |
| 2 | `infra/network.tf:117` (resource at `:114`) | VPC-004 | S3 is reached through an *Interface* endpoint (3 AZs × $0.01 × 730 = $21.90/month + $0.01/GB) by in-VPC workloads only; the S3 gateway endpoint is free. VPC-003 ("no S3 gateway endpoint") is accepted for the same plant. |
| 3 | `infra/network.tf:152` (rule at `:147-150`) | VPC-007 | PostgreSQL port 5432 on the DB security group is open to `0.0.0.0/0`; it should reference `aws_security_group.app`. |
| 4 | `infra/alb.tf:66` | ELB-001 | HTTPS listener pinned to `ELBSecurityPolicy-2016-08`, which still allows TLS 1.0/1.1; use `ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09`. |
| 5 | `infra/dns.tf:20-22` | R53-001 | `api.example.com` is a CNAME to the ALB DNS name: paid queries, no target-health evaluation; use an `A` alias. |
| 6 | `infra/dns.tf:34-43` | R53-004 | Failover PRIMARY record has no `health_check_id`, so Route 53 treats it as always healthy and never fails over to the SECONDARY. |
| 7 | `cdk/lib/reports-api-stack.ts:42` | APIGW-001 | REST API uses no REST-only feature (plain Lambda proxy routes, TOKEN authorizer, stage throttling — all available on HTTP API with a Lambda/JWT authorizer); HTTP API is $1.00 vs $3.50 per million. |
| 8 | `cdk/lib/reports-api-stack.ts:35` and `:54` | APIGW-002 | `GenerateReportFn` has a 2-minute timeout behind a REST integration with the default 29 s timeout (CDK `LambdaIntegration` default): clients get 504 while the Lambda keeps running; retries duplicate work. The expected fix is async (202 + job ID), which also stays valid after moving to an HTTP API (plant 7, 30 s hard cap); a quota raise or `STREAM` is acceptable only if the finding notes it keeps the API on REST. |
| 9 | `src/authorizer.ts:28` (caching from `cdk/lib/reports-api-stack.ts:38`) | APIGW-004 | The TOKEN authorizer returns a policy for `event.methodArn` only, and CDK `TokenAuthorizer` caches for 5 minutes by default: after `GET /reports`, a `POST /reports` with the same token gets 403 from the cached policy. |
| 10 | `sst.config.ts:37` (VPC at `:17`) | VPC-001 | `POST /orders` is attached to a VPC with a managed NAT although `src/orders/create.ts` only calls DynamoDB; it pays NAT (2 AZs ≈ $65.70/month + $0.045/GB) and ENI cold-start costs for nothing. NAT-002 on `:17` (managed NAT in every stage) or VPC-003 on `:17` (DynamoDB traffic from the VPC function goes through the NAT, no gateway endpoint) is accepted as part of the same plant. |
| 11 | `services/web/main.go:27` | ELB-003 | Go `IdleTimeout` 30 s is shorter than the ALB idle timeout (default 60 s, `infra/alb.tf:34` sets none): the server closes keep-alive connections the ALB still reuses → sporadic 502s. |
| 12 | `services/web/main.go:34` (used at `:45`) | ELB-016 | The admin allow-list trusts the **first** `X-Forwarded-For` entry, which the client controls behind an ALB in `append` mode: `X-Forwarded-For: 203.0.113.5` bypasses it. |

## Decoys (must NOT be flagged)

| Evidence | Why it is correct |
| --- | --- |
| `infra/network.tf:94-99` | DynamoDB **gateway** endpoint associated with every private route table — free and correct (not VPC-003/VPC-004). |
| `infra/dns.tf:5-15` | Apex record is an `A` **alias** to the ALB with `evaluate_target_health = true` (not R53-001/R53-002/R53-005). |

## Not planted (findings here are false positives)

- `infra/network.tf:139` — `0.0.0.0/0` **egress** on the app tier is acceptable (VPC-018 is low and only for data tiers).
- `infra/alb.tf:10-24` — `0.0.0.0/0` on 80/443 of an internet-facing ALB is intended; port 80 redirects (`:75-89`).
- `sst.config.ts:19-32` — CORS lists an explicit origin with credentials, and the stage sets throttling.
- `infra/alb.tf:44-60` — deregistration delay 30 s and a dedicated `/healthz` health check are deliberate.
