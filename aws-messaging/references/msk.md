# MSK rules

Amazon MSK (Provisioned with Standard or Express brokers, and Serverless), topic/broker
configuration, and Kafka clients in TypeScript (e.g. KafkaJS) and Go (e.g. franz-go,
segmentio/kafka-go, confluent-kafka-go) talking to MSK. VPC/security-group reachability →
`aws-networking`; IAM policy design → `aws-security`.

Client defaults differ by library and version. Before reporting a client rule, read the
library's documented default for the setting in the version the lockfile pins; report only
what the code (or that default) actually does.

### MSK-001 — Choose Serverless, Provisioned Standard or Express from load and cost
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Use MSK Serverless for variable, modest workloads within its quotas; Provisioned (Standard or Express brokers) for steady high throughput, many partitions, compacted topics above serverless limits, or non-IAM auth.
- **Why:** Serverless bills a cluster-hour plus partition-hours and per-GB in/out: $0.75 × 730 = **$547.50/month** per cluster before data, plus $0.0015 × 730 = $1.10 per partition-month (rates from the pricing page's US East (Ohio) Serverless example; check the target Region). It caps at 200 MB/s ingress per cluster, 5 MB/s ingress per partition, 2,400 partitions (120 compacted) and 3,000 connections; beyond that clients are throttled or requests fail. A small steady workload can be cheaper on 3 × `kafka.m7g.large` ($0.204/h each ≈ $446.76/month + storage).
- **Detect:** `aws_msk_serverless_cluster` with producers expected above the per-partition/cluster limits; `aws_msk_cluster` with large brokers idling in dev stages; CDK `CfnServerlessCluster` / `CfnCluster` (`aws-cdk-lib/aws-msk` has only L1s; `@aws-cdk/aws-msk-alpha` is preview).
- **Fix:** Size with the MSK sizing guidance and the pricing page; state the monthly arithmetic for both options in the finding.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/limits.html#serverless-quota ; https://aws.amazon.com/msk/pricing/ ; https://docs.aws.amazon.com/msk/latest/developerguide/serverless.html
- **Last verified:** 2026-10-12

### MSK-002 — Replicate topics 3 ways across 3 AZs with min.insync.replicas = 2
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Provisioned clusters span three AZs, topics use replication factor ≥ 3, and `min.insync.replicas` is RF − 1 (2 for RF 3).
- **Why:** RF 1 takes partitions offline during every rolling update or broker replacement; RF 2 can lose acknowledged data; `min.insync.replicas` equal to RF blocks all `acks=all` writes whenever one broker is patched.
- **Detect:** `aws_msk_cluster.number_of_broker_nodes` not a multiple of 3 or `client_subnets` in 2 subnets/AZs; `aws_msk_configuration.server_properties` with `default.replication.factor=1|2` or `min.insync.replicas=3` (with RF 3) or `=1`; topic creation in code with `replicationFactor: 1|2` (KafkaJS `admin.createTopics`) / `ReplicationFactor: 1` (Go admin clients).
- **Fix:**
  ```hcl
  resource "aws_msk_configuration" "this" {
    kafka_versions    = [var.kafka_version]
    name              = "app"
    server_properties = <<-PROPS
      default.replication.factor=3
      min.insync.replicas=2
      auto.create.topics.enable=false
    PROPS
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices.html#ensure-high-availability
- **Last verified:** 2026-10-12

### MSK-003 — Produce with acks=all, idempotence and generous retries
- **Severity:** high
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Producers that must not lose data set `acks=all` (−1), retry effectively forever (`retries` = integer max) within a `delivery.timeout.ms` ≥ 60 s, back off ≥ 200 ms (`retry.backoff.ms`), and enable idempotence where the client supports it so those retries do not duplicate records.
- **Why:** MSK recommends `acks=all` with RF 3 / `min.insync.replicas` 2 for durability and high retries so producers survive broker failover; with `acks=0/1` a failover during patching can lose acknowledged writes, and without retries every rolling update surfaces as produce errors. Idempotence is Kafka client behaviour, not an MSK page claim: confirm the pinned library's default before reporting it. Some Go/JS client defaults are weaker than the Java defaults.
- **Detect:** KafkaJS `producer.send({ acks: 0|1 })`, `kafka.producer({ idempotent: false })` or `idempotent` absent, `retry: { retries: 0 }`; segmentio/kafka-go `kafka.Writer{}` without `RequiredAcks: kafka.RequireAll`; franz-go `kgo.RequiredAcks(kgo.LeaderAck())` / `kgo.DisableIdempotentWrite()`; confluent `"acks": "1"`, `"enable.idempotence": false`.
- **Fix:**
  ```go
  w := &kafka.Writer{
      Addr:         kafka.TCP(brokers...),
      Topic:        "orders",
      RequiredAcks: kafka.RequireAll,
      MaxAttempts:  10,
  }
  ```
  ```ts
  const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 5 });
  await producer.send({ topic: "orders", acks: -1, messages });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-kafka-client.html#bestpractices-kafka-client-client-availability
