# aws-data eval — expected findings

Run: *"run aws-data on aws-review/evals/aws-data"*. Treat the fixture as a production stack.

## Planted issues (12)

1. `terraform/dynamodb.tf:1` → **DDB-014** → `aws_dynamodb_table.orders` has no `point_in_time_recovery` block, so PITR is off (Terraform default) on the production orders table; a bad write or delete is unrecoverable.
2. `terraform/dynamodb.tf:32` → **DDB-013** → GSI `byStatus` uses `status` (a handful of values) as its partition key; every write of a `SHIPPED`/`PENDING` order lands on one GSI partition (1,000 WU/s cap), and GSI throttling back-pressures base-table writes. `src/orders/export.ts:10` may be cited as supporting evidence.
3. `terraform/rds.tf:14` → **RDS-015** → RDS for MySQL `8.0.40`: 8.0 left standard support on 31 Jul 2026, so the instance is billed Extended Support from 1 Aug 2026 ($0.100/vCPU-hour in years 1–2 in the pricing page's example Region; db.r8g.large has 2 vCPU, and with `multi_az = true` the standby is charged too → about 2 × 2 × 0.100 × 730 ≈ $292/month; confirm the Region's rate on the pricing page). Also accept mentions of `aws_db_parameter_group` family `mysql8.0` (line 3) and the missing `engine_lifecycle_support` as part of this finding.
4. `terraform/rds.tf:31` → **RDS-005** → `backup_retention_period = 0` disables automated backups and point-in-time restore (and blocks the blue/green upgrade the RDS-015 fix needs).
5. `src/orders/list.ts:15` → **DDB-001** → single `QueryCommand`, `result.Items` used at line 25 with no `LastEvaluatedKey` loop; customers with more than 1 MB of orders get a wrong `orderCount` and `lifetimeTotal`.
6. `src/orders/import.ts:20` → **DDB-002** → `BatchWriteCommand` response is ignored; throttled puts come back in `UnprocessedItems` and are silently dropped while `importOrders` reports them as imported.
7. `src/sessions/create.ts:22` → **DDB-011** → `expiresAt: Date.now() + ...` stores milliseconds; TTL reads it as epoch seconds (~1.8e12 s, about 57,000 years ahead), so sessions never expire.
8. `go/inventory/reserve.go:62` → **DDB-008** → `GetItem` (line 43) then unconditional `SET stock = :stock` computed in code (line 65); two concurrent checkouts both read 1 unit and both succeed (oversell / lost update).
9. `go/reports/handler.go:38` → **RDS-002** → `sql.Open` inside the Lambda handler with `defer db.Close()` (line 42): a new pool and a TLS + IAM handshake to the proxy on every request instead of one reused connection per environment.
10. `infra/cache-stack.ts:24` → **ECH-001** → `CfnReplicationGroup` has no `transitEncryptionEnabled: true`; traffic is plaintext, and associating the RBAC `userGroupIds` (line 38) requires in-transit encryption, so the stack fails to deploy as written. The client at `src/cache/profile.ts:3` also connects without `tls`.
11. `src/cache/profile.ts:3` → **ECH-005** → `new Redis(...)` (standalone ioredis client) against a cluster-mode-enabled group (`clusterMode: "enabled"`, `numNodeGroups: 2`, configuration endpoint); keys on the other shard fail with `MOVED`. Missing `username`/`password` for the RBAC user group may be reported as part of this finding.
12. `src/cache/profile.ts:29` → **ECH-006** → `redis.set(key, value)` without `EX`; the group uses `default.valkey8.cluster.on` (`maxmemory-policy` `volatile-lru`), so these keys are never evicted and writes fail with OOM once memory fills.

## Decoys (must NOT be flagged)

- `sst.config.ts:12` — `sst.aws.Dynamo("Sessions")` has no explicit PITR setting. The SST component enables point-in-time recovery and on-demand billing itself (hard-coded in the component source; the sst.dev page does not document it), and sets `deletionProtection` in production with `removal: "retain"`. Flagging DDB-014, DDB-015 or DDB-017 here is a false positive.
- `src/orders/export.ts:10` — `paginateQuery` over the `byStatus` GSI loops every page, does not set `ConsistentRead`, and reads only `customerId`, `total` (both in `non_key_attributes`) and `createdAt` (the index sort key). Flagging DDB-001, DDB-005, DDB-006 or DDB-027 here is a false positive (citing it only as evidence for DDB-013 is fine).

## Also correct on purpose (flagging them is a false positive)

- `terraform/dynamodb.tf`: on-demand billing, deletion protection plus `prevent_destroy`, `INCLUDE` projection.
- `terraform/rds.tf`: Multi-AZ, gp3, storage autoscaling, encryption, private, managed master password, `require_secure_transport`, deletion protection with final snapshot, RDS Proxy with `require_tls` and IAM auth (so no RDS-001, RDS-006 to RDS-012).
- `src/orders/import.ts`: chunks of 25 and dedupe by `orderId` (no DDB-003).
- `src/sessions/create.ts`: `attribute_not_exists(pk)` on create, SST `link` (no DDB-007, DDB-023).
- `src/cache/profile.ts`: module-scope client with timeouts (no ECH-008, ECH-009).
- `go/reports/handler.go`: placeholders with `interpolateParams=true` (no RDS-022, RDS-003), IAM token generated per connection (no RDS-016).

## Neutral (neither counted nor penalised)

- `terraform/dynamodb.tf:3` — **DDB-026** (no `on_demand_throughput` cap). Nothing in the fixture shows the table is reachable from untrusted traffic, so a low-severity mention is tolerated but not expected.
