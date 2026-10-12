---
name: aws-data
description: Review DynamoDB, RDS/Aurora and ElastiCache (Valkey/Redis) usage in Terraform, CDK, SST, TypeScript (AWS SDK v3) and Go (aws-sdk-go-v2) — key design and hot partitions, Scan vs Query, pagination, batch retries, conditional writes and idempotency, TTL, GSI cost, PITR and deletion protection, Lambda connection management and RDS Proxy, Multi-AZ, backups, Aurora Serverless v2 capacity, engine Extended Support charges, cache eviction, cluster clients and Valkey cost. Static review of files, diffs and plan/diff output; never calls AWS. Use when the user asks "is this DynamoDB table right", "review my data layer", "review this RDS/Aurora setup", "why is my Lambda exhausting DB connections", "check my Redis/Valkey cache", or when aws-review dispatches it.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-data

Expert reviewer for the data tier: DynamoDB, RDS and Aurora, ElastiCache. It reads code, IaC
and diffs, and reports bugs, security gaps, cost waste, reliability risks, performance problems
and simplifications. It reviews only; it changes code only if the user asks after the report.

## Scope

Covers:
- **DynamoDB**: key and GSI design, Query/Scan, pagination, batch limits and retries,
  conditional writes, transactions, TTL, item size, capacity mode, PITR, deletion protection,
  Streams consumers, table class, SDK usage.
- **RDS / Aurora**: Lambda connections and RDS Proxy, pinning, Multi-AZ, backups, deletion
  protection, encryption, public access, credentials, TLS, gp3 and autoscaling storage, Aurora
  Serverless v2 min/max ACU, Extended Support, Graviton, I/O-Optimized, Data API, endpoints, SQL
  injection.
- **ElastiCache**: TLS, auth, Multi-AZ, cluster-mode clients, TTL and eviction, blocking
  commands, connection reuse, timeouts, Valkey vs Redis OSS, Extended Support, serverless limits,
  snapshots, node types.

Hand off, in one line inside the finding, when the issue belongs to another expert:
- Lambda/ECS sizing, init, SDK client reuse in general → `aws-compute`
- S3 buckets holding offloaded items, CloudFront → `aws-storage`
- SQS/SNS/EventBridge/Kinesis/Step Functions settings → `aws-messaging`
- Security groups, subnets, VPC endpoints, NAT → `aws-networking`
- State, module layout, drift, CDK/SST tooling → `aws-iac`
- IAM policies, KMS key policies, secret rotation → `aws-security`
- Reserved instances, Savings Plans, account-wide spend → `aws-cost`
- Alarms, logs, Performance/Database Insights, tracing → `aws-observability`

## Signals

This expert applies when files contain any of these.

**File globs:** `*.tf`, `*.tf.json`, `*.tfplan.json`, `cdk.json`, `lib/**/*.ts`, `bin/**/*.ts`,
`sst.config.ts`, `infra/**/*.ts`, `**/*.ts`, `**/*.go`, `go.mod`, `package.json`, `*.sql`,
`terraform plan` / `cdk diff` / `sst diff` output.

**Terraform:** `aws_dynamodb_table`, `aws_dynamodb_global_table`, `aws_dynamodb_table_item`,
`aws_appautoscaling_target` with `dynamodb:`, `aws_lambda_event_source_mapping` on a
`stream_arn`, `aws_db_instance`, `aws_rds_cluster`, `aws_rds_cluster_instance`,
`aws_db_proxy`, `aws_db_parameter_group`, `aws_rds_cluster_parameter_group`,
`aws_db_subnet_group`, `aws_elasticache_replication_group`, `aws_elasticache_cluster`,
`aws_elasticache_serverless_cache`, `aws_elasticache_parameter_group`,
`aws_elasticache_user_group`.

**CDK v2 (TypeScript):** `aws-cdk-lib/aws-dynamodb`, `new dynamodb.Table`, `new dynamodb.TableV2`,
`DynamoEventSource`, `aws-cdk-lib/aws-rds`, `new rds.DatabaseInstance`, `new rds.DatabaseCluster`,
`ClusterInstance.serverlessV2`, `DatabaseProxy`, `addProxy(`, `aws-cdk-lib/aws-elasticache`,
`CfnReplicationGroup`, `CfnServerlessCache`, `CfnCacheCluster`.

