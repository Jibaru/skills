# SQS rules

Queues, dead-letter queues, Lambda event source mappings (ESM) on SQS, and hand-written
consumers/producers with `@aws-sdk/client-sqs` or `github.com/aws/aws-sdk-go-v2/service/sqs`.
Lambda function sizing itself belongs to `aws-compute`; queue alarms to `aws-observability`.

### SQS-001 — Set the queue visibility timeout to at least 6× the consumer Lambda timeout
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** For a queue drained by a Lambda ESM, set the visibility timeout to at least six times the function timeout, plus `MaximumBatchingWindowInSeconds` when a batch window is set.
- **Why:** Lambda retries throttled batches inside the visibility window. With visibility ≈ function timeout, a slow or throttled batch reappears while the first invocation is still running, so the same messages are processed twice in parallel and `receiveCount` climbs toward the DLQ. Lambda rejects the mapping outright when the function timeout exceeds the visibility timeout.
- **Detect:** Follow `aws_lambda_event_source_mapping.event_source_arn` → `aws_sqs_queue.visibility_timeout_seconds` (default 30) and compare with `aws_lambda_function.timeout` (+ `maximum_batching_window_in_seconds`). CDK: `new sqs.Queue(..., { visibilityTimeout })` (default 30 s) consumed by `new SqsEventSource(queue)` on a function with `timeout`. SST: `new sst.aws.Queue(..., { visibilityTimeout })` (default `"30 seconds"`) with `queue.subscribe(...)` whose function `timeout` defaults to `"20 seconds"` (6× = 120 s, so the SST defaults already fall short).
- **Fix:** Raise the queue timeout (or lower the function timeout).
  ```hcl
  resource "aws_sqs_queue" "orders" {
    visibility_timeout_seconds = 6 * aws_lambda_function.consumer.timeout + 20 # + batching window
  }
  ```
  ```ts
  const queue = new sst.aws.Queue("Orders", { visibilityTimeout: "3 minutes" });
  queue.subscribe({ handler: "src/consumer.handler", timeout: "30 seconds" });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html
- **Last verified:** 2026-10-12

### SQS-002 — Give every work queue a dead-letter queue
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every queue that a consumer processes has a redrive policy pointing at a DLQ (same account, same Region, same type: FIFO source → FIFO DLQ).
- **Why:** Without a DLQ a poison message is received, fails and reappears until the retention period ends (4 days by default, up to 14). It burns invocations the whole time, hides real failures, and on a FIFO queue it blocks its whole message group.
- **Detect:** `aws_sqs_queue` with no `redrive_policy` and no `aws_sqs_queue_redrive_policy` for it, yet referenced by `aws_lambda_event_source_mapping` or by a poller. CDK: `new sqs.Queue` without `deadLetterQueue`. SST: `new sst.aws.Queue` without `dlq`. Exclude queues that are themselves DLQs.
- **Fix:**
  ```hcl
  resource "aws_sqs_queue" "orders" {
    redrive_policy = jsonencode({
      deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
      maxReceiveCount     = 5
    })
  }
  ```
  ```ts
  new sqs.Queue(this, "Orders", { deadLetterQueue: { queue: dlq, maxReceiveCount: 5 } });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
- **Last verified:** 2026-10-12

