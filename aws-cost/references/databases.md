# Databases

Prices below are us-east-1 as verified on 2026-10-12. Confirm them live before quoting.
Reference prices: DynamoDB on-demand Standard $0.625 per million WRU, $0.125 per million RRU;
Standard-IA $0.78 / $0.155; provisioned Standard $0.00065 per WCU-hour, $0.00013 per RCU-hour
(Standard-IA $0.00081 / $0.00016); storage Standard $0.25/GB-month, Standard-IA $0.10/GB-month;
reserved capacity up to 54% (1 yr) / 77% (3 yr) off provisioned. Aurora Serverless v2 $0.12 per
ACU-hour on Aurora Standard, $0.156 on I/O-Optimized (PostgreSQL and MySQL). The RDS Proxy
pricing table renders dynamically: the $0.015 per ACU-hour with an 8-ACU minimum below is SST's
figure; confirm it on the live page.

Hand off data modelling and query design to `aws-data`; here only the bill matters.

### COST-038 — Pick DynamoDB billing mode from the utilization breakeven
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Use on-demand for spiky, unknown or low traffic; use provisioned (with autoscaling) when average utilization of provisioned capacity would stay above ~29%.
- **Why:** One WCU fully used for an hour is 3,600 writes for $0.00065, i.e. $0.18 per million writes versus $0.625 on-demand: provisioned wins only above 0.18 ÷ 0.625 ≈ 29% average utilization (same ratio for reads). Terraform defaults `billing_mode` to `PROVISIONED`, so tables created without thinking pay for idle capacity.
- **Detect:** Terraform `aws_dynamodb_table` without `billing_mode` (default `PROVISIONED`) and fixed `read_capacity`/`write_capacity` on low-traffic tables; CDK `TableV2` with `billing: Billing.provisioned(...)` for dev/new tables (default is `Billing.onDemand()`); high, steady-traffic tables on `PAY_PER_REQUEST` with no comment on volume.
- **Fix:** Show the arithmetic with the table's real throughput; e.g. a table averaging 200 writes/s steady: on-demand 200 × 2,628,000 s ÷ 1M × $0.625 = $328.50/month; provisioned 300 WCU (≈67% util) × 730 × $0.00065 = $142.35/month.
  ```hcl
  billing_mode = "PAY_PER_REQUEST"
  ```
- **Volatile:** yes
- **Source:** https://aws.amazon.com/dynamodb/pricing/on-demand/ ; https://aws.amazon.com/dynamodb/pricing/provisioned/ ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table
- **Last verified:** 2026-10-12

### COST-039 — Never leave provisioned DynamoDB capacity without autoscaling
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Provisioned tables and GSIs have target-tracking autoscaling (or a documented reason for fixed capacity).
- **Why:** Fixed capacity sized for peak bills peak 24/7: 1,000 WCU fixed = 1,000 × 730 × $0.00065 = $474.50/month even at 3 a.m.; too low a fixed value throttles instead.
- **Detect:** Ignore tables whose fixed capacity is trivial (e.g. ≤ 25 RCU/WCU, inside the free tier). Flag `aws_dynamodb_table` with `billing_mode = "PROVISIONED"` (or unset) and no `aws_appautoscaling_target` for `dynamodb:table:WriteCapacityUnits` / `ReadCapacityUnits` (and per GSI `dynamodb:index:*`); CDK `Billing.provisioned({ readCapacity: Capacity.fixed(n), writeCapacity: Capacity.fixed(n) })`.
- **Fix:** CDK `writeCapacity: Capacity.autoscaled({ minCapacity: 5, maxCapacity: 500, targetUtilizationPercent: 70 })`; Terraform `aws_appautoscaling_target` + `aws_appautoscaling_policy` (TargetTrackingScaling).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/AutoScaling.html ; https://aws.amazon.com/dynamodb/pricing/provisioned/
- **Last verified:** 2026-10-12

### COST-040 — Use Standard-IA for storage-dominated tables
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Tables whose storage cost exceeds ~50% of their throughput cost (history, audit, archives) use the Standard-IA table class.
- **Why:** Storage drops from $0.25 to $0.10/GB-month while throughput gets ~25% dearer. A 2 TB order-history table with light traffic: 2,048 × ($0.25 − $0.10) = $307.20/month saved, minus the throughput premium.
- **Detect:** `aws_dynamodb_table` without `table_class` (default `STANDARD`) on tables named `*history*`, `*audit*`, `*archive*`, `*events*` or with TTL of months/years; CDK `TableV2` without `tableClass`.
- **Fix:** `table_class = "STANDARD_INFREQUENT_ACCESS"` / `tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS`. At most two class changes per 30 days.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.tableclasses.html ; https://aws.amazon.com/dynamodb/pricing/on-demand/
- **Last verified:** 2026-10-12

