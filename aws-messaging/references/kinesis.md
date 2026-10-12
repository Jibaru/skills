# Kinesis Data Streams rules

Streams, capacity modes, producers (`@aws-sdk/client-kinesis`,
`github.com/aws/aws-sdk-go-v2/service/kinesis`), Lambda event source mappings on streams and
enhanced fan-out consumers. Firehose delivery is out of scope (→ `aws-data` / `aws-storage`).

### KIN-001 — Pick the capacity mode from the traffic shape
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Use on-demand for spiky or unknown traffic; use provisioned for low, steady streams (most dev/test) and for steady high throughput; consider On-demand Advantage only when the account sustains ≥ 25 MiB/s ingest and retrieval.
- **Why:** On-demand Standard charges a fixed fee per stream-hour plus per-GB ingest and retrieval. In us-east-1, $0.04/h × 730 = **$29.20/month per stream** before any data; one provisioned shard is $0.015 × 730 = **$10.95/month** (+ $0.014 per million 25 KB PUT units). Ten idle on-demand dev streams cost ~$292/month. Conversely, CDK defaults to `PROVISIONED` with 1 shard, which throttles above 1 MB/s or 1,000 records/s. SST `KinesisStream` defaults to on-demand.
- **Detect:** `aws_kinesis_stream` `stream_mode_details { stream_mode = "ON_DEMAND" }` in per-stage/per-developer stacks; CDK `new kinesis.Stream(this, ...)` with no `streamMode`/`shardCount` on a stream fed by many producers; `sst.aws.KinesisStream` per stage.
- **Fix:** `stream_mode = "PROVISIONED"`, `shard_count = 1` for dev; on-demand for spiky prod; size provisioned shards with `ceil(max(write_KiB/1024, read_KiB/2048))`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/how-do-i-size-a-stream.html ; https://aws.amazon.com/kinesis/data-streams/pricing/ ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kinesis.StreamProps.html
- **Last verified:** 2026-10-12