### SQS-003 — Keep maxReceiveCount at 5 or more for Lambda consumers
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set `maxReceiveCount` to at least 5 when Lambda consumes the queue.
- **Why:** Lambda throttling and transient errors also increment the receive count. With `maxReceiveCount` 1–2, a short downstream blip or a concurrency throttle moves healthy messages to the DLQ, which then needs a manual redrive.
- **Detect:** `maxReceiveCount = 1|2|3` in `redrive_policy` / `aws_sqs_queue_redrive_policy`; CDK `deadLetterQueue: { maxReceiveCount: <5 }`; SST `dlq: { retry: <5 }` and plain `dlq: queue.arn` (SST then uses `retry: 3`).
- **Fix:** `maxReceiveCount = 5` (or more for flaky downstreams); SST `dlq: { queue: dlq.arn, retry: 5 }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html ; https://sst.dev/docs/component/aws/queue/
- **Last verified:** 2026-10-12

### SQS-004 — Give a standard queue's DLQ a longer retention than its source
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set the DLQ `message_retention_seconds` above the source queue's, ideally the 14-day maximum.
- **Why:** For standard queues the enqueue timestamp survives the move to the DLQ. A message that spent 3 days failing in a 4-day source queue is deleted from a 4-day DLQ after 1 more day, before anyone looks at it. (FIFO resets the timestamp on move.)
- **Detect:** DLQ `aws_sqs_queue` with no `message_retention_seconds` (default 345600 = 4 days) or a value ≤ the source queue's. CDK DLQ without `retentionPeriod` (default 4 days). SST: DLQ `sst.aws.Queue` without `transform.queue.messageRetentionSeconds`.
- **Fix:** `message_retention_seconds = 1209600` on the DLQ; CDK `retentionPeriod: Duration.days(14)`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html#understanding-message-retention-periods
- **Last verified:** 2026-10-12

### SQS-005 — Turn on partial batch responses for SQS-triggered Lambdas
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** With batch size > 1, enable `ReportBatchItemFailures` on the mapping and return only the failed message IDs.
- **Why:** By default one failed record makes the whole batch visible again, so the successful records are reprocessed (duplicate side effects) and also climb toward `maxReceiveCount`. Without it Lambda also scales polling down on failures.
- **Detect:** `aws_lambda_event_source_mapping` on an SQS ARN without `function_response_types = ["ReportBatchItemFailures"]` and `batch_size` > 1 (default 10). CDK `new SqsEventSource(queue, { ... })` without `reportBatchItemFailures: true`. SST `queue.subscribe(...)` without `batch: { partialResponses: true }` (default `false`). Handler loops over `event.Records` and throws on the first error.
- **Fix:** Enable it and use the Powertools batch processor.
  ```ts
  import { BatchProcessor, EventType, processPartialResponse } from "@aws-lambda-powertools/batch";
  const processor = new BatchProcessor(EventType.SQS);
  export const handler = (event: SQSEvent, context: Context) =>
    processPartialResponse(event, recordHandler, processor, { context });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html ; https://docs.aws.amazon.com/powertools/typescript/latest/features/batch/
- **Last verified:** 2026-10-12