### COST-041 — Expire ephemeral items with TTL, not delete jobs
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Sessions, idempotency keys, caches, tokens and other short-lived items carry a TTL attribute and the table has TTL enabled.
- **Why:** TTL deletes do not consume write throughput; a cron that scans and deletes pays for the scan reads and every delete write, and without either, storage grows forever.
- **Detect:** Items written with `expiresAt`/`ttl` attribute but `aws_dynamodb_table` lacks `ttl { attribute_name = ... enabled = true }` (CDK `timeToLiveAttribute`, SST `ttl`); scheduled Lambdas doing `ScanCommand` + `DeleteItemCommand`/`BatchWriteItemCommand` by date; Go `dynamodb.NewScanPaginator` followed by `DeleteItem` in a cleanup job.
- **Fix:** `ttl { attribute_name = "expiresAt" enabled = true }` (epoch seconds, Number type); SST `ttl: "expiresAt"`; drop the cleanup job. Note: TTL deletion is asynchronous (typically within days); filter expired items on read.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html
- **Last verified:** 2026-10-12

### COST-042 — Project only what GSIs need
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** GSIs use `KEYS_ONLY` or `INCLUDE` projections unless queries really read every attribute.
- **Why:** Each write that touches a GSI is billed again for the index, sized by the projected item; `ALL` on large items multiplies write and storage cost per index.
- **Detect:** `global_secondary_index { projection_type = "ALL" }` on tables with large items or many GSIs; CDK `projectionType: ProjectionType.ALL` (CDK default is ALL); SST `globalIndexes` without `projection`.
- **Fix:** `projection_type = "INCLUDE"` with `non_key_attributes = [...]`, or `KEYS_ONLY` plus a `GetItem` for the rare full read. Hand off access-pattern design to `aws-data`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html ; https://aws.amazon.com/dynamodb/pricing/on-demand/
- **Last verified:** 2026-10-12

### COST-043 — Let idle Aurora Serverless v2 pause at 0 ACU
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Dev, preview and low-traffic internal Aurora Serverless v2 clusters set minimum capacity 0 ACU with an auto-pause interval; production keeps a non-zero minimum only when resume latency (~15 s, 30 s+ after 24 h paused) is unacceptable.
- **Why:** A 0.5 ACU floor bills 24/7: 0.5 × $0.12 × 730 = $43.80/month per cluster (SST default `min: "0.5 ACU"`); ten preview stages = $438/month for idle databases. At 0 ACU, instance charges stop while paused (storage still billed).
- **Detect:** Terraform `aws_rds_cluster` `serverlessv2_scaling_configuration { min_capacity = 0.5 }` (or higher) without `seconds_until_auto_pause` in non-prod; CDK `serverlessV2MinCapacity: 0.5`; SST `new sst.aws.Aurora(` without `scaling.min` or with `min: "0.5 ACU"` in non-prod. Also blockers: RDS Proxy attached (`proxy: true`), logical/binlog replication, global database primary — these keep instances awake.
- **Fix:**
  ```ts
  // SST
  new sst.aws.Aurora("Db", { engine: "postgres", scaling: $app.stage === "production" ? { min: "0.5 ACU", max: "8 ACU" } : { min: "0 ACU", max: "4 ACU", pauseAfter: "20 minutes" } });
  ```
  ```hcl
  serverlessv2_scaling_configuration { min_capacity = 0 max_capacity = 4 seconds_until_auto_pause = 1200 }
  ```
  Requires Aurora PostgreSQL ≥ 16.3/15.7/14.12/13.15 or Aurora MySQL ≥ 3.08.0; add connection retries.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html ; https://sst.dev/docs/component/aws/aurora ; https://aws.amazon.com/rds/aurora/pricing/
- **Last verified:** 2026-10-12

### COST-044 — Opt out of RDS Extended Support unless you mean to pay for it
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** RDS for MySQL/PostgreSQL and Aurora clusters declare `engine_lifecycle_support` explicitly; old major versions are upgraded rather than silently enrolled.
- **Why:** The default (`open-source-rds-extended-support`) auto-enrolls databases past end of standard support and bills per vCPU-hour (per ACU-hour for Serverless), including Multi-AZ standbys, which can exceed the instance price itself.
- **Detect:** `aws_db_instance` / `aws_rds_cluster` without `engine_lifecycle_support` and with an old `engine_version` (e.g. MySQL 5.7, PostgreSQL 11/12, check the current calendar); CDK `rds.DatabaseInstance` / `DatabaseCluster` with `engineLifecycleSupport` unset and an old `version`.
- **Fix:** `engine_lifecycle_support = "open-source-rds-extended-support-disabled"` plus an upgrade plan; if extended support is a conscious bridge, write the end date and monthly cost in the PR.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/extended-support.html ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/extended-support-charges.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance
- **Last verified:** 2026-10-12