**SST v3:** `sst.aws.Dynamo`, `sst.aws.Postgres`, `sst.aws.Mysql`, `sst.aws.Aurora`,
`sst.aws.Redis`, `.subscribe(` on a Dynamo table.

**TypeScript (SDK v3 and drivers):** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`,
`@aws-sdk/util-dynamodb`, `@aws-sdk/client-rds-data`, `@aws-sdk/rds-signer`,
`@aws-sdk/client-elasticache`, `QueryCommand`, `ScanCommand`, `BatchWriteCommand`,
`TransactWriteCommand`, `pg`, `postgres`, `mysql2`, `knex`, `drizzle-orm`, `@prisma/client`,
`ioredis`, `redis`, `@valkey/valkey-glide`, `@aws-lambda-powertools/idempotency`.

**Go:** `github.com/aws/aws-sdk-go-v2/service/dynamodb`,
`github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue`,
`github.com/aws/aws-sdk-go-v2/feature/dynamodb/expression`,
`github.com/aws/aws-sdk-go-v2/service/rdsdata`, `github.com/aws/aws-sdk-go-v2/feature/rds/auth`,
`github.com/aws/aws-sdk-go-v2/service/elasticache`, `database/sql`, `github.com/jackc/pgx`,
`github.com/go-sql-driver/mysql`, `github.com/redis/go-redis`, `github.com/valkey-io/valkey-go`.

## Procedure

1. **Collect inputs.** Use the files you were given. Otherwise find them with the Signals
   (grep the repo). When reviewing a change, start from the diff (`git diff <base>...HEAD`,
   plan or diff output) but read the surrounding code: the table definition behind a query,
   the handler behind a connection string, the parameter group behind a cluster. Done when you
   know, for each data resource in scope, its IaC definition and the code that uses it.
2. **Open only the relevant references.** DynamoDB present → `references/dynamodb.md`; RDS or
   Aurora → `references/rds-aurora.md`; ElastiCache → `references/elasticache.md`.
3. **Apply the rules.** For every rule in each opened reference, check its **Detect** signals
   against the inputs. Then look for problems no rule covers (race conditions, wrong key
   choices for the access pattern, missing error handling around data calls) and mark them
   `NEW`. Done when every rule of every opened reference was checked.
4. **Verify each finding.** Open the evidence line and trace it: the value really flows there,
   the default really applies (no override elsewhere, no module input setting it), the
   environment is really production when the rule is production-only. Drop anything you cannot
   point to in the files. No speculation.
5. **Check staleness.** If a rule you report has `Last verified` more than 120 days before
   today, add "reference is stale, run /aws-refresh". For a stale rule marked `Volatile: yes`,
   confirm the fact live before quoting numbers: AWS Knowledge/Documentation MCP if connected,
   otherwise WebFetch the rule's Source URL.

## Output format

Each finding in the review output:
- **[<severity>] <ID or NEW> — <title>** (category)
- Evidence: `path/to/file:line` (+ quoted snippet)
- Scenario: concrete inputs/state → what goes wrong (or what it costs, with arithmetic and a link to the pricing page when it is cost)
- Fix: concrete change
- Source: <link>

Findings without concrete evidence in the reviewed files are dropped. Rank most severe first.
The reviewer only reports; it applies fixes only if the user asks afterwards. Write the report
in the language of the conversation.

When dispatched by `aws-review`, return only the findings, plus one line listing any rule used
whose Last verified date is older than 120 days.

## References

- `references/dynamodb.md` — DDB-001…028: pagination, batches, Scan, GSI reads, conditional and
  idempotent writes, transactions, TTL, hot keys, PITR, deletion protection, projections
  (cost and non-projected reads), capacity, Streams consumers, item size, expressions, SST link,
  table class, sort-key ordering with Limit.
- `references/rds-aurora.md` — RDS-001…023: RDS Proxy and Lambda connections, pinning,
  Multi-AZ, backups, deletion protection, encryption, public access, credentials, TLS, gp3,
  storage autoscaling, Serverless v2 ACUs, Extended Support, IAM auth, apply_immediately,
  parameter groups, Graviton, I/O-Optimized, Data API, SQL injection, endpoints.
- `references/elasticache.md` — ECH-001…015: TLS, auth, at-rest encryption, Multi-AZ, cluster
  clients, TTL and eviction, KEYS, connection reuse, timeouts, Valkey, Extended Support,
  serverless limits, snapshots, node types, credentials.
- `references/sources.md` — every official URL behind the rules, grouped by topic.
