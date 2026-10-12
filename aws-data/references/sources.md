# Sources

Every official URL behind the aws-data rules, so they can be found again if a page moves.
All entries last verified 2026-10-12.

## DynamoDB — limits and API

- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html — item 400 KB, batch 25/100 and 16 MB, transactions 100 items / 4 MB, Query/Scan 1 MB, expression limits. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html — ConsistentRead not supported on GSIs (ValidationException), Limit before filter, LastEvaluatedKey, ScanIndexForward ordering, GSI queries cannot fetch non-projected attributes (Select). Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html — UnprocessedItems, retry with exponential backoff, whole-batch rejections. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html — 100 actions, 4 MB, ClientRequestToken valid 10 minutes, cancellation reasons. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ErrorHandling.html — batch operation error handling and retries. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html — filter costs the same capacity, Limit, pagination, parallel scan, consistent scan costs double. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html — eventual vs strong consistency. Last verified 2026-10-12.

## DynamoDB — modelling and writes

- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html — 3,000 RU / 1,000 WU per partition, uniform key design. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html — write sharding. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html — projections, GSI queries cannot fetch base-table attributes, GSI write cost, GSI throttling base-table writes, 100-byte index overhead. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html — conditional writes, atomic counters not idempotent, ReturnValuesOnConditionCheckFailure. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_ImplementingVersionControl.html — optimistic locking / concurrent updates. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-use-s3-too.html — large items and S3 offload. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ExpressionAttributeValues.html — expression attribute values. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html — reserved words need ExpressionAttributeNames. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/howitworks-ttl.html — TTL Number in epoch seconds, deletion "within a few days", free TTL deletes. Last verified 2026-10-12.

## DynamoDB — capacity, protection, cost

- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html — on-demand is default and recommended. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/AutoScaling.html — provisioned auto scaling. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/on-demand-capacity-mode-max-throughput.html — on-demand maximum throughput. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html — PITR, 1–35 day recovery period (default 35). Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.Basics.html — deletion protection. Last verified 2026-10-12.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.tableclasses.html — Standard-IA when storage > 50% of throughput cost; 2 class changes per 30 days. Last verified 2026-10-12.
- https://aws.amazon.com/dynamodb/pricing/on-demand/ — us-east-1: $0.625/M writes, $0.125/M reads, $0.25 (Standard) / $0.10 (IA) per GB-month, PITR $0.20/GB-month, transactions 2×. Last verified 2026-10-12.

## DynamoDB — Streams, SDKs, IaC

- https://docs.aws.amazon.com/lambda/latest/dg/services-dynamodb-errors.html — retries until expiry, bad record blocks shard up to one day, on-failure destinations. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/services-ddb-batchfailurereporting.html — ReportBatchItemFailures. Last verified 2026-10-12.
- https://docs.powertools.aws.dev/lambda/typescript/latest/features/idempotency/ — Powertools idempotency utility. Last verified 2026-10-12.
- https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html — Document client in SDK v3. Last verified 2026-10-12.
- https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-dynamodb — marshallOptions (removeUndefinedValues), paginateQuery/paginateScan. Last verified 2026-10-12.
- https://github.com/aws/aws-sdk-go-v2/tree/main/feature/dynamodb/attributevalue — Go marshalling, `dynamodbav` tags. Last verified 2026-10-12.
- https://github.com/aws/aws-sdk-go-v2/tree/main/feature/dynamodb/expression — Go expression builder. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table — `billing_mode` default PROVISIONED, `deletion_protection_enabled` default false, PITR off unless block set, `on_demand_throughput`, `table_class`. Last verified 2026-10-12.
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_dynamodb.TablePropsV2.html — TableV2 defaults (on-demand, PITR off, deletionProtection false, RETAIN). Last verified 2026-10-12.
- https://sst.dev/docs/component/aws/dynamo — SST Dynamo args (deletionProtection, globalIndexes projection default "all", ttl, stream). The page does not mention PITR or billing mode; the component source sets `billingMode: "PAY_PER_REQUEST"` and `pointInTimeRecovery: { enabled: true }`. Last verified 2026-10-12.
- https://sst.dev/docs/linking — SST resource linking (permissions + Resource). Last verified 2026-10-12.

## RDS / Aurora — connections

- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html — pooling, surge handling, limits (16 KB statement pins). Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html — pinning conditions per engine, init query, session pinning filters. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html — initialize DB connections outside the handler. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html — using Lambda with RDS. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html — RDS Data API. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.Endpoints.html — cluster, reader and instance endpoints. Last verified 2026-10-12.

## RDS / Aurora — availability and protection

- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html — RDS Multi-AZ. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraHighAvailability.html — failover < 60 s with replica, < 10 min recreate without. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html — automated backups and retention. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_DeleteInstance.html — deletion protection, final snapshot. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.DBInstance.Modifying.html — apply immediately vs maintenance window. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithParamGroups.html — default parameter groups cannot be modified. Last verified 2026-10-12.

## RDS / Aurora — security

- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html — storage encryption at creation only. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html — public accessibility. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html — RDS-managed master password. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html — IAM auth, 15-minute tokens. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Connecting.Go.html — IAM auth from Go. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html — TLS and CA bundles. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html — `rds.force_ssl` default 1 on PG 15+, 0 on ≤14. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-ssl-connections.require-ssl.html — `require_secure_transport`. Last verified 2026-10-12.
- https://docs.aws.amazon.com/codeguru/detector-library/go/sql-injection/ — SQL injection (Go). Last verified 2026-10-12.
- https://docs.aws.amazon.com/codeguru/detector-library/javascript/sql-injection/ — SQL injection (JavaScript/TypeScript). Last verified 2026-10-12.

