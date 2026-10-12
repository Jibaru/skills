# ElastiCache rules (Valkey, Redis OSS, Memcached)

Topology, availability, security, memory behaviour, client usage and cost for Amazon
ElastiCache. Node-based clusters are `aws_elasticache_replication_group` /
`aws_elasticache_cluster` / CDK `CfnReplicationGroup` / SST `sst.aws.Redis`; serverless caches
are `aws_elasticache_serverless_cache` / CDK `CfnServerlessCache`.

### ECH-001 — Enable in-transit encryption on node-based clusters
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Set `transit_encryption_enabled = true` (and `transit_encryption_mode = "required"` once clients use TLS), and connect with TLS from clients.
- **Why:** Node-based clusters are plaintext unless TLS is explicitly enabled; cached sessions, tokens and PII cross the VPC unencrypted, and neither AUTH tokens nor RBAC user groups can be attached without TLS. Serverless caches always use TLS, so a non-TLS client cannot connect at all.
- **Detect:** Terraform `aws_elasticache_replication_group` without `transit_encryption_enabled = true`; CDK `CfnReplicationGroup` without `transitEncryptionEnabled: true`. Client side: ioredis/node-redis config without `tls:` / `rediss://` URL; Go `redis.Options{}` without `TLSConfig:`, against an encrypted cluster or a serverless cache.
- **Fix:**
  ```hcl
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  ```
  ```go
  rdb := redis.NewClusterClient(&redis.ClusterOptions{Addrs: []string{addr}, TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12}})
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_replication_group#transit_encryption_enabled
- **Last verified:** 2026-10-12

### ECH-002 — Require authentication (RBAC user group or AUTH token)
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Attach an RBAC user group (`user_group_ids` / serverless `user_group_id`) or an `auth_token` (requires TLS). Disable or restrict the `default` user.
- **Why:** Without auth, anything that reaches the security group can read, overwrite or `FLUSHALL` the cache. Security groups alone fail open when they are widened later.
- **Detect:** `aws_elasticache_replication_group` with neither `auth_token` nor `user_group_ids`; `aws_elasticache_serverless_cache` without `user_group_id`; CDK `CfnReplicationGroup` without `authToken`/`userGroupIds`.
- **Fix:** `aws_elasticache_user` + `aws_elasticache_user_group` with least-privilege access strings, attached via `user_group_ids`. Keep tokens in Secrets Manager (hand off to `aws-security`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Clusters.RBAC.html ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/auth.html
- **Last verified:** 2026-10-12

### ECH-003 — Enable at-rest encryption on node-based clusters
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Set `at_rest_encryption_enabled = true` on replication groups.
- **Why:** Snapshots and swap of unencrypted nodes hold cached data in clear; compliance programs (PCI, HIPAA) require it, and it is set at creation.
- **Detect:** Terraform `aws_elasticache_replication_group` without `at_rest_encryption_enabled = true`; CDK `CfnReplicationGroup` without `atRestEncryptionEnabled: true`.
- **Fix:** `at_rest_encryption_enabled = true` (+ `kms_key_id` if required).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/at-rest-encryption.html
- **Last verified:** 2026-10-12

### ECH-004 — Run production caches with a replica and Multi-AZ failover
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Production Valkey/Redis OSS clusters need at least one replica per shard in another AZ with `automatic_failover_enabled = true` and `multi_az_enabled = true` (or use a serverless cache, which is Multi-AZ).
- **Why:** Without a replica, a primary failure provisions a new empty primary: all data is lost and the cache is down until replacement. Then every request goes to the database at once (cold-cache stampede).
- **Detect:** Terraform `aws_elasticache_cluster` (single node) for Valkey/Redis in production; `aws_elasticache_replication_group` with `num_cache_clusters = 1`, `replicas_per_node_group = 0`, or `automatic_failover_enabled`/`multi_az_enabled` not true. CDK `CfnReplicationGroup` with `numCacheClusters: 1` or `replicasPerNodeGroup: 0`. SST `sst.aws.Redis` creates no replicas and `multiAzEnabled: false`; flag production stages without a `transform.cluster` adding replicas and Multi-AZ.
- **Fix:**
  ```hcl
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  ```
  ```ts
  new sst.aws.Redis("Cache", { vpc, engine: "valkey", transform: { cluster: (a) => { a.replicasPerNodeGroup = 1; a.multiAzEnabled = true; a.automaticFailoverEnabled = true; } } });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/AutoFailover.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_replication_group#automatic_failover_enabled ; https://sst.dev/docs/component/aws/redis
