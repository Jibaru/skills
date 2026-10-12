# Lambda: triggers, async invocation and event source mappings

Rules for how events reach a function: asynchronous invocation (S3, SNS, EventBridge,
`InvocationType: "Event"`), event source mappings (SQS, Kinesis, DynamoDB Streams) and the
loops they can form. Queue/topic/bus design itself belongs to **aws-messaging**; this file covers
the Lambda side of the contract. Check IaC and handler code together: most rules here are a
mismatch between the two.

### LMB-027 — Capture failed async invocations with an on-failure destination or DLQ
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every function invoked asynchronously gets an on-failure destination (preferred: the record includes the error and context) or a function DLQ, and an explicit retry/age policy that fits the work.
- **Why:** By default Lambda retries a failed async event twice (1 min, then 2 min apart) and keeps throttled events for up to 6 hours, then discards them silently. An S3 upload whose processing failed three times simply never gets processed, with no record of it.
- **Detect:** Functions targeted by `aws_s3_bucket_notification`, `aws_sns_topic_subscription (protocol = "lambda")`, `aws_cloudwatch_event_target`, `aws_scheduler_schedule`, CDK `bucket.addEventNotification(..., new LambdaDestination(fn))`, `topic.addSubscription(new LambdaSubscription(fn))`, `new targets.LambdaFunction(fn)`, SST `bucket.notify`, `topic.subscribe`, `bus.subscribe`, `sst.aws.Cron`, or code calling `InvokeCommand({ InvocationType: "Event" })` with no `aws_lambda_function_event_invoke_config { destination_config { on_failure { ... } } }`, no `dead_letter_config`, and no CDK `onFailure`/`deadLetterQueue`/`deadLetterQueueEnabled`.
- **Fix:**
  ```hcl
  resource "aws_lambda_function_event_invoke_config" "thumbnailer" {
    function_name                = aws_lambda_function.thumbnailer.function_name
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 3600
    destination_config {
      on_failure { destination = aws_sqs_queue.thumbnailer_failures.arn }
    }
  }
  ```
  ```ts
  new NodejsFunction(this, "Thumb", { onFailure: new destinations.SqsDestination(failures), retryAttempts: 2 });
  ```
  EventBridge targets also have their own retry policy and target DLQ: hand off to **aws-messaging**.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html , https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function_event_invoke_config
- **Last verified:** 2026-10-12

### LMB-028 — Turn on partial batch responses and make code and config agree
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** SQS, Kinesis and DynamoDB Streams consumers return `{ batchItemFailures: [...] }` and the mapping has `ReportBatchItemFailures` enabled. Both halves must be present.
- **Why:** Without it, one bad message makes the whole batch visible again, so the nine good messages are reprocessed (duplicates) and SQS polling backs off. The inverse mismatch is worse: code returns `batchItemFailures` but the mapping is not configured, so Lambda treats the invocation as a full success and deletes the failed messages (silent data loss).
- **Detect:** Terraform `aws_lambda_event_source_mapping` without `function_response_types = ["ReportBatchItemFailures"]`; CDK `new SqsEventSource(queue)` / `DynamoEventSource` / `KinesisEventSource` without `reportBatchItemFailures: true`; SST `queue.subscribe(...)` without `batch: { partialResponses: true }` (default `false`). Then check the handler: returns `batchItemFailures` (mismatch if mapping lacks the flag) or loops records and `throw`s on the first failure (whole batch retried).
- **Fix:**
  ```hcl
  resource "aws_lambda_event_source_mapping" "orders" {
    event_source_arn        = aws_sqs_queue.orders.arn
    function_name           = aws_lambda_function.orders.arn
    function_response_types = ["ReportBatchItemFailures"]
  }
  ```
  ```ts
  queue.subscribe("src/orders.handler", { batch: { partialResponses: true } });
  ```
  TS code: `processPartialResponse` from `@aws-lambda-powertools/batch`, or catch per record and push `{ itemIdentifier: record.messageId }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html , https://docs.aws.amazon.com/lambda/latest/dg/services-kinesis-batchfailurereporting.html , https://sst.dev/docs/component/aws/queue/ , https://docs.aws.amazon.com/powertools/typescript/latest/features/batch/
- **Last verified:** 2026-10-12

### LMB-029 — Report the right item identifiers and never swallow failures
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** `itemIdentifier` is the SQS `messageId` (streams: the record's sequence number); a caught error must add the record to `batchItemFailures`. For FIFO queues stop at the first failure and return it plus every unprocessed record.
- **Why:** An empty, null, unknown or wrong-key identifier makes Lambda treat the whole batch as failed (everything reprocessed). Catching an error and returning an empty list marks failed messages as processed and deletes them. Continuing past a FIFO failure breaks per-group ordering.
- **Detect:** `itemIdentifier: record.receiptHandle`, `itemIdentifier: record.body`, `itemIdentifier: ""`, `{ itemIdentifierId: ... }`, `{ id: ... }`; `catch (e) { console.error(e) }` without pushing to `batchItemFailures`; Go `events.SQSBatchItemFailure{ItemIdentifier: r.ReceiptHandle}`; FIFO queues (`fifo_queue = true`, `.fifo` names, `fifo: true` in SST) whose handler `continue`s after a failure.
- **Fix:**
  ```ts
  for (const record of event.Records) {
    try { await process(record); }
    catch (err) { logger.error("failed", { err, id: record.messageId }); failures.push({ itemIdentifier: record.messageId }); }
  }
  return { batchItemFailures: failures };
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html#sqs-batchfailurereporting-conditions
- **Last verified:** 2026-10-12