## RDS / Aurora — storage, capacity, cost

- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html — gp3 3,000 IOPS baseline vs gp2 3 IOPS/GiB. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.Autoscaling.html — storage autoscaling. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.how-it-works.html — 0–256 ACU, ~2 GiB per ACU, version table. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html — auto-pause, ~15 s resume (30 s+ after 24 h), RDS Proxy prevents pause. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.setting-capacity.html — choosing min/max ACU. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.StorageReliability.html — Standard vs I/O-Optimized (25% rule, switch limits). Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/extended-support.html — Extended Support enrollment and charges. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html — RDS PostgreSQL standard support end dates (11/12/13 past; 14 ends 28 Feb 2027). Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MySQL.Concepts.VersionMgmt.html — RDS MySQL dates (5.7 and 8.0 in Extended Support; 8.0 from 1 Aug 2026). Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Types.html — DB instance class types. Last verified 2026-10-12.
- https://aws.amazon.com/blogs/database/leveling-up-amazon-rds-with-aws-graviton4-benchmarks/ — Graviton4 up to 29% better price/performance than Graviton3 (PostgreSQL, MySQL, MariaDB); no x86 comparison. Last verified 2026-10-12.
- https://aws.amazon.com/rds/mysql/pricing/ — Extended Support example (us-east-2): $0.100/vCPU-h in years 1–2, $0.200 from year 3; Multi-AZ is charged on the primary and each standby. Last verified 2026-10-12.
- https://aws.amazon.com/rds/aurora/pricing/ — Serverless v2 $0.12 (Standard) / $0.156 (I/O-Optimized) per ACU-h; storage $0.10 / $0.225 GB-month; I/O $0.20/M; Data API $0.35/M. Last verified 2026-10-12.

## RDS / Aurora — IaC

- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance — defaults: storage_encrypted false, deletion_protection false, backup_retention_period 0 (sent explicitly), autoscaling off, apply_immediately false, engine_lifecycle_support open-source-rds-extended-support. Its "gp2 if not" storage_type text is stale: the provider omits the argument and the API default applies. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonRDS/latest/APIReference/API_CreateDBInstance.html — API defaults: StorageType gp3 (io1 when Iops is set), BackupRetentionPeriod 1, unencrypted. Last verified 2026-10-12.
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html — defaults: GP2, multiAz false, unencrypted without key, SNAPSHOT removal, 1-day backups, changes applied immediately, engineLifecycleSupport unset (RDS default: Extended Support). Last verified 2026-10-12.
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseClusterProps.html — defaults: Serverless v2 min 0.5 / max 2 ACU, no readers. Last verified 2026-10-12.
- https://sst.dev/docs/component/aws/postgres — SST Postgres (multiAz false, proxy false, gp3). Last verified 2026-10-12.
- https://sst.dev/docs/component/aws/mysql — SST Mysql (version default "8.0.40", multiAz false, gp3). Last verified 2026-10-12.
- https://sst.dev/docs/component/aws/aurora — SST Aurora (scaling default 0–4 ACU, replicas 0, dataApi, proxy). Last verified 2026-10-12.
- https://sst.dev/docs/reference/config/ — SST app `removal` setting. Last verified 2026-10-12.

## ElastiCache

- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html — TLS opt-in for node-based, always on for serverless. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/at-rest-encryption.html — at-rest encryption. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/auth.html — AUTH tokens. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Clusters.RBAC.html — RBAC users and groups. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/AutoFailover.html — Multi-AZ, failover, data loss without replicas. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Replication.Redis-RedisCluster.html — cluster mode enabled vs disabled. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/BestPractices.Clients.Redis.Discovery.html — cluster-aware clients, backoff with jitter. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/BestPractices.Clients.Redis.Connections.html — connection pooling, 65,000 connections, 2.82 ms vs 0.21 ms. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/BestPractices.Clients.Redis.ClientTimeout.html — client timeouts. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WorkingWithRedis.html — overall best practices (avoid KEYS, use SCAN). Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/ParameterGroups.Engine.html — `maxmemory-policy` default volatile-lru, `reserved-memory-percent` 25. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Scaling-serverless.html — serverless usage limits, TTL-only eviction at limit. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/backups-automatic.html — automatic backups. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html — versions; Redis OSS 4/5 end of standard support 31 Jan 2026, v6 31 Jan 2027; rename-commands. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/extended-support.html — ElastiCache Extended Support. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/VersionManagement.HowTo.cross-engine-upgrade.html — Redis OSS → Valkey upgrade. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/CacheNodes.SupportedTypes.html — node types. Last verified 2026-10-12.
- https://aws.amazon.com/elasticache/pricing/ — Valkey 20% lower node price; serverless $0.084 (Valkey) vs $0.125 (Redis OSS) GB-h; 100 MB vs 1 GB minimum; Extended Support +80% / +160%. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_replication_group — `transit_encryption_enabled`, `automatic_failover_enabled` (default false), `snapshot_retention_limit`. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_serverless_cache — `cache_usage_limits`, `user_group_id`. Last verified 2026-10-12.
- https://sst.dev/docs/component/aws/redis — SST Redis (engine default "redis", cluster mode on, no replicas, TLS + auth on). Last verified 2026-10-12.