### KIN-002 — Use a high-cardinality, evenly spread partition key
- **Severity:** high
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** The partition key has many more distinct values than shards and no single value carries a large share of traffic.
- **Why:** All records with one key land on one shard, capped at 1 MB/s or 1,000 records/s for writes. A constant key (`"events"`, `"1"`) or a low-cardinality one (`env`, `country`, today's date) turns the stream into one hot shard: `ProvisionedThroughputExceededException`, rising latency, and on-demand mode does not isolate hot keys either.
- **Detect:** `PartitionKey: "<literal>"`, `aws.String("events")`, `PartitionKey: new Date().toISOString().slice(0, 10)`, `PartitionKey: tenantId` where one tenant dominates, `PartitionKey: String(Math.floor(Math.random() * 2))`.
- **Fix:** Key by the entity whose order matters (`orderId`, `deviceId`); if no ordering is needed, `PartitionKey: randomUUID()`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/how-do-i-size-a-stream.html#hotshards ; https://docs.aws.amazon.com/streams/latest/dev/developing-producers-with-sdk.html ; https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html
- **Last verified:** 2026-10-12

### KIN-003 — Retry the failed records of PutRecords
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** After `PutRecords`, check `FailedRecordCount` and resend only the records whose result has an `ErrorCode`, with backoff.
- **Why:** `PutRecords` does not fail as a whole: throttled records come back with `ProvisionedThroughputExceededException` inside a 200 response. Ignoring them loses data exactly when the stream is busiest.
- **Detect:** `await kinesis.send(new PutRecordsCommand(...))` with no read of `FailedRecordCount`/`Records[i].ErrorCode`; Go `_, err := client.PutRecords(...)` or `out.FailedRecordCount` unused.
- **Fix:**
  ```go
  out, err := client.PutRecords(ctx, in)
  if err != nil { return err }
  if aws.ToInt32(out.FailedRecordCount) > 0 {
      var retry []types.PutRecordsRequestEntry
      for i, r := range out.Records {
          if r.ErrorCode != nil { retry = append(retry, in.Records[i]) }
      }
      // back off, then PutRecords(retry)
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/developing-producers-with-sdk.html#kinesis-using-sdk-java-putrecords-handling-failures
- **Last verified:** 2026-10-12

### KIN-004 — Bound retries on stream event source mappings and keep the failures
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Lambda mappings on Kinesis set `maximum_retry_attempts`, `maximum_record_age_in_seconds`, `bisect_batch_on_function_error = true` and an on-failure destination.
- **Why:** The defaults retry forever (`-1`) until the record expires. One poison record blocks its shard for the whole retention period (24 h by default, up to 365 days): `IteratorAge` climbs, every later record on that shard waits, and when the record finally expires it is gone without a trace.
- **Detect:** `aws_lambda_event_source_mapping` with a Kinesis `event_source_arn` and no `maximum_retry_attempts` / `destination_config.on_failure`; CDK `new KinesisEventSource(stream, { startingPosition })` without `retryAttempts`, `maxRecordAge`, `bisectBatchOnError`, `onFailure`; SST `stream.subscribe(...)` without `transform.eventSourceMapping` setting those fields (SST sets only `startingPosition: "LATEST"`).
- **Fix:**
  ```ts
  fn.addEventSource(new KinesisEventSource(stream, {
    startingPosition: lambda.StartingPosition.TRIM_HORIZON,
    retryAttempts: 3,
    maxRecordAge: Duration.hours(1),
    bisectBatchOnError: true,
    reportBatchItemFailures: true,
    onFailure: new SqsDlq(failedQueue),
  }));
  ```
  The SQS/SNS destination receives only shard and sequence metadata; re-read records before they expire, or use an S3 destination to keep the payload.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/kinesis-on-failure-destination.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_event_sources.KinesisEventSourceProps.html ; https://sst.dev/docs/component/aws/kinesis-stream/
- **Last verified:** 2026-10-12

### KIN-005 — Report the failed record's sequence number and stop there
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform, CDK, SST
- **Rule:** With `ReportBatchItemFailures` on a stream mapping, return `{ itemIdentifier: record.kinesis.sequenceNumber }` for the first failed record and stop processing the batch.
- **Why:** Lambda checkpoints at the lowest reported sequence number and retries everything after it. Returning `eventID`, `partitionKey` or an empty identifier fails the whole batch; continuing past a failure applies later records out of order and then reprocesses them.
- **Detect:** Kinesis handlers returning `itemIdentifier: record.eventID` / `record.kinesis.partitionKey` / `""`; loops that `push` failures and `continue`; `function_response_types = ["ReportBatchItemFailures"]` missing while the handler returns `batchItemFailures` (then the response is ignored).
- **Fix:**
  ```ts
  for (const record of event.Records) {
    try { await handle(record); }
    catch { return { batchItemFailures: [{ itemIdentifier: record.kinesis.sequenceNumber }] }; }
  }
  return { batchItemFailures: [] };
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-kinesis-batchfailurereporting.html
- **Last verified:** 2026-10-12

### KIN-006 — Pay for enhanced fan-out only where it earns its keep
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Register EFO consumers when there are more than ~2 consumers per stream or a consumer needs ~70 ms latency; otherwise use shared-throughput polling.
- **Why:** In provisioned mode EFO bills per consumer-shard-hour plus per GB retrieved: 20 shards × 2 EFO consumers × $0.015 × 730 = **$438/month** before data ($0.013/GB) in us-east-1, for consumers that might be fine sharing 2 MB/s per shard. On-demand Standard adds a per-GB EFO retrieval charge; On-demand Advantage includes EFO at no premium, so this rule targets provisioned and On-demand Standard streams.
- **Detect:** `aws_kinesis_stream_consumer`, `RegisterStreamConsumerCommand`, CDK `new kinesis.StreamConsumer` / `KinesisConsumerEventSource`, with a single consumer on the stream or a batch/hourly consumer.
- **Fix:** Use a standard iterator (plain `KinesisEventSource`) for the one or two non-latency-critical consumers.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/enhanced-consumers.html ; https://aws.amazon.com/kinesis/data-streams/pricing/
- **Last verified:** 2026-10-12

### KIN-007 — Don't hang more than two shared-throughput consumers on a stream
- **Severity:** medium
- **Category:** performance
- **Applies to:** Terraform, CDK, SST
- **Rule:** Three or more standard-iterator consumers (Lambda mappings, KCL apps, Firehose, Flink) on one stream need EFO for some of them, or a fan-out via a single consumer.
- **Why:** Shared consumers split 5 `GetRecords` calls/s and 2 MB/s per shard. With 3+ consumers on a busy stream they throttle each other (`ReadProvisionedThroughputExceeded`), `IteratorAge` grows and data can expire unread. Report it only when the stream's write volume makes the 2 MB/s read share plausible to exhaust.
- **Detect:** ≥ 3 `aws_lambda_event_source_mapping` (or `KinesisEventSource`, SST `subscribe`) with the same stream ARN and no consumer ARN; plus other readers (`aws_kinesis_firehose_delivery_stream` with `kinesis_source_configuration`).
- **Fix:** Move latency-sensitive readers to EFO (`KinesisConsumerEventSource` / ESM on `aws_kinesis_stream_consumer.arn`).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html ; https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html
- **Last verified:** 2026-10-12

### KIN-008 — Scale a lagging Lambda consumer with ParallelizationFactor
- **Severity:** medium
- **Category:** performance
- **Applies to:** Terraform, CDK, SST
- **Rule:** When one function falls behind a stream, raise `parallelization_factor` (1–10) before adding shards.
- **Why:** By default Lambda runs one batch per shard at a time. Parallelization keeps per-partition-key ordering while multiplying throughput, without paying for more shards.
- **Detect:** Mapping on a high-volume stream with `parallelization_factor` unset/1 and a slow handler (network calls per record), or `shard_count` raised only to speed up consumption.
- **Fix:** `parallelization_factor = 4` (CDK `parallelizationFactor: 4`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html#kinesis-polling-and-batching
- **Last verified:** 2026-10-12

### KIN-009 — Write with PutRecords, not one PutRecord per event
- **Severity:** medium
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Buffer records and send them with `PutRecords` (up to 500 records per call), handling failures per KIN-003.
- **Why:** `PutRecord` per event costs one HTTP round trip per record and caps producer throughput; AWS recommends `PutRecords` for most producers.
- **Detect:** `PutRecordCommand` / `client.PutRecord` inside loops, request handlers that publish one record per item of an array.
- **Fix:** Collect up to 500 entries and call `PutRecordsCommand({ StreamARN, Records })`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/developing-producers-with-sdk.html ; https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html
- **Last verified:** 2026-10-12

### KIN-010 — Keep retention and record age consistent with recovery needs
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set `retention_period` to the longest outage you must replay from (beyond 24 h is billed as extended/long-term retention), and the mapping's `maximum_record_age_in_seconds` below it.
- **Why:** Retention set to 8,760 h "just in case" bills long-term storage for every GB; retention left at 24 h with a consumer that can be down over a weekend loses data.
- **Detect:** `retention_period` ≥ 168 without a replay/backfill use case in the code; `retention_period = 24` with consumers that run on schedules or have no alarm on iterator age.
- **Fix:** Choose the window explicitly (`retention_period = 72`) and document why.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/kinesis-extended-retention.html ; https://aws.amazon.com/kinesis/data-streams/pricing/
- **Last verified:** 2026-10-12

### KIN-011 — Encrypt streams at rest
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set `encryption_type = "KMS"` on Terraform streams and on SST `KinesisStream` (via `transform.stream`); CDK encrypts by default.
- **Why:** Terraform's default is `NONE`, and SST's `KinesisStream` sets only the capacity mode on the underlying stream, so it inherits the same `NONE`; records (often PII, clickstreams) sit unencrypted. CDK `Stream` defaults to KMS. Key choice and policy review → `aws-security`.
- **Detect:** `aws_kinesis_stream` without `encryption_type` or with `"NONE"`; `new sst.aws.KinesisStream(...)` without `transform.stream` setting `encryptionType: "KMS"`; CDK `encryption: StreamEncryption.UNENCRYPTED`.
- **Fix:** `encryption_type = "KMS"`, `kms_key_id = "alias/aws/kinesis"` (or a CMK); SST: `transform: { stream: { encryptionType: "KMS", kmsKeyId: "alias/aws/kinesis" } }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/server-side-encryption.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kinesis_stream ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kinesis.StreamProps.html ; https://sst.dev/docs/component/aws/kinesis-stream/
- **Last verified:** 2026-10-12

### KIN-012 — Alarm on iterator age for every stream consumer
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Each consumer has an alarm on `GetRecords.IteratorAgeMilliseconds` (stream) or the Lambda `IteratorAge` metric, set well below the retention period. Alarm design details → `aws-observability`.
- **Why:** A stuck or slow consumer is invisible until data starts expiring; iterator age is the one metric that shows it hours earlier.
- **Detect:** A stream with consumers and no `aws_cloudwatch_metric_alarm` on `IteratorAgeMilliseconds`/`IteratorAge` in the same stack.
- **Fix:** Alarm at, e.g., 10 % of retention.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/streams/latest/dev/monitoring-with-cloudwatch.html ; https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html
- **Last verified:** 2026-10-12
