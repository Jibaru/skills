# RDS and Aurora rules

Connections, availability, backups, protection, storage, engine lifecycle and cost for Amazon
RDS (PostgreSQL, MySQL, MariaDB) and Amazon Aurora (provisioned and Serverless v2).

### RDS-001 — Put RDS Proxy (or the Data API) between Lambda and the database
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Lambda functions that open SQL connections must connect through an RDS Proxy endpoint, or use the RDS Data API (Aurora). Direct connections from Lambda to the instance or cluster endpoint are acceptable only with low, capped concurrency (reserved concurrency set).
- **Why:** Each Lambda execution environment holds its own connection. A burst of 1,000 concurrent invocations opens 1,000 connections, exhausts `max_connections`, and the database rejects traffic or runs out of memory. A proxy pools and multiplexes connections, queues excess ones, and shortens failover (it bypasses DNS caches).
- **Detect:** A Lambda (`aws_lambda_function`, `new lambda.Function`/`NodejsFunction`, `sst.aws.Function`) whose code imports `pg`, `postgres`, `mysql2`, `knex`, `drizzle-orm/node-postgres`, `@prisma/client`, `github.com/jackc/pgx`, `github.com/go-sql-driver/mysql`, `database/sql`, and connects to `aws_db_instance.*.address`/`endpoint`, `aws_rds_cluster.*.endpoint`, `instance.dbInstanceEndpointAddress`, `cluster.clusterEndpoint.hostname`, while there is no `aws_db_proxy`, `DatabaseProxy`/`addProxy(`, SST `proxy: true`, and no `reserved_concurrent_executions` / `reservedConcurrentExecutions` cap.
- **Fix:**
  ```ts
  const proxy = cluster.addProxy("Proxy", { secrets: [cluster.secret!], vpc, requireTLS: true, iamAuth: true });
  proxy.grantConnect(fn, "app_user");
  // SST
  const db = new sst.aws.Postgres("Db", { vpc, proxy: true });
  ```
  Or, for low-volume Aurora access, `enable_http_endpoint = true` and `@aws-sdk/client-rds-data`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html ; https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraHighAvailability.html#Concepts.AuroraHighAvailability.Proxy ; https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html
- **Last verified:** 2026-10-12

### RDS-002 — Create the DB client once per execution environment and keep its pool tiny
- **Severity:** high
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** In Lambda, create the pool/client at module scope (Go: package-level or in `init`/`main`), reuse it across invocations, cap it at 1–2 connections, and do not close it at the end of each invocation.
- **Why:** Connecting inside the handler adds a TCP + TLS + auth handshake to every request and churns connections on the server; closing it per invocation throws that work away. A large pool per environment multiplies connections by concurrency (`max: 10` × 200 environments = 2,000 connections).
- **Detect:** TS: `new Pool(`, `new Client(`, `createConnection(`, `createPool(`, `postgres(` inside `export const handler = async`/`export async function handler`; `await client.end()`/`pool.end()` in the handler; `max:`/`connectionLimit:` above 2 in Lambda code. Go: `sql.Open(`/`pgxpool.New(` inside the handler func; no `db.SetMaxOpenConns(` in Lambda code.
- **Fix:**
  ```ts
  const pool = new Pool({ host: process.env.DB_HOST, max: 1, idleTimeoutMillis: 120_000, ssl: { rejectUnauthorized: true } });
  export const handler = async (event) => { const { rows } = await pool.query("SELECT ...", [id]); return rows; };
  ```
  ```go
  var db *sql.DB
  func init() { db, _ = sql.Open("pgx", dsn); db.SetMaxOpenConns(1); db.SetConnMaxIdleTime(2 * time.Minute) }
  ```
  Hand off general Lambda init and SDK client reuse to `aws-compute`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html#function-code ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html
- **Last verified:** 2026-10-12