### SQS-006 — Wire the partial-batch contract on both sides, or failed messages are deleted
- **Severity:** critical
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A handler that catches per-record errors and returns `batchItemFailures` must run behind a mapping with `ReportBatchItemFailures`; a handler behind such a mapping must report every failure with the record's `messageId`.
- **Why:** If the mapping lacks `ReportBatchItemFailures`, Lambda ignores the returned list, treats the normal return as full success and deletes the whole batch: every failed message is silently lost. With the flag on, returning an empty/null/unknown `itemIdentifier` fails the whole batch; catching and logging without reporting deletes the failed record.
- **Detect:** Handler code with `batchItemFailures.push({ itemIdentifier: record.messageId })` / Go `events.SQSEventResponse{BatchItemFailures: ...}` paired with an ESM lacking `function_response_types` (Terraform), `reportBatchItemFailures` (CDK) or `batch.partialResponses: true` (SST). Also `catch (e) { console.error(e) }` inside the record loop with no push and no rethrow; `itemIdentifier: record.body` or `record.receiptHandle`.
- **Fix:**
  ```hcl
  resource "aws_lambda_event_source_mapping" "orders" {
    event_source_arn        = aws_sqs_queue.orders.arn
    function_name           = aws_lambda_function.consumer.arn
    function_response_types = ["ReportBatchItemFailures"]
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html#sqs-batchfailurereporting-conditions ; https://docs.aws.amazon.com/lambda/latest/api/API_CreateEventSourceMapping.html
- **Last verified:** 2026-10-12

### SQS-007 — On FIFO queues, stop at the first failure and report the rest
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** In a partial-batch handler for a FIFO queue, stop processing at the first failed record and return it plus every unprocessed record after it.
- **Why:** Continuing past a failure processes later messages of the same group before the failed one is retried, breaking the ordering the FIFO queue exists for (e.g. `OrderShipped` applied before `OrderPaid`).
- **Detect:** Queue has `fifo_queue = true` / `fifo: true` / name ends in `.fifo`, and the handler `for` loop does `try { ... } catch { failures.push(...) }` and keeps iterating. Powertools: `BatchProcessor` used instead of `SqsFifoPartialProcessor`.
- **Fix:**
  ```ts
  import { SqsFifoPartialProcessorAsync, processPartialResponse } from "@aws-lambda-powertools/batch";
  const processor = new SqsFifoPartialProcessorAsync();
  export const handler: SQSHandler = (event, context) =>
    processPartialResponse(event, recordHandler, processor, { context, skipGroupOnError: true });
  ```
  `skipGroupOnError: true` keeps other groups flowing while only the failed group is returned.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html ; https://docs.aws.amazon.com/powertools/typescript/latest/features/batch/
- **Last verified:** 2026-10-12

### SQS-008 — Long-poll in hand-written consumers
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Custom pollers (ECS, EC2, K8s, scripts) call `ReceiveMessage` with `WaitTimeSeconds: 20`, or the queue sets `ReceiveMessageWaitTimeSeconds = 20`.
- **Why:** Short polling (the default) returns immediately, often empty, and samples only some servers. A loop polling every 100 ms is ~26M billable requests per poller per month, versus ~130k with 20-second long polls; it also yields false empties. Lambda ESMs already long-poll, so this rule does not apply to them.
- **Detect:** `ReceiveMessageCommand({ QueueUrl })` / `sqs.ReceiveMessageInput{...}` without `WaitTimeSeconds`, or `WaitTimeSeconds: 0`, while the queue has `receive_wait_time_seconds` unset/0 (CDK `receiveMessageWaitTime` unset). Skip queues only consumed via `aws_lambda_event_source_mapping`/`SqsEventSource`/`queue.subscribe`.
- **Fix:**
  ```go
  out, err := client.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
      QueueUrl:            aws.String(queueURL),
      MaxNumberOfMessages: 10,
      WaitTimeSeconds:     20,
  })
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html ; https://aws.amazon.com/sqs/pricing/
- **Last verified:** 2026-10-12

### SQS-009 — Batch sends, receives and deletes (up to 10 per call)
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Use `SendMessageBatch`, `DeleteMessageBatch` and `MaxNumberOfMessages: 10` where messages are produced or consumed in loops.
- **Why:** Each API call is a billed request (per 64 KB chunk). `ReceiveMessage` returns 1 message by default; sending 1M messages one by one is 1M requests vs 100k batched, and on FIFO queues batching is how you get past 300 TPS per action.
- **Detect:** `SendMessageCommand` / `client.SendMessage` inside `for`/`map`/`Promise.all`; `DeleteMessageCommand` per message after a receive; `ReceiveMessage` without `MaxNumberOfMessages`.
- **Fix:** Group into chunks of 10 with `SendMessageBatchCommand` / `DeleteMessageBatchCommand`, then handle per-entry failures (SQS-010).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-batch-api-actions.html ; https://aws.amazon.com/sqs/pricing/
- **Last verified:** 2026-10-12