- **Last verified:** 2026-10-12

### MSK-004 — Authenticate with IAM and encrypt client traffic
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Clusters disable unauthenticated access and plaintext; clients use SASL/OAUTHBEARER with the AWS MSK IAM signer (`aws-msk-iam-sasl-signer-js`, `aws-msk-iam-sasl-signer-go`) over TLS.
- **Why:** `unauthenticated = true` lets anything with network reach read and write every topic; `PLAINTEXT`/`TLS_PLAINTEXT` sends records and credentials in clear text inside the VPC. IAM auth removes shared SCRAM secrets and is required on MSK Serverless.
- **Detect:** `aws_msk_cluster.client_authentication { unauthenticated = true }`, `encryption_info.encryption_in_transit.client_broker = "PLAINTEXT" | "TLS_PLAINTEXT"`, `in_cluster = false`; clients with `ssl: false`, `sasl: { mechanism: "plain" }` and literal passwords, Go `sasl/plain`, bootstrap port `9092`.
- **Fix:**
  ```ts
  import { generateAuthToken } from "aws-msk-iam-sasl-signer-js";
  const kafka = new Kafka({
    brokers, ssl: true,
    sasl: { mechanism: "oauthbearer", oauthBearerProvider: async () => {
      const { token } = await generateAuthToken({ region: process.env.AWS_REGION! });
      return { value: token };
    } },
  });
  ```
  ```hcl
  client_authentication {
    sasl { iam = true }
    unauthenticated = false
  }
  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/configure-clients-for-iam-access-control.html ; https://docs.aws.amazon.com/msk/latest/developerguide/msk-encryption.html ; https://github.com/aws/aws-msk-iam-sasl-signer-js ; https://github.com/aws/aws-msk-iam-sasl-signer-go
- **Last verified:** 2026-10-12

### MSK-005 — Create Kafka clients once, outside the request path
- **Severity:** high
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Build and connect producers/consumers once per process (module scope in Lambda, a singleton in services) and add jitter to startup and shutdown.
- **Why:** Connection creation is expensive for brokers; with IAM auth each broker accepts ~100 new connections/s and 3,000 total. A producer created per request or per Lambda invocation causes connection storms that degrade the whole cluster and cascade into more reconnects.
- **Detect:** `new Kafka(...)`, `kafka.producer()`, `producer.connect()` inside a handler/route function; Go `kafka.NewWriter`/`kgo.NewClient` inside an HTTP handler or Lambda handler; `producer.disconnect()` at the end of each request.
- **Fix:** Move client creation to module scope; reuse the connected producer; close it on SIGTERM.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-kafka-client.html ; https://docs.aws.amazon.com/msk/latest/developerguide/limits.html
- **Last verified:** 2026-10-12

### MSK-006 — Bootstrap from brokers in every AZ, from IaC outputs
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Clients receive the full bootstrap string for their auth method (`bootstrap_brokers_sasl_iam`, `bootstrap_brokers_tls`) with at least one broker per AZ, wired from IaC.
- **Why:** A single hard-coded broker host fails client startup whenever that broker is offline for patching or replacement.
- **Detect:** `brokers: ["b-1.<cluster>..."]` single literal; env vars holding one `host:port`; Terraform outputs exposing `bootstrap_brokers` (plaintext) while clients use IAM.
- **Fix:** `KAFKA_BROKERS = aws_msk_cluster.this.bootstrap_brokers_sasl_iam` and split on commas in code.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices.html ; https://docs.aws.amazon.com/msk/latest/developerguide/msk-get-bootstrap-brokers.html
- **Last verified:** 2026-10-12

### MSK-007 — Keep partition counts within the broker size's recommendation
- **Severity:** medium
- **Category:** performance
- **Applies to:** Terraform, TypeScript, Go
- **Rule:** Total partitions (leaders + followers) per broker stay within the recommended count for its size, e.g. 300 for `kafka.t3.small`, 1,000 for `m5/m7g.large|xlarge`.
- **Why:** Above the maximum, MSK blocks configuration updates and broker-size changes, CloudWatch metrics go missing, and the brokers burn CPU on replication.
- **Detect:** Topic creation with `numPartitions` in the hundreds per topic on small brokers; `instance_type = "kafka.t3.small"` with several topics × RF 3; serverless topics near 2,400 partitions.
- **Fix:** Fewer partitions per topic (sized to consumer parallelism), or larger brokers.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices.html#partitions-per-broker
- **Last verified:** 2026-10-12

### MSK-008 — Prevent full disks on Standard brokers
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Provisioned Standard-broker clusters enable storage auto scaling (or tiered storage) and set retention (`log.retention.hours`/`retention.ms`) sized to the disk.
- **Why:** When `KafkaDataLogsDiskUsed` reaches 100 % brokers stop accepting writes: a full outage. Kafka keeps data for 7 days by default regardless of consumption.
- **Detect:** `aws_msk_cluster` with `ebs_storage_info.volume_size` small and no `aws_appautoscaling_target` (`service_namespace = "kafka"`, `scalable_dimension = "kafka:broker-storage:VolumeSize"`), no `storage_mode = "TIERED"`, and no retention in `aws_msk_configuration`.
- **Fix:** Add the auto-scaling target/policy (target 60–80 %) and explicit `log.retention.hours`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/msk-autoexpand.html ; https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices.html#bestpractices-monitor-disk-space
- **Last verified:** 2026-10-12

### MSK-009 — Commit offsets only after processing succeeds
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Consumers commit offsets after the record's side effects complete (manual commit or auto-commit with processing inside the callback that throws on failure), and handle transient errors with backoff instead of crashing.
- **Why:** Committing before processing, or swallowing errors inside `eachMessage`, advances the offset past records that were never processed: data loss. Crashing on transient errors triggers rebalances that stall the whole group.
- **Detect:** KafkaJS `eachMessage: async ({ message }) => { process(message).catch(console.error) }` (not awaited) or `try { ... } catch { log }` without rethrow; Go readers using `ReadMessage` (auto-commit) then processing asynchronously in goroutines; `CommitMessages` before the work.
- **Fix:** Await processing inside `eachMessage` and rethrow on failure; in Go use `FetchMessage` → process → `CommitMessages`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-kafka-client.html#bestpractices-kafka-client-client-availability
- **Last verified:** 2026-10-12

### MSK-010 — Read from the closest replica to cut cross-AZ transfer
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go, Terraform
- **Rule:** Consumers set `client.rack` to their AZ ID and the cluster configuration enables rack-aware replica selection.
- **Why:** Without it consumers read from partition leaders, two thirds of which sit in other AZs, and pay cross-AZ data transfer on every byte consumed.
- **Detect:** Consumers without `rackId` (KafkaJS) / `kgo.Rack(...)` (franz-go) / `client.rack`; `server_properties` without `replica.selector.class=org.apache.kafka.common.replica.RackAwareReplicaSelector`.
- **Fix:** Set the broker property and pass the consumer's AZ ID (from instance/task metadata) as rack.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-kafka-client.html ; https://aws.amazon.com/blogs/big-data/reduce-network-traffic-costs-of-your-amazon-msk-consumers-with-rack-awareness/
- **Last verified:** 2026-10-12

### MSK-011 — Batch and compress on the producer
- **Severity:** medium
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Producers linger ≥ 5 ms (25 ms typical), use 64–128 KB batches and `lz4`/`zstd` compression.
- **Why:** Tiny batches multiply requests and broker CPU; MSK recommends against `linger.ms=0` even for low latency. Compression cuts storage, network and cross-AZ bytes.
- **Detect:** `linger.ms=0`, KafkaJS `producer.send` per message in a loop without batching and without `compression`, kafka-go `BatchTimeout` tiny with `BatchSize: 1`, franz-go `kgo.ProducerLinger(0)`.
- **Fix:** Send arrays of messages per call; set compression (`CompressionTypes.ZSTD` needs a codec in KafkaJS; `kgo.ProducerBatchCompression(kgo.ZstdCompression())`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-kafka-client.html#bestpractices-kafka-client-performance
- **Last verified:** 2026-10-12

### MSK-012 — Stabilise consumer groups during deploys
- **Severity:** low
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Consumers set `session.timeout.ms` ≈ 60 s, `heartbeat.interval.ms` ≈ 10 s, a cooperative-sticky assignor and a stable `group.instance.id`, and close cleanly on SIGTERM.
- **Why:** Short sessions and eager assignors trigger full-group rebalances on every rolling deploy or GC pause, stopping consumption for all partitions each time.
- **Detect:** Consumer configs with `sessionTimeout` < 10 s, no shutdown hook calling `consumer.disconnect()` / `client.Close()`.
- **Fix:** Apply the recommended values and a SIGTERM handler.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-kafka-client.html
- **Last verified:** 2026-10-12