### COST-045 — Drop Multi-AZ and replicas in non-production
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Dev/test databases run single-AZ with no read replicas unless the environment exists to test failover.
- **Why:** Multi-AZ RDS bills a standby instance (roughly doubling the instance line); an Aurora reader in dev doubles compute for no traffic.
- **Detect:** `aws_db_instance` `multi_az = true` in dev tfvars; `aws_rds_cluster_instance` `count = 2+` in non-prod; CDK `multiAz: true` or `readers: [...]` in dev stacks; ElastiCache `num_cache_clusters > 1` in dev.
- **Fix:** Drive `multi_az` / reader count from the stage. Record the trade-off for `aws-data`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/rds/pricing/ ; https://aws.amazon.com/rds/aurora/pricing/
- **Last verified:** 2026-10-12

### COST-046 — Use gp3 storage for RDS instances
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** RDS instances use `gp3` storage unless a measured need requires io1/io2.
- **Why:** Terraform defaults `storage_type` to `gp2` when `iops` is not set (`io1` if it is). gp2 IOPS scale with size (3 IOPS/GiB), so teams oversize volumes to buy IOPS; gp3 includes a baseline of IOPS and throughput independent of size and lets you buy extra IOPS separately. The saving is the storage you stop over-provisioning (and any io1 you no longer need), not a lower per-GB rate; compare both lines on the live RDS pricing page.
- **Detect:** `aws_db_instance` without `storage_type` or with `"gp2"`; `io1` with low `iops`; CDK `storageType: rds.StorageType.GP2` or unset on older constructs.
- **Fix:** `storage_type = "gp3"` (modify in place; check the storage-optimization window).
- **Volatile:** yes
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html ; https://aws.amazon.com/rds/pricing/
- **Last verified:** 2026-10-12

### COST-047 — Match Aurora storage configuration to I/O spend
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Aurora clusters whose I/O is 25% or more of their Aurora spend use I/O-Optimized; below that, Standard.
- **Why:** AWS states I/O-Optimized is the better choice at ≥25% I/O share (no per-request I/O charges, higher instance/storage price). Write-heavy clusters on Standard pay a growing I/O line; light clusters on I/O-Optimized overpay.
- **Detect:** `aws_rds_cluster` without `storage_type` (Standard) on write-heavy workloads (queues in tables, high-churn OLTP), or `storage_type = "aurora-iopt1"` on dev/light clusters; CDK `storageType: rds.DBClusterStorageType.AURORA_IOPT1`.
- **Fix:** Check the cluster's I/O share in Cost Explorer; set `storage_type = "aurora-iopt1"` or remove it. Standard → I/O-Optimized is allowed once per 30 days.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.StorageReliability.html ; https://aws.amazon.com/rds/aurora/pricing/
- **Last verified:** 2026-10-12

### COST-048 — Add RDS Proxy only where connection churn needs it
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** RDS Proxy is added for Lambda-heavy or connection-storm workloads in production, not by default in every stage.
- **Why:** For Aurora Serverless the proxy bills a minimum of 8 ACUs: 8 × $0.015 × 730 = $87.60/month per stage, and it prevents Aurora auto-pause (COST-043).
- **Detect:** SST `sst.aws.Aurora` / `sst.aws.Postgres` with `proxy: true` in all stages; Terraform `aws_db_proxy` without stage condition; CDK `cluster.addProxy(` in dev stacks.
- **Fix:** Enable the proxy only in production, or use the RDS Data API for low-volume Lambda access.
- **Volatile:** yes
- **Source:** https://sst.dev/docs/component/aws/aurora ; https://aws.amazon.com/rds/proxy/pricing/
- **Last verified:** 2026-10-12

### COST-049 — Keep DynamoDB Scan out of request paths
- **Severity:** high
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Request handlers use `Query`/`GetItem` on keys or indexes; `Scan` is reserved for offline jobs.
- **Why:** Scan reads (and bills) the whole table before filters apply: a 10 GB table costs ~1.31M RRUs per eventually consistent full scan (10 GiB ÷ 4 KB ÷ 2) ≈ $0.16 on-demand; called 1,000 times a day that is 30,000 × $0.164 ≈ $4,915/month.
- **Detect:** TS `new ScanCommand(` / `paginateScan(` inside an API handler, often with `FilterExpression`; Go `dynamodb.NewScanPaginator(` or `client.Scan(ctx,` in HTTP/Lambda handlers.
- **Fix:** Add a GSI for the access pattern and `Query` it; hand off modelling to `aws-data`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/dynamodb/pricing/on-demand/ ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html
- **Last verified:** 2026-10-12