### RDS-003 — Avoid session pinning through RDS Proxy
- **Severity:** medium
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Behind RDS Proxy, avoid per-session state: `SET` statements, temp tables, `LISTEN`, session advisory locks, statements over 16 KB, and (MySQL) server-side prepared statements. Move fixed session settings into the proxy's initialization query.
- **Why:** A pinned client connection keeps a dedicated database connection until it disconnects, so the proxy stops multiplexing and you are back to one DB connection per Lambda, paying for the proxy without its benefit.
- **Detect:** `SET search_path`, `SET TIME ZONE`, `SET statement_timeout`, `set_config(`, `CREATE TEMP TABLE`, `pg_advisory_lock(` (non-xact), `LISTEN ` on each request; MySQL: `mysql2` `.execute(` (binary-protocol prepared statements), Go `go-sql-driver/mysql` DSN without `interpolateParams=true` while using `?` placeholders; very large generated SQL (bulk `INSERT ... VALUES` over 16 KB). Proxy CloudWatch metric to cite in the fix: `DatabaseConnectionsCurrentlySessionPinned`.
- **Fix:** Put session settings in the proxy `init_query` (Terraform `aws_db_proxy_default_target_group.connection_pool_config.init_query`; CDK `initQuery`); use `pg_advisory_xact_lock`; use `mysql2` `.query(sql, params)` or `interpolateParams=true`; for MySQL, `session_pinning_filters = ["EXCLUDE_VARIABLE_SETS"]` when safe.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html
- **Last verified:** 2026-10-12

### RDS-004 — Run production databases across two Availability Zones
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Production RDS instances need `multi_az = true`. Production Aurora clusters need at least one reader in a different AZ (promotion tier 0–1 for Serverless v2 so it scales with the writer).
- **Why:** A single-AZ RDS instance is down for the whole host or AZ recovery. An Aurora cluster with no replica recreates the writer in the same AZ, which typically takes under 10 minutes, and cannot recover by itself from an AZ outage. With a replica, failover is typically under 60 s, often under 30 s.
- **Detect:** Terraform `aws_db_instance` without `multi_az = true`; `aws_rds_cluster` with only one `aws_rds_cluster_instance` (or `count = 1`). CDK `DatabaseInstance` without `multiAz: true` (default false); `DatabaseCluster` with `writer` and no `readers` (default none). SST `sst.aws.Postgres`/`sst.aws.Mysql` without `multiAz: true` (default false); `sst.aws.Aurora` with `replicas` absent or 0 (default 0). Skip non-production stages.
- **Fix:**
  ```ts
  new rds.DatabaseCluster(this, "Db", { engine, vpc, writer: rds.ClusterInstance.serverlessV2("writer"),
    readers: [rds.ClusterInstance.serverlessV2("reader", { scaleWithWriter: true })] });
  ```
  Multi-AZ roughly doubles instance cost; let `aws-cost` weigh it, and list it as a trade-off.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html ; https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraHighAvailability.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseClusterProps.html ; https://sst.dev/docs/component/aws/postgres
- **Last verified:** 2026-10-12

### RDS-005 — Keep automated backups on with a real retention period
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Set `backup_retention_period` explicitly to 7 days or more for production (1–35). Zero disables automated backups and point-in-time restore.
- **Why:** With retention 0 there is no point-in-time restore: an accidental `DELETE`, a bad migration or corruption means data loss back to the last manual snapshot (if any). Read replicas and blue/green deployments also require retention above 0.
- **Detect:** Terraform `aws_db_instance` with `backup_retention_period = 0` or the argument absent (the provider sends 0 when it is omitted, overriding the RDS API default of 1); `aws_rds_cluster` with `backup_retention_period = 1` (default) in production. CDK `backupRetention: Duration.days(0)` or relying on the 1-day default for production.
- **Fix:** `backup_retention_period = 14`; CDK `backupRetention: Duration.days(14)` / `backup: { retention: Duration.days(14) }`. Cross-account copies are a job for `aws-security`/AWS Backup.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance#backup_retention_period ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html
- **Last verified:** 2026-10-12