- **Last verified:** 2026-10-12

### ECH-005 — Use a cluster-aware client for cluster-mode-enabled caches
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform, SST
- **Rule:** When cluster mode is enabled (Terraform `cluster_mode = "enabled"`, `num_node_groups`, a `*.cluster.on` parameter group, SST `sst.aws.Redis` by default), connect with a cluster client through the configuration endpoint, and keep multi-key commands on one hash slot (`{tag}` keys).
- **Why:** A standalone client sends every key to one node; keys owned by other shards return `MOVED` errors, and `MGET`/`MULTI`/Lua across slots return `CROSSSLOT`. It may work in dev with one shard and fail after resharding or failover.
- **Detect:** TS: `new Redis(` / `createClient(` (node-redis) instead of `new Cluster(` / `createCluster(` against a cluster-mode cache or `Resource.<Redis>.host` from an SST Redis; Go: `redis.NewClient(` instead of `redis.NewClusterClient(`; multi-key commands (`mget`, `del(a, b)`, `multi()`) on keys without a shared `{...}` hash tag.
- **Fix:**
  ```ts
  import { Cluster } from "ioredis";
  import { Resource } from "sst";
  const redis = new Cluster([{ host: Resource.Cache.host, port: Resource.Cache.port }], {
    redisOptions: { tls: { checkServerIdentity: () => undefined }, username: Resource.Cache.username, password: Resource.Cache.password },
  });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/BestPractices.Clients.Redis.Discovery.html ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Replication.Redis-RedisCluster.html ; https://sst.dev/docs/component/aws/redis
- **Last verified:** 2026-10-12

### ECH-006 — Give cache keys a TTL, or switch to an allkeys eviction policy
- **Severity:** high
- **Category:** reliability
- **Applies to:** TypeScript, Go, Terraform, CDK
- **Rule:** Writes that are pure cache must set an expiry (`EX`/`PX`/`SETEX`/`Expire`). If the workload writes keys without TTL, set `maxmemory-policy` to `allkeys-lru` or `allkeys-lfu` in a custom parameter group.
- **Why:** The default policy is `volatile-lru`: only keys with a TTL can be evicted. A cache filled with TTL-less keys hits `maxmemory` and then rejects writes with OOM errors. Serverless caches also evict only TTL keys when they reach their storage limit.
- **Detect:** TS `redis.set(key, value)` without `"EX"`/`"PX"`/`{ EX: }`, `hset(` with no `expire(`; Go `rdb.Set(ctx, key, val, 0)` (zero expiration). Infra: no parameter group or one without `maxmemory-policy` while the code writes TTL-less keys.
- **Fix:**
  ```ts
  await redis.set(`user:${id}`, JSON.stringify(user), "EX", 300);
  ```
  ```hcl
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/ParameterGroups.Engine.html ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Scaling-serverless.html
- **Last verified:** 2026-10-12

### ECH-007 — Never run KEYS (or other full-keyspace commands) in application code
- **Severity:** high
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Replace `KEYS pattern` with `SCAN` (cursor, bounded `COUNT`) or, better, keep an index set of the keys you need. Do not call `FLUSHALL`/`FLUSHDB` from app paths.
- **Why:** `KEYS` is O(N) and blocks the single-threaded engine while it walks the whole keyspace; with millions of keys every other client stalls and times out.
- **Detect:** TS `.keys(` on an ioredis/node-redis client, `sendCommand(["KEYS"`, `.flushall(`/`.flushdb(`; Go `rdb.Keys(ctx,`, `FlushAll(`.
- **Fix:**
  ```go
  iter := rdb.Scan(ctx, 0, "session:*", 500).Iterator()
  for iter.Next(ctx) { /* ... */ }
  ```
  Consider blocking `KEYS`/`FLUSHALL` with the `rename-commands` parameter.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WorkingWithRedis.html ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html
- **Last verified:** 2026-10-12

### ECH-008 — Reuse cache connections and back off on reconnect
- **Severity:** high
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Create the client once per process (module scope in Lambda), use a bounded pool, and reconnect with exponential backoff plus jitter. Do not open and quit a connection per request.
- **Why:** A new TCP+TLS connection costs an order of magnitude more than a GET (AWS measured 2.82 ms vs 0.21 ms with pooling). Reconnect storms without backoff have pinned clusters at 100% CPU on topology discovery.
- **Detect:** `new Redis(`/`new Cluster(`/`createClient(` or `redis.NewClient(`/`NewClusterClient(` inside a handler or per-request function; `.quit()`/`.disconnect()`/`.Close()` at the end of each request; `retryStrategy` returning a constant small delay.
- **Fix:**
  ```ts
  const redis = new Cluster(nodes, { clusterRetryStrategy: (n) => Math.min(100 * 2 ** n, 5000) * Math.random() });
  export const handler = async (e) => redis.get(e.key);
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/BestPractices.Clients.Redis.Connections.html ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/BestPractices.Clients.Redis.Discovery.html
- **Last verified:** 2026-10-12

### ECH-009 — Set client connect and command timeouts
- **Severity:** medium
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Configure a short connect timeout and a command timeout (longer than any blocking command's own timeout), and cap retries per request.
- **Why:** Without timeouts, a failover or network blip makes every request hang until the Lambda/HTTP timeout; requests pile up and the cache outage becomes an application outage instead of a cache miss.
- **Detect:** ioredis options without `connectTimeout`/`commandTimeout`/`maxRetriesPerRequest`; node-redis without `socket.connectTimeout`; Go `redis.Options`/`ClusterOptions` without `DialTimeout`, `ReadTimeout`, `WriteTimeout`.
- **Fix:** `{ connectTimeout: 1000, commandTimeout: 500, maxRetriesPerRequest: 2 }`, and treat a timeout as a miss that falls back to the database.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/BestPractices.Clients.Redis.ClientTimeout.html
- **Last verified:** 2026-10-12

### ECH-010 — Choose the Valkey engine over Redis OSS
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Use `engine = "valkey"` for new caches and migrate Redis OSS caches with the in-place cross-engine upgrade (minimal downtime from Redis OSS 5.0.6+; endpoints keep their DNS names).
- **Why:** Valkey is priced 20% lower on node-based clusters and 33% lower for serverless data storage ($0.084 vs $0.125 per GB-hour in us-east-1), with a 100 MB minimum instead of 1 GB. A 2-node cache.r7g.large Redis OSS cluster becomes 20% cheaper with no client changes.
- **Detect:** Terraform `engine = "redis"` on `aws_elasticache_replication_group`/`aws_elasticache_serverless_cache`; CDK `engine: "redis"` on `CfnReplicationGroup`/`CfnServerlessCache`; SST `sst.aws.Redis` without `engine: "valkey"` (SST default is `"redis"`).
- **Fix:** `engine = "valkey"` with a current `engine_version` (9.x as of 2026-10-12); pass a Valkey parameter group if the cluster uses a custom one.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/elasticache/pricing/ ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/VersionManagement.HowTo.cross-engine-upgrade.html ; https://sst.dev/docs/component/aws/redis
- **Last verified:** 2026-10-12

### ECH-011 — Move off Redis OSS versions in (or near) Extended Support
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Redis OSS 4 and 5 left standard support on 31 Jan 2026 and are billed with an Extended Support premium; Redis OSS 6 follows on 31 Jan 2027. Upgrade to Valkey (or Redis OSS 7.x).
- **Why:** The premium is 80% of the node price in years 1–2 and 160% in year 3; AWS's example has a cache.m5.large going to $0.2808/hour in years 1–2.
- **Detect:** `engine_version = "4.0.10"`, `"5.0.6"`, `"5.0"`, `"6.x"`, `"6.0"`, `"6.2"` with `engine = "redis"`; CDK `engineVersion: "5.0.6"` etc.
- **Fix:** Upgrade the engine (`engine = "valkey"`, current version) during a maintenance window; test client compatibility first.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html#deprecated-engine-versions ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/extended-support.html ; https://aws.amazon.com/elasticache/pricing/
- **Last verified:** 2026-10-12

### ECH-012 — Cap serverless cache usage
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Set `cache_usage_limits` (max data storage, max ECPU/second) on serverless caches; avoid setting a minimum unless pre-warming is needed, because minimums are billed even when unused.
- **Why:** Serverless scales with data and requests, so a key leak (no TTL) or a hot loop grows the bill without bound. Maximums turn that into TTL-key eviction and throttling you can alarm on.
- **Detect:** `aws_elasticache_serverless_cache` without `cache_usage_limits { data_storage { maximum } ecpu_per_second { maximum } }`; CDK `CfnServerlessCache` without `cacheUsageLimits`; a `minimum` set with no stated reason.
- **Fix:**
  ```hcl
  cache_usage_limits {
    data_storage {
      maximum = 10
      unit    = "GB"
    }
    ecpu_per_second {
      maximum = 50000
    }
  }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Scaling-serverless.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_serverless_cache#cache_usage_limits
- **Last verified:** 2026-10-12

### ECH-013 — Keep snapshots when the cache holds data you cannot rebuild
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** If Valkey/Redis holds state that is not derived from a database (sessions, rate-limit counters you must honour, queues, leaderboards), set `snapshot_retention_limit` ≥ 1 (node-based) or a snapshot schedule (serverless).
- **Why:** `snapshot_retention_limit = 0` (the default) turns backups off; losing every node, or a bad `FLUSHALL`, loses the data for good.
- **Detect:** Replication group without `snapshot_retention_limit` or set to 0, where code uses the cache as primary storage (`LPUSH`/`XADD` queues, session stores with no DB fallback, `INCR` counters persisted nowhere else).
- **Fix:** `snapshot_retention_limit = 7` and `snapshot_window = "03:00-04:00"`. Pure caches can skip this; then say so in a comment.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/backups-automatic.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_replication_group#snapshot_retention_limit
- **Last verified:** 2026-10-12

### ECH-014 — Use current-generation Graviton node types
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Prefer `cache.t4g` (dev), `cache.m7g`/`cache.r7g` (production) over `cache.t2`/`t3`/`m4`/`m5`/`r4`/`r5`/`m6g` for Valkey/Redis OSS.
- **Why:** Older generations deliver less throughput per node, so clusters get sized larger than needed; AWS's headline ElastiCache 7.1 numbers (over 1 M requests/s per node) are on Graviton3 r7g.4xlarge and up. Confirm the price per GiB for the target type on the pricing page before quoting savings.
- **Detect:** `node_type = "cache.m5.*"|"cache.r5.*"|"cache.t2.*"|"cache.t3.*"|"cache.m4.*"|"cache.r4.*"`; CDK `cacheNodeType: "cache.r5.large"`; SST `instance: "r5.large"`.
- **Fix:** `node_type = "cache.r7g.large"` (check Region availability and price before quoting savings; reserved nodes are an `aws-cost` topic).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/CacheNodes.SupportedTypes.html ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html ; https://aws.amazon.com/elasticache/pricing/
- **Last verified:** 2026-10-12

### ECH-015 — Wire cache credentials with SST link, not literals in environment variables
- **Severity:** medium
- **Category:** security
- **Applies to:** SST, Terraform, TypeScript
- **Rule:** Pass host, port, username and password with `link: [cache]` and read `Resource.<Cache>`; in Terraform/CDK pass a Secrets Manager reference, never the `auth_token` value, to function environments.
- **Why:** An auth token in a Lambda `environment` block is visible to anyone with `lambda:GetFunctionConfiguration`, lands in templates/state, and does not rotate.
- **Detect:** SST `environment: { REDIS_PASSWORD: ... }` or `cache.password` placed in `environment`; Terraform `environment { variables = { REDIS_AUTH = aws_elasticache_replication_group.x.auth_token } }` or a literal token.
- **Fix:** SST `link: [cache]`; Terraform: store the token in `aws_secretsmanager_secret` and fetch it at init (cache it in memory).
- **Volatile:** no
- **Source:** https://sst.dev/docs/linking ; https://sst.dev/docs/component/aws/redis ; https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/auth.html
- **Last verified:** 2026-10-12