### SQS-010 — Check the Failed list of every batch call
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** After `SendMessageBatch` / `DeleteMessageBatch` / `ChangeMessageVisibilityBatch`, inspect `Failed` and retry or surface those entries.
- **Why:** Batch calls return HTTP 200 even when some entries fail. Ignoring `Failed` silently drops messages on send, and on delete leaves them to reappear after the visibility timeout as duplicates.
- **Detect:** `await sqs.send(new SendMessageBatchCommand(...))` whose result is unused or only `Successful` is read; Go `_, err := client.SendMessageBatch(...)` or `out.Failed` never referenced.
- **Fix:**
  ```go
  out, err := client.SendMessageBatch(ctx, in)
  if err != nil { return err }
  if len(out.Failed) > 0 {
      return fmt.Errorf("sqs: %d entries failed, first: %s", len(out.Failed), aws.ToString(out.Failed[0].Code))
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessageBatch.html
- **Last verified:** 2026-10-12

### SQS-011 — Extend visibility for long jobs instead of guessing a huge timeout
- **Severity:** medium
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Workers whose processing time varies call `ChangeMessageVisibility` periodically (heartbeat) and delete only after success; work longer than 12 h moves to Step Functions.
- **Why:** A fixed timeout shorter than the slowest job causes duplicate concurrent processing; a very long one delays the retry of messages from crashed workers. The 12-hour cap counts from first receive and extensions do not reset it.
- **Detect:** Pollers that do long work (video, exports, `await` of external jobs) between `ReceiveMessage` and `DeleteMessage` with no `ChangeMessageVisibility`; `DeleteMessage` called before the work (`receive → delete → process`), which loses the message on crash.
- **Fix:** Start a ticker that calls `ChangeMessageVisibility(VisibilityTimeout: 60)` every 30 s while processing; delete after the work commits.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html
- **Last verified:** 2026-10-12

### SQS-012 — Make SQS consumers idempotent
- **Severity:** high
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Side effects in a queue consumer (charges, emails, counters, inserts) are keyed so a redelivered message has no second effect.
- **Why:** Standard queues and Lambda ESMs are at-least-once; redelivery also happens after timeouts, batch retries and DLQ redrives. A non-idempotent consumer double-charges or double-sends.
- **Detect:** Handler for an SQS event that calls a payment/email API, `UpdateItem` with `ADD`/`SET x = x + :n`, `PutItem` without `ConditionExpression`, or `INSERT` without a unique key derived from the message, and no idempotency store (`makeIdempotent`, `IdempotencyConfig`, conditional write on `messageId`/business ID).
- **Fix:**
  ```ts
  const config = new IdempotencyConfig({ eventKeyJmesPath: "messageId" });
  const processOnce = makeIdempotent(recordHandler, { persistenceStore, config });
  ```
  Or a conditional write: `ConditionExpression: "attribute_not_exists(pk)"` keyed on the order ID.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html ; https://docs.aws.amazon.com/powertools/typescript/latest/features/idempotency/
- **Last verified:** 2026-10-12

### SQS-013 — Use a MessageGroupId per entity, not a constant
- **Severity:** high
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** On FIFO queues, set `MessageGroupId` to the entity whose order matters (order ID, account ID), never a constant.
- **Why:** Messages in one group are delivered strictly one batch at a time. A constant group (`"default"`, `"orders"`) serializes the whole queue to a single consumer, so backlog grows with load and one poison message blocks everything.
- **Detect:** `MessageGroupId: "..."` string literal, `aws.String("default")`, or a value with only a handful of values (`env`, `region`); Lambda concurrency on a FIFO queue never above 1.
- **Fix:** `MessageGroupId: order.id`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagegroupid-property.html ; https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/high-throughput-fifo.html
- **Last verified:** 2026-10-12

### SQS-014 — Choose the FIFO deduplication key on purpose
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** On FIFO queues either send an explicit `MessageDeduplicationId` derived from the business event, or enable content-based deduplication only when identical bodies really are duplicates.
- **Why:** Without content-based dedup and without an ID, `SendMessage` fails. With content-based dedup, two legitimate messages with the same body (`{"op":"increment"}`) inside the 5-minute window are acknowledged and silently dropped; attributes are not part of the hash. A random UUID as dedup ID disables dedup entirely, so producer retries create duplicates.
- **Detect:** `content_based_deduplication = true` / `contentBasedDeduplication: true` / SST `fifo: { contentBasedDeduplication: true }` with message bodies that can repeat; `MessageDeduplicationId: randomUUID()` / `uuid.NewString()`; FIFO sends with neither.
- **Fix:** `MessageDeduplicationId: \`${order.id}:${event.version}\``.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html
- **Last verified:** 2026-10-12