### RDS-006 — Turn on deletion protection and keep a final snapshot
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Production databases need deletion protection and must take a final snapshot when deleted or replaced.
- **Why:** Many attributes force replacement (identifier, engine, some storage changes). Without protection, one `terraform apply`, `cdk deploy` or `sst remove` deletes the database; with `skip_final_snapshot = true` there is nothing to restore.
- **Detect:** Terraform `aws_db_instance`/`aws_rds_cluster` without `deletion_protection = true` (default false) or with `skip_final_snapshot = true`; no `lifecycle { prevent_destroy = true }`. CDK `removalPolicy: RemovalPolicy.DESTROY`, or no `deletionProtection: true` (default true only with `RemovalPolicy.RETAIN`). SST `sst.aws.Postgres`/`sst.aws.Aurora`/`sst.aws.Mysql` set `skipFinalSnapshot: true` and no deletion protection internally: flag production stages that lack a `transform.instance`/`transform.cluster` setting `deletionProtection: true, skipFinalSnapshot: false`, and `sst.config.ts` whose `removal` is not `"retain"` for production.
- **Fix:**
  ```hcl
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "orders-final"
  ```
  ```ts
  new sst.aws.Aurora("Db", { engine: "postgres", vpc, transform: { cluster: (a) => { a.deletionProtection = true; a.skipFinalSnapshot = false; a.finalSnapshotIdentifier = "db-final"; } } });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_DeleteInstance.html#USER_DeletionProtection ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance#deletion_protection ; https://sst.dev/docs/component/aws/aurora ; https://sst.dev/docs/reference/config/
- **Last verified:** 2026-10-12

### RDS-007 — Encrypt storage at creation
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Set `storage_encrypted = true` (optionally with a customer managed KMS key) on every instance and cluster.
- **Why:** Terraform defaults to unencrypted for `aws_db_instance` and provisioned `aws_rds_cluster`, and CDK defaults to unencrypted unless a key is passed. Encryption cannot be switched on in place; fixing it later means snapshot, encrypted copy, restore and cut-over with downtime.
- **Detect:** Terraform `aws_db_instance`/`aws_rds_cluster` without `storage_encrypted = true`; CDK `DatabaseInstance`/`DatabaseCluster` without `storageEncrypted: true` or `storageEncryptionKey`.
- **Fix:** `storage_encrypted = true` (+ `kms_key_id` if required). Hand off key policy review to `aws-security`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance#storage_encrypted ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html
- **Last verified:** 2026-10-12

### RDS-008 — Keep databases off the public internet
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** `publicly_accessible` must be false and the DB subnet group must use private subnets.
- **Why:** A public endpoint plus a permissive security group exposes the database to internet-wide password spraying and exploit scanning.
- **Detect:** Terraform `publicly_accessible = true` on `aws_db_instance`/`aws_rds_cluster_instance`; CDK `publiclyAccessible: true`, or `vpcSubnets: { subnetType: SubnetType.PUBLIC }` (which makes the default true).
- **Fix:** `publicly_accessible = false` and private subnets; reach it through a bastion/SSM or the Data API. Hand off security group rules to `aws-networking`/`aws-security`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html
- **Last verified:** 2026-10-12

### RDS-009 — Let RDS manage the master password in Secrets Manager
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Use `manage_master_user_password = true` (Terraform) or generated secrets (CDK `Credentials.fromGeneratedSecret`). Never put a literal password in IaC, variables with defaults, or Lambda environment variables.
- **Why:** A `password` argument is stored in Terraform state and may appear in logs; a literal in code or env vars ends up in git, CloudFormation templates and the Lambda console. RDS-managed secrets rotate without redeploying.
- **Detect:** Terraform `password = "..."`/`master_password = "..."` literals or `variable` with a `default` used for them; CDK `Credentials.fromPassword(..., SecretValue.unsafePlainText(` / `SecretValue.unsafePlainText(`; Lambda `environment` keys like `DB_PASSWORD`, `PGPASSWORD` with literal values.
- **Fix:**
  ```hcl
  manage_master_user_password = true
  ```
  Read it at runtime from Secrets Manager (cache it; Powertools Parameters), or use IAM auth (RDS-016) or RDS Proxy.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance#manage_master_user_password
- **Last verified:** 2026-10-12

### RDS-010 — Require TLS on the server and verify certificates on the client
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Enforce TLS with a custom parameter group (`rds.force_ssl = 1` on PostgreSQL ≤14, where the default is 0; `require_secure_transport = 1` on MySQL), and connect with certificate verification.
- **Why:** Without enforcement a client misconfiguration silently falls back to plaintext. With `rejectUnauthorized: false` or `sslmode=require`, the connection is encrypted but not authenticated, so a man-in-the-middle is not detected.
- **Detect:** Parameter group (`aws_db_parameter_group`, `rds.ParameterGroup`) missing `rds.force_ssl`/`require_secure_transport` for engines where TLS is not forced by default; TS `ssl: { rejectUnauthorized: false }`, `ssl: false`, `sslmode=disable`; Go DSN `sslmode=disable`/`sslmode=require` or `tls=skip-verify`.
- **Fix:** Bundle the RDS CA (`global-bundle.pem`) and use `ssl: { ca, rejectUnauthorized: true }` / `sslmode=verify-full&sslrootcert=...`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-ssl-connections.require-ssl.html ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html
- **Last verified:** 2026-10-12

### RDS-011 — Use gp3 instead of gp2 for RDS storage
- **Severity:** medium
- **Category:** performance
- **Applies to:** Terraform, CDK, SST
- **Rule:** Use gp3, not gp2, for RDS instance storage. CDK `DatabaseInstance` still defaults to gp2; an explicit `storage_type = "gp2"` anywhere is the same problem.
- **Why:** gp2 gives 3 IOPS per GiB (a 100 GiB volume has a 300 IOPS baseline) and relies on burst credits; when they run out, latency jumps. gp3 gives 3,000 IOPS and 125 MiB/s baseline at any size (12,000 IOPS / 500 MiB/s from 400 GiB on MySQL/PostgreSQL/MariaDB).
- **Detect:** Terraform `aws_db_instance` with an explicit `storage_type = "gp2"`. Do not flag an omitted `storage_type` in Terraform: the provider sends nothing and the RDS API default is now gp3 when no `iops` is set (the registry page still says gp2; trust the API reference, or the `storage_type` shown in plan/state). CDK `DatabaseInstance` without `storageType: StorageType.GP3` (CDK default GP2). SST `sst.aws.Postgres`/`sst.aws.Mysql` already use gp3.
- **Fix:** `storage_type = "gp3"` (an online modification; the volume goes through `optimizing`).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html ; https://docs.aws.amazon.com/AmazonRDS/latest/APIReference/API_CreateDBInstance.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html
- **Last verified:** 2026-10-12

### RDS-012 — Enable storage autoscaling with a ceiling
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Set `max_allocated_storage` above `allocated_storage` on RDS instances.
- **Why:** When storage fills, the instance enters `storage-full` and writes stop: an outage caused by growth nobody watched. Autoscaling grows storage before that, up to the ceiling you set.
- **Detect:** Terraform `aws_db_instance` without `max_allocated_storage` (autoscaling off by default) or with `max_allocated_storage = 0`; CDK `DatabaseInstance` without `maxAllocatedStorage`.
- **Fix:** `allocated_storage = 50`, `max_allocated_storage = 500`. Alarm on `FreeStorageSpace` (hand off to `aws-observability`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.Autoscaling.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance#max_allocated_storage
- **Last verified:** 2026-10-12

### RDS-013 — Set Aurora Serverless v2 minimum capacity for the environment
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** In production keep min ACU above 0, sized to hold the working set (≈2 GiB of memory per ACU). Use min 0 (auto-pause) only for dev/test or latency-tolerant internal tools, and remember that an attached RDS Proxy keeps instances awake.
- **Why:** At 0 ACU the instance pauses after inactivity; the next connection waits about 15 s to resume (30 s or more after 24 h paused), so API calls time out. Conversely a high minimum is billed around the clock: at $0.12 per ACU-hour (Aurora Standard, us-east-1), each ACU of minimum costs 0.12 × 730 ≈ $87.60/month per instance.
- **Detect:** Terraform `serverlessv2_scaling_configuration { min_capacity = 0 }` in production, or `min_capacity` ≥ 8 with no load evidence; CDK `serverlessV2MinCapacity: 0`; SST `sst.aws.Aurora` with no `scaling.min` (SST default `"0 ACU"`) in production stages, or `scaling.min: "0 ACU"` together with `proxy: true` (instances never pause).
- **Fix:**
  ```ts
  new sst.aws.Aurora("Db", { engine: "postgres", vpc, scaling: $app.stage === "production" ? { min: "2 ACU", max: "32 ACU" } : { min: "0 ACU", max: "4 ACU", pauseAfter: "20 minutes" } });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html ; https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.how-it-works.html ; https://aws.amazon.com/rds/aurora/pricing/ ; https://sst.dev/docs/component/aws/aurora
- **Last verified:** 2026-10-12

### RDS-014 — Raise Aurora Serverless v2 maximum capacity above the defaults
- **Severity:** medium
- **Category:** performance
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set max ACU from expected peak memory/CPU, not the tool default (CDK 2 ACU, SST 4 ACU). The range is 0–256 ACU on current engine versions.
- **Why:** A low ceiling caps the database at about 4–8 GiB of memory: peaks queue, buffer cache thrashes, and the database saturates while costing little. Aurora also sizes `max_connections` from the max ACU.
- **Detect:** CDK `DatabaseCluster` with `ClusterInstance.serverlessV2(` and no `serverlessV2MaxCapacity` (default 2); SST `sst.aws.Aurora` with no `scaling.max` (default `"4 ACU"`) in production; Terraform `max_capacity` ≤ 4 for production.
- **Fix:** `serverlessV2MaxCapacity: 32` (tune from `ServerlessDatabaseCapacity`/`ACUUtilization`).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.setting-capacity.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseClusterProps.html ; https://sst.dev/docs/component/aws/aurora
- **Last verified:** 2026-10-12

### RDS-015 — Upgrade engine majors before RDS Extended Support charges start
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Do not pin a major version past its RDS end of standard support. As of 2026-10-12 these are billed as Extended Support: RDS for MySQL 5.7 and 8.0 (8.0 since 1 Aug 2026), RDS for PostgreSQL 11, 12 and 13. PostgreSQL 14 leaves standard support on 28 Feb 2027. Plan upgrades (8.0 → 8.4, PostgreSQL → 16/17) and use blue/green deployments.
- **Why:** Enrollment is automatic by default, and charges run per vCPU-hour on top of the instance: the pricing page's example (us-east-2) is $0.100/vCPU-hour in years 1–2 and $0.200 from year 3; confirm the Region's rate before quoting. Multi-AZ pays it on the primary **and** every standby. A Single-AZ db.r6g.xlarge (4 vCPU) costs an extra 4 × 0.100 × 730 = $292/month; the same instance Multi-AZ costs $584/month.
- **Detect:** Terraform `engine_version = "8.0..."`/`"5.7..."` with `engine = "mysql"`, `engine_version = "11..."|"12..."|"13..."` with `engine = "postgres"`; CDK `MysqlEngineVersion.VER_8_0_*`/`VER_5_7_*`, `PostgresEngineVersion.VER_11|12|13*`; SST `sst.aws.Postgres` with `version: "11"|"12"|"13"`, and **`sst.aws.Mysql` with no `version`** (SST defaults to `"8.0.40"`, already in Extended Support). Also `engine_lifecycle_support` (Terraform) / `engineLifecycleSupport` (CDK) left at the RDS default `open-source-rds-extended-support`.
- **Fix:** Upgrade the major version (SST: `version: "8.4.x"` on `sst.aws.Mysql`); set `engine_lifecycle_support = "open-source-rds-extended-support-disabled"` on new databases to block silent enrollment. Aurora has its own calendar; check it before reporting.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/extended-support.html ; https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MySQL.Concepts.VersionMgmt.html ; https://aws.amazon.com/rds/mysql/pricing/ ; https://sst.dev/docs/component/aws/mysql
- **Last verified:** 2026-10-12

### RDS-016 — Prefer IAM database authentication or Secrets Manager over static app passwords
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Application users should authenticate with IAM tokens (`iam_database_authentication_enabled = true`, token from `@aws-sdk/rds-signer` / `feature/rds/auth`) or a rotated Secrets Manager secret. Generate a fresh token for each new connection (tokens last 15 minutes) and use TLS.
- **Why:** Static passwords in config never rotate and leak through env vars and logs. IAM auth ties access to the function's role. A token generated once at cold start and reused for later reconnects fails after 15 minutes.
- **Detect:** App DSNs built from `process.env.DB_PASSWORD` / `os.Getenv("DB_PASSWORD")` with no secret fetch; `Signer.getAuthToken()` or `auth.BuildAuthToken(` called once at module scope and the result reused as a password for pools that reconnect.
- **Fix:**
  ```ts
  const signer = new Signer({ hostname, port: 5432, username: "app_user", region });
  const pool = new Pool({ host: hostname, user: "app_user", password: () => signer.getAuthToken(), ssl: { ca, rejectUnauthorized: true }, max: 1 });
  ```
  For very high new-connection rates, put RDS Proxy in front (RDS-001).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Connecting.Go.html
- **Last verified:** 2026-10-12

### RDS-017 — Do not set apply_immediately on production databases by default
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Leave `apply_immediately` false for production, so instance class, storage, parameter and engine changes wait for the maintenance window, unless the change is planned for now.
- **Why:** With `apply_immediately = true` a routine `apply` that changes the instance class reboots or fails over the database in business hours.
- **Detect:** Terraform `apply_immediately = true` on `aws_db_instance`/`aws_rds_cluster` in production modules. CDK `DatabaseInstance` defaults to applying immediately (`applyImmediately` unset); flag CDK production stacks that change `instanceType`/`allocatedStorage` without `applyImmediately: false` (`DatabaseCluster` has no such prop, so do not flag clusters for it). SST components set `applyImmediately: true`; note it when a production diff changes instance class or version.
- **Fix:** `apply_immediately = false`; flip it deliberately for a planned change.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.DBInstance.Modifying.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance#apply_immediately ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html
- **Last verified:** 2026-10-12

### RDS-018 — Attach a custom parameter group from day one
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Give each instance/cluster its own parameter group (DB and, for Aurora, cluster parameter group), even if empty.
- **Why:** Default parameter groups cannot be modified. When you need `rds.force_ssl`, `log_min_duration_statement` or `max_connections`, switching group requires a reboot in production.
- **Detect:** Terraform `aws_db_instance` without `parameter_group_name`, `aws_rds_cluster` without `db_cluster_parameter_group_name`; CDK without `parameterGroup`/`parameters`.
- **Fix:** `aws_db_parameter_group` with `family = "postgres17"` attached at creation.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithParamGroups.html
- **Last verified:** 2026-10-12

### RDS-019 — Move to Graviton instance classes
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Prefer current Graviton classes (`db.t4g`, `db.m7g`/`db.m8g`, `db.r7g`/`db.r8g`) over x86 (`db.t3`, `db.m5`, `db.m6i`, `db.r5`, `db.r6i`) for MySQL, PostgreSQL, MariaDB and Aurora.
- **Why:** AWS benchmarks show Graviton4 classes (m8g/r8g) at up to 29% better price/performance than Graviton3 for PostgreSQL, MySQL and MariaDB. That post compares Graviton generations only, so do not quote an x86-vs-Graviton percentage from it; compare the two classes' hourly prices on the pricing page instead. Open-source engines move with a class change only.
- **Detect:** `instance_class = "db.m5.*"|"db.m6i.*"|"db.r5.*"|"db.r6i.*"|"db.t3.*"`; CDK `InstanceType.of(InstanceClass.M5|R5|R6I|T3, ...)`; SST `instance: "m5.large"`.
- **Fix:** `instance_class = "db.r8g.large"` (confirm Region availability and the hourly price on the pricing page before quoting savings).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/blogs/database/leveling-up-amazon-rds-with-aws-graviton4-benchmarks/ ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Types.html
- **Last verified:** 2026-10-12

### RDS-020 — Choose Aurora I/O-Optimized when I/O is over a quarter of the bill
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** For Aurora clusters whose I/O charges exceed about 25% of total Aurora spend, switch to I/O-Optimized storage; keep Standard for light I/O.
- **Why:** Standard bills $0.20 per million I/Os plus $0.10/GB-month; I/O-Optimized bills no I/O, but $0.225/GB-month storage and a higher compute price (Serverless v2 $0.156 vs $0.12 per ACU-hour, us-east-1). AWS cites up to 40% savings for I/O-heavy clusters.
- **Detect:** Terraform `aws_rds_cluster` with no `storage_type = "aurora-iopt1"` (default `""`, Standard) on write-heavy clusters (evidence: batch jobs, heavy indexes, high `VolumeReadIOPs`/`VolumeWriteIOPs` mentioned); CDK without `storageType: DBClusterStorageType.AURORA_IOPT1`. Only report with evidence of I/O volume.
- **Fix:** `storage_type = "aurora-iopt1"` (switchable in place; Standard → I/O-Optimized is allowed once every 30 days, the reverse at any time; NVMe-based instances restart).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/rds/aurora/pricing/ ; https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.StorageReliability.html
- **Last verified:** 2026-10-12

### RDS-021 — Use the RDS Data API for light Lambda-to-Aurora access
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** For low-volume Aurora access from Lambda (admin tasks, crons, small APIs), prefer the Data API over VPC-attached Lambdas with drivers, pools and secrets.
- **Why:** The Data API removes VPC wiring, connection management and credential handling (it uses a Secrets Manager secret); cost is $0.35 per million `ExecuteStatement` requests. It also resumes an auto-paused Serverless v2 writer.
- **Detect:** Small Lambda handlers against Aurora that only run a few queries, deployed into a VPC with a driver and a secret fetch, while the cluster could set `enable_http_endpoint = true` / `enableDataApi: true` / SST `dataApi: true`.
- **Fix:**
  ```ts
  const out = await rdsData.send(new ExecuteStatementCommand({ resourceArn: Resource.Db.clusterArn, secretArn: Resource.Db.secretArn, database: "app", sql: "SELECT * FROM orders WHERE id = :id", parameters: [{ name: "id", value: { stringValue: id } }] }));
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html ; https://aws.amazon.com/rds/aurora/pricing/ ; https://sst.dev/docs/component/aws/aurora
- **Last verified:** 2026-10-12

### RDS-022 — Pass SQL values as parameters, never by string building
- **Severity:** critical
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** Every value that reaches SQL goes through placeholders (`$1`, `?`, `:name`); identifiers come from an allow-list.
- **Why:** Interpolating request data into SQL allows SQL injection: data theft, auth bypass, dropped tables.
- **Detect:** TS template literals or `+` inside `.query(`/`.execute(`/`sql.raw(`/`$queryRawUnsafe(` with `${...}` from request input; Go `fmt.Sprintf("SELECT ... %s` or string concatenation passed to `db.Query(`/`db.Exec(`/`pool.Query(`.
- **Fix:**
  ```go
  rows, err := db.QueryContext(ctx, "SELECT id, total FROM orders WHERE customer_id = $1", customerID)
  ```
  Hand off broader input validation to `aws-security`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/codeguru/detector-library/go/sql-injection/ ; https://docs.aws.amazon.com/codeguru/detector-library/javascript/sql-injection/
- **Last verified:** 2026-10-12

### RDS-023 — Connect through cluster endpoints, not instance endpoints
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Writers use the Aurora cluster (writer) endpoint, reads use the reader endpoint (`cluster-ro-`) or a proxy endpoint. Never hard-code an instance endpoint.
- **Why:** After a failover the old writer instance becomes a reader: apps pinned to its instance endpoint get `read-only` errors on writes, or lose the database when that instance is replaced.
- **Detect:** Terraform outputs/env vars from `aws_rds_cluster_instance.*.endpoint`; CDK `cluster.instanceEndpoints[0]`; literal hostnames with an instance identifier instead of `.cluster-` / `.cluster-ro-` in config.
- **Fix:** Use `aws_rds_cluster.x.endpoint` for writes and `aws_rds_cluster.x.reader_endpoint` for reads (CDK `clusterEndpoint` / `clusterReadEndpoint`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.Endpoints.html
- **Last verified:** 2026-10-12