### LMB-030 — Set SQS visibility timeout to at least 6× the function timeout
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** For a queue that triggers Lambda, `visibility timeout ≥ 6 × function timeout + MaximumBatchingWindowInSeconds`.
- **Why:** If the message becomes visible again while the first invocation is still running or being retried after throttling, a second consumer processes it too (duplicates). Lambda refuses to create the mapping at all when function timeout > visibility timeout. The defaults collide: SQS/CDK/SST queues default to 30 s; SST functions default to a 20 s timeout (SST subscriptions default to a 0 s batch window), so an all-default SST queue subscriber needs 6 × 20 = 120 s, four times the default.
- **Detect:** `aws_sqs_queue.visibility_timeout_seconds` (default 30) vs the consumer's `aws_lambda_function.timeout`; CDK `new sqs.Queue(...)` without `visibilityTimeout` vs `timeout` on the function used in `SqsEventSource`; SST `new sst.aws.Queue(...)` without `visibilityTimeout` with `queue.subscribe(...)`.
- **Fix:**
  ```ts
  const queue = new sst.aws.Queue("Orders", { visibilityTimeout: "3 minutes" });
  queue.subscribe({ handler: "src/orders.handler", timeout: "25 seconds" }, { batch: { partialResponses: true } });
  ```
  ```hcl
  visibility_timeout_seconds = 6 * aws_lambda_function.orders.timeout + 20
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html , https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html , https://sst.dev/docs/component/aws/queue/
- **Last verified:** 2026-10-12

### LMB-031 — Give the source queue a redrive policy (maxReceiveCount ≥ 5)
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** A queue consumed by Lambda needs a DLQ on the queue's redrive policy with `maxReceiveCount` of at least 5. A DLQ configured on the function does nothing for event source mappings.
- **Why:** Without a redrive policy a poison message is retried until the queue's retention expires (4 days by default), burning invocations the whole time. `maxReceiveCount` of 1–2 sends good messages to the DLQ after a single throttle or recursion-detection hit, because those also increment the receive count.
- **Detect:** `aws_sqs_queue` used as `event_source_arn` without `redrive_policy`; `maxReceiveCount` < 5; CDK `new sqs.Queue(...)` without `deadLetterQueue: { queue, maxReceiveCount }`; SST `new sst.aws.Queue(...)` without `dlq` or with `dlq: { retry: <5 }` (SST default retry is 3); `dead_letter_config`/`deadLetterQueue` set on an SQS-triggered function as the "fix".
- **Fix:**
  ```hcl
  redrive_policy = jsonencode({ deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn, maxReceiveCount = 5 })
  ```
  ```ts
  new sst.aws.Queue("Orders", { dlq: { queue: dlq.arn, retry: 5 }, visibilityTimeout: "3 minutes" });
  ```
  Alarming on DLQ depth and redrive tooling: hand off to **aws-messaging** / **aws-observability**.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html , https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html , https://sst.dev/docs/component/aws/queue/
- **Last verified:** 2026-10-12

### LMB-032 — Bound retries on Kinesis and DynamoDB stream mappings
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Stream event source mappings set `maximum_retry_attempts`, `maximum_record_age_in_seconds`, `bisect_batch_on_function_error = true` and an on-failure destination; enable `ReportBatchItemFailures` too.
- **Why:** Defaults are `-1` (retry forever) and `-1` (never discard). One poison record blocks its shard: every later record waits behind it until the data ages out of the stream, `IteratorAge` climbs, and when retention expires the blocked records are lost with no copy.
- **Detect:** Terraform `aws_lambda_event_source_mapping` with `starting_position` (stream source) and no `maximum_retry_attempts`/`destination_config`; CDK `new DynamoEventSource(table, ...)` / `new KinesisEventSource(stream, ...)` without `retryAttempts`, `maxRecordAge`, `bisectBatchOnError`, `onFailure`; SST `table.subscribe(...)`/`stream.subscribe(...)` without equivalent `transform.eventSourceMapping` settings.
- **Fix:**
  ```hcl
  resource "aws_lambda_event_source_mapping" "ledger" {
    event_source_arn               = aws_dynamodb_table.ledger.stream_arn
    function_name                  = aws_lambda_function.ledger.arn
    starting_position              = "LATEST"
    maximum_retry_attempts         = 5
    maximum_record_age_in_seconds  = 3600
    bisect_batch_on_function_error = true
    function_response_types        = ["ReportBatchItemFailures"]
    destination_config {
      on_failure { destination_arn = aws_sqs_queue.ledger_failures.arn }
    }
  }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-kinesis-parameters.html , https://docs.aws.amazon.com/lambda/latest/dg/kinesis-on-failure-destination.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping
- **Last verified:** 2026-10-12

### LMB-033 — Throttle SQS consumers with ESM maximum concurrency, not tiny reserved concurrency
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** To limit how fast a queue is drained, set the mapping's maximum concurrency (2–1,000). If the function also has reserved concurrency, keep it ≥ the sum of maximum concurrency across its SQS mappings, and never below 5.
- **Why:** The SQS poller starts at 5 concurrent invocations and adds up to 300 per minute (to 1,250 per mapping) regardless of reserved concurrency; AWS says to set reserved concurrency to at least 5 for SQS consumers; with reserved concurrency below that, invocations are throttled, messages return to the queue with an incremented receive count, and healthy messages end up in the DLQ.
- **Detect:** SQS-triggered functions with `reserved_concurrent_executions` / `reservedConcurrentExecutions` / SST `concurrency.reserved` < 5 or used as a rate limiter; mappings without `scaling_config { maximum_concurrency }` / CDK `maxConcurrency` where the downstream is fragile; `maximum_concurrency` greater than the function's reserved concurrency.
- **Fix:**
  ```hcl
  scaling_config { maximum_concurrency = 10 }
  ```
  ```ts
  fn.addEventSource(new SqsEventSource(queue, { maxConcurrency: 10, reportBatchItemFailures: true }));
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html , https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html
- **Last verified:** 2026-10-12

### LMB-034 — Filter events at the mapping instead of in the handler
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** When a handler discards most records by type or field, move that predicate into the event source mapping's filter criteria. Know the semantics: filtered-out SQS messages are deleted from the queue.
- **Why:** Every discarded record still costs an invocation and duration; on a DynamoDB stream where you only want `INSERT`s, most invocations do nothing. Filtering at the mapping removes them before Lambda is invoked.
- **Detect:** Handlers starting with `if (record.eventName !== "INSERT") continue;`, `if (body.type !== "order.created") return;`, Go `if r.EventName != "INSERT" { continue }`, with no `filter_criteria` (Terraform), `filters: [FilterCriteria.filter(...)]` (CDK), or `filters` (SST subscribe). Flag the reverse as a bug: an SQS filter on a queue that another consumer also expects to read.
- **Fix:**
  ```hcl
  filter_criteria {
    filter { pattern = jsonencode({ eventName = ["INSERT"] }) }
  }
  ```
  ```ts
  fn.addEventSource(new DynamoEventSource(table, {
    startingPosition: lambda.StartingPosition.LATEST,
    filters: [lambda.FilterCriteria.filter({ eventName: lambda.FilterRule.isEqual("INSERT") })],
  }));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html , https://docs.aws.amazon.com/lambda/latest/dg/with-sqs-filtering.html