### SQS-015 — Enable high-throughput mode on busy FIFO queues
- **Severity:** medium
- **Category:** performance
- **Applies to:** Terraform, CDK, SST
- **Rule:** FIFO queues that need more than 300 TPS per API action (3,000 msg/s batched) use `deduplication_scope = "messageGroup"` and `fifo_throughput_limit = "perMessageGroupId"`.
- **Why:** Without high-throughput mode the queue throttles at the default partition limit while group ordering does not require it.
- **Detect:** `fifo_queue = true` without both attributes; CDK `fifo: true` without `deduplicationScope: DeduplicationScope.MESSAGE_GROUP` and `fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID`; producer code sending to the FIFO queue in hot loops.
- **Fix:** Set both attributes; spread `MessageGroupId` across many values (SQS-013).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/high-throughput-fifo.html ; https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html
- **Last verified:** 2026-10-12

### SQS-016 — Keep payloads under the queue's maximum message size; claim-check large ones to S3
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Bodies that can approach the queue's `MaximumMessageSize` (body + attributes; 1 MiB service maximum) go to S3 with only the key in the message; keep typical messages well below 64 KB.
- **Why:** Over the limit `SendMessage` fails. The SQS API and CDK default a new queue to 1 MiB, but the Terraform provider sends its own default `max_message_size = 262144` (256 KiB), so a Terraform-managed queue rejects 300 KB messages that the same code sends fine to a CDK queue. Every 64 KB chunk is billed as a request, so a 1 MiB message costs 16 requests on send and again on receive. AWS ships extended clients only for Java and Python, so TS/Go must hand-roll the S3 pointer.
- **Detect:** `MessageBody: JSON.stringify(<whole document/array/base64 file>)`, `Buffer`/base64 file content in bodies; Terraform `aws_sqs_queue` without `max_message_size` (256 KiB in Terraform) fed by producers whose payloads can exceed 256 KiB; `max_message_size` raised to the cap to "make it fit".
- **Fix:** `PutObject` the payload, send `{ bucket, key }`, and lifecycle-expire the objects. If payloads between 256 KiB and 1 MiB are intended, set `max_message_size = 1048576` explicitly in Terraform.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html ; https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SetQueueAttributes.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue ; https://aws.amazon.com/sqs/pricing/
- **Last verified:** 2026-10-12

### SQS-017 — Scope queue policies for SNS and EventBridge with aws:SourceArn
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** A queue policy that lets `sns.amazonaws.com` or `events.amazonaws.com` send messages includes `ArnEquals aws:SourceArn` (or `aws:SourceAccount`) for the specific topic/rule.
- **Why:** Without the condition any topic or rule in any account can inject messages into the queue (confused deputy). Deeper IAM review → `aws-security`.
- **Detect:** `aws_sqs_queue_policy` / `policy` JSON with `"Principal": {"Service": "sns.amazonaws.com"}` and `sqs:SendMessage` but no `Condition`; `"Principal": "*"` with `sqs:SendMessage`.
- **Fix:**
  ```hcl
  condition {
    test     = "ArnEquals"
    variable = "aws:SourceArn"
    values   = [aws_sns_topic.orders.arn]
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html
- **Last verified:** 2026-10-12

### SQS-018 — Encrypt service-fed queues with a customer managed key the publisher can use
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** When an SNS topic (or a DLQ written by SNS/EventBridge) delivers to a KMS-encrypted queue, use a customer managed key whose policy grants the service principal `kms:GenerateDataKey*` and `kms:Decrypt`; SQS-managed SSE (`sqs_managed_sse_enabled`) also works.
- **Why:** The AWS managed key `alias/aws/sqs` cannot be granted to SNS. Deliveries fail as client-side errors, which SNS does not retry, so messages are dropped without an error at publish time.
- **Detect:** `kms_master_key_id = "alias/aws/sqs"` or CDK `encryption: QueueEncryption.KMS_MANAGED` on a queue that is an `aws_sns_topic_subscription` endpoint, an SNS subscription `redrive_policy` target, or an EventBridge `dead_letter_config`; customer key policy lacking `sns.amazonaws.com`.
- **Fix:** Use `sqs_managed_sse_enabled = true`, or a CMK with a statement allowing `sns.amazonaws.com` `kms:Decrypt` and `kms:GenerateDataKey*`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/sns-enable-encryption-for-topic-sqs-queue-subscriptions.html ; https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html
- **Last verified:** 2026-10-12

### SQS-019 — Cap consumer concurrency with ESM maximum concurrency, not tiny reserved concurrency
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** To protect a downstream, set `scaling_config.maximum_concurrency` (2–1,000) on the SQS mapping instead of a small reserved concurrency; if the function also has reserved concurrency, keep it ≥ the total maximum concurrency of all its SQS mappings.
- **Why:** With reserved concurrency below what the poller wants, invocations are throttled; throttled messages return to the queue, increment their receive count and land in the DLQ although nothing failed.
- **Detect:** A small `reserved_concurrent_executions` (CDK `reservedConcurrentExecutions`) used as the throttle on a function with an SQS mapping that has no `scaling_config { maximum_concurrency }` / `maxConcurrency`; or `maximum_concurrency` set higher than the function's reserved concurrency.
- **Fix:**
  ```hcl
  scaling_config { maximum_concurrency = 10 }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html ; https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html
- **Last verified:** 2026-10-12

### SQS-020 — Use fair queues for multi-tenant standard queues
- **Severity:** low
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** When one standard queue carries work for many tenants, send a `MessageGroupId` per tenant so SQS fair queues limit noisy-neighbour backlog.
- **Why:** One tenant's burst otherwise delays every other tenant's messages (dwell time grows for all). Fair-queue requests are billed at an extra rate, so apply it only where tenant isolation matters.
- **Detect:** Standard queue whose messages carry `tenantId`/`customerId` with no `MessageGroupId`, plus per-tenant SLAs or complaints about latency spikes.
- **Fix:** `new SendMessageCommand({ QueueUrl, MessageBody, MessageGroupId: tenantId })` on the standard queue.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fair-queues.html ; https://aws.amazon.com/sqs/pricing/
- **Last verified:** 2026-10-12

### SQS-021 — Let SST link or CDK grants wire queue access instead of env vars plus hand-written IAM
- **Severity:** low
- **Category:** simplicity
- **Applies to:** SST, CDK
- **Rule:** Give producers access with `link: [queue]` (SST, read `Resource.MyQueue.url`) or `queue.grantSendMessages(fn)` + `environment: { QUEUE_URL: queue.queueUrl }` (CDK), not hard-coded URLs and copied policy statements.
- **Why:** Hand-written URLs drift between stages (a prod function writing to the dev queue) and copied IAM statements rot when the queue is renamed. Note that SST `link` grants `sqs:*` on the queue; tighten with `transform` if least privilege matters (→ `aws-security`).
- **Detect:** `QUEUE_URL: "https://sqs.<region>.amazonaws.com/<acct>/..."` literals; `environment: { QUEUE_URL: ... }` plus a manual `permissions`/`addToRolePolicy` for `sqs:SendMessage` in SST/CDK code.
- **Fix:**
  ```ts
  const queue = new sst.aws.Queue("Orders");
  new sst.aws.Function("Api", { handler: "src/api.handler", link: [queue] });
  // in code: import { Resource } from "sst"; Resource.Orders.url
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/linking/ ; https://sst.dev/docs/component/aws/queue/
- **Last verified:** 2026-10-12

### SQS-022 — Don't put Lambda event filters on a queue that other consumers need
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** Use `filter_criteria` on an SQS event source mapping only when the discarded messages are truly unwanted; to route by type, filter upstream (SNS filter policy, EventBridge rule) into separate queues.
- **Why:** For SQS sources Lambda discards (deletes) every message that matches none of the filters, and drops messages whose body format (JSON vs plain string) does not match the pattern. Two functions mapped to one queue with different filters, or a filter written as `{"body": {...}}` for non-JSON bodies, silently lose messages: they never reach the DLQ.
- **Detect:** `aws_lambda_event_source_mapping` on an SQS ARN with `filter_criteria`, CDK `new SqsEventSource(queue, { filters: [...] })`, SST `queue.subscribe(..., { filters: [...] })`, especially several mappings/subscribers on the same queue, or producers that send non-JSON bodies.
- **Fix:** One consumer per queue, routing done by SNS/EventBridge into per-type queues; keep ESM filters only to drop noise you never want.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html ; https://docs.aws.amazon.com/lambda/latest/dg/with-sqs-filtering.html
- **Last verified:** 2026-10-12