- **Last verified:** 2026-10-12

### LMB-035 — Break trigger-write loops (same bucket, same queue, same table)
- **Severity:** critical
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A function must not write to the resource that triggers it unless the trigger is scoped so the write cannot match (S3 prefix/suffix filter, separate output bucket, a guard attribute on the item).
- **Why:** An S3-triggered thumbnailer that writes `thumbs/x.jpg` into the same bucket with an unfiltered `ObjectCreated` notification triggers itself. Lambda stops SQS/S3/SNS/EventBridge-custom-bus loops after about 16 hops, but each loop still costs, and a DynamoDB-stream handler that updates its own table is not detected at all: it loops until someone throttles the function.
- **Detect:** `aws_s3_bucket_notification` on bucket X with `lambda_function { events = ["s3:ObjectCreated:*"] }` and no `filter_prefix`/`filter_suffix`, while the function code does `PutObjectCommand({ Bucket: <same bucket or env var pointing to it>` or Go `PutObject(ctx, &s3.PutObjectInput{Bucket: <same>`; CDK `bucket.addEventNotification(s3.EventType.OBJECT_CREATED, dest)` without a `{ prefix }` filter plus `bucket.grantWrite(fn)`; SST `bucket.notify({ notifications: [{ function, events }] })` without `filterPrefix`; DynamoDB stream consumers that `PutItem`/`UpdateItem` the source table; SQS consumers that `SendMessage` to their own queue URL.
- **Fix:** Read from `uploads/`, write to `thumbnails/` with a matching filter (or a separate bucket):
  ```hcl
  lambda_function {
    lambda_function_arn = aws_lambda_function.thumbnailer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
  }
  ```
  For DynamoDB streams, combine an event filter (LMB-034) with a guard field the handler sets and skips.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html , https://docs.aws.amazon.com/lambda/latest/dg/recursive-runaway.html
- **Last verified:** 2026-10-12

### LMB-036 — Batch queue and stream records instead of one record per invocation
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** For high-volume standard queues and streams without strict per-message latency needs, raise batch size (with a batching window ≥ 1 s when above 10) rather than `batch_size = 1`.
- **Why:** Each invocation carries per-request charges ($0.20 per million) plus init/SDK overhead. 100 M messages/month at batch size 1 = 100 M requests ($20) and 100 M handler overheads; batch size 10 = 10 M requests ($2) and a tenth of the overhead. Combine with partial batch responses (LMB-028) so larger batches don't amplify retries.
- **Detect:** `batch_size = 1`, CDK `batchSize: 1`, SST `batch: { size: 1 }` on standard (non-FIFO) queues or streams, justified only by "simpler error handling".
- **Fix:**
  ```hcl
  batch_size                         = 50
  maximum_batching_window_in_seconds = 2
  function_response_types            = ["ReportBatchItemFailures"]
  ```
  Keep visibility timeout in step (LMB-030) since the window adds to it.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html , https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html , https://aws.amazon.com/lambda/pricing/
- **Last verified:** 2026-10-12
