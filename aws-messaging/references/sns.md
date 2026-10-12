# SNS rules

Topics, subscriptions (SQS, Lambda, HTTP, Firehose), filter policies, fan-out and publishers
using `@aws-sdk/client-sns` or `github.com/aws/aws-sdk-go-v2/service/sns`. SMS/email delivery
settings and mobile push are out of scope.

### SNS-001 — Give SNS permission to write to every subscribed queue
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** Each SQS queue subscribed to a topic has a queue policy allowing `sqs:SendMessage` from `sns.amazonaws.com`, conditioned on the topic ARN.
- **Why:** Without it the subscription is created and confirmed, publishes succeed, and nothing arrives: SNS gets a client-side error, does not retry it, and drops the message (or sends it to the subscription DLQ if there is one). CDK `SqsSubscription` and SST `subscribeQueue` add this policy for you; raw Terraform does not.
- **Detect:** `aws_sns_topic_subscription` with `protocol = "sqs"` whose `endpoint` queue has no `aws_sqs_queue_policy` (or `policy` attribute) granting `sns.amazonaws.com`. A queue policy for one topic that is reused when a second topic subscribes (one statement per topic, or `aws:SourceAccount`).
- **Fix:**
  ```hcl
  data "aws_iam_policy_document" "notifications" {
    statement {
      actions   = ["sqs:SendMessage"]
      resources = [aws_sqs_queue.notifications.arn]
      principals {
        type        = "Service"
        identifiers = ["sns.amazonaws.com"]
      }
      condition {
        test     = "ArnEquals"
        variable = "aws:SourceArn"
        values   = [aws_sns_topic.orders.arn]
      }
    }
  }
  resource "aws_sqs_queue_policy" "notifications" {
    queue_url = aws_sqs_queue.notifications.id
    policy    = data.aws_iam_policy_document.notifications.json
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html ; https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html
- **Last verified:** 2026-10-12

### SNS-002 — Attach a dead-letter queue to each subscription
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every SQS, Lambda and HTTP subscription has a `RedrivePolicy` pointing at an SQS DLQ in the same account and Region (FIFO topic → FIFO DLQ).
- **Why:** Client-side errors (deleted endpoint, broken queue/KMS policy, >10 attributes with raw delivery) are never retried, and server-side errors are dropped once retries run out. Without a DLQ these messages vanish with only a metric (`NumberOfNotificationsFailed`).
- **Detect:** `aws_sns_topic_subscription` without `redrive_policy`; CDK `new SqsSubscription(queue)` / `new LambdaSubscription(fn)` without `deadLetterQueue`; SST `topic.subscribe(...)` / `subscribeQueue(...)` without `transform.subscription` setting `redrivePolicy`.
- **Fix:**
  ```hcl
  redrive_policy = jsonencode({ deadLetterTargetArn = aws_sqs_queue.orders_sub_dlq.arn })
  ```
  The DLQ needs its own queue policy for `sns.amazonaws.com` (SNS-001) and, if encrypted, a CMK SNS can use (SQS-018).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html
- **Last verified:** 2026-10-12

### SNS-003 — Match raw message delivery to how the consumer parses the body
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** If the SQS/HTTP consumer parses the body as the published payload, enable raw message delivery; if raw delivery is off, the consumer must unwrap the SNS envelope (`JSON.parse(body).Message`).
- **Why:** With raw delivery off (the default) the SQS body is the SNS JSON envelope. A consumer doing `JSON.parse(record.body).orderId` reads `undefined` and either throws on every message (DLQ fills) or, worse, writes empty records. The opposite mismatch reads `.Message` of the raw payload.
- **Detect:** `aws_sns_topic_subscription` with `protocol = "sqs"` and no `raw_message_delivery = true` (CDK `rawMessageDelivery` default `false`; SST `subscribeQueue` sets none) while the queue's handler does `JSON.parse(record.body)` and reads domain fields directly; or raw delivery on and the handler reads `.Message`/`.TopicArn`.
- **Fix:** `raw_message_delivery = true` (CDK `new SqsSubscription(queue, { rawMessageDelivery: true })`), or unwrap: `const msg = JSON.parse(JSON.parse(record.body).Message)`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_sns_subscriptions.SqsSubscriptionProps.html
- **Last verified:** 2026-10-12

### SNS-004 — Point the filter policy at the place the publisher puts the field
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A filter policy on message attributes needs publishers that set those `MessageAttributes`; to filter on fields inside the JSON body set `FilterPolicyScope = MessageBody`.
- **Why:** The scope defaults to `MessageAttributes`. A policy like `{"eventType":["signup"]}` against a publisher that only puts `eventType` in the JSON body matches nothing, so the subscriber silently receives no messages at all.
- **Detect:** `filter_policy` without `filter_policy_scope = "MessageBody"` (CDK `filterPolicy` instead of `filterPolicyWithMessageBody`; SST `subscribe(..., { filter })`, which always uses the attribute scope) while publishers call `PublishCommand({ TopicArn, Message: JSON.stringify({ eventType, ... }) })` / `sns.PublishInput{Message: ...}` with no `MessageAttributes` containing those keys.
- **Fix:** Either publish attributes:
  ```ts
  await sns.send(new PublishCommand({
    TopicArn, Message: JSON.stringify(evt),
    MessageAttributes: { eventType: { DataType: "String", StringValue: evt.eventType } },
  }));
  ```
  or set `filter_policy_scope = "MessageBody"` (CDK `filterPolicyWithMessageBody`; SST via `transform.subscription`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering-scope.html ; https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering.html ; https://sst.dev/docs/component/aws/sns-topic/
- **Last verified:** 2026-10-12

### SNS-005 — Filter in the subscription, not in the consumer
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** When a consumer discards most messages by type (`if (msg.type !== "X") return`), move that condition into the subscription's filter policy, preferably on message attributes.
- **Why:** Every unwanted message is delivered, queued, polled and invokes compute just to be ignored. Payload-based (body) filtering is billed on the outbound payload data scanned per subscription (minimum 1 KB per message), so attribute filtering is the cheaper filter when the publisher can set attributes.
- **Detect:** SNS-fed handlers whose first statement returns early on a type/field check; `aws_sns_topic_subscription` without `filter_policy` on a topic carrying several event types.
- **Fix:** `filter_policy = jsonencode({ eventType = ["OrderPlaced"] })` and remove the early return.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering.html ; https://aws.amazon.com/sns/pricing/
- **Last verified:** 2026-10-12

### SNS-006 — Send at most 10 message attributes to raw-delivery SQS subscriptions
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform
- **Rule:** Publishers to topics with raw-delivery SQS subscriptions attach no more than 10 message attributes.
- **Why:** SNS discards messages with more than 10 attributes for raw-delivery SQS subscriptions as client-side errors: no retry, lost unless a DLQ exists.
- **Detect:** `MessageAttributes` objects built from spreads/maps (`Object.fromEntries(...)`, tracing headers, every header copied) on a topic whose SQS subscriptions set `raw_message_delivery = true`.
- **Fix:** Pack extra metadata into the body or one JSON attribute; keep ≤ 10.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html#message-atttributes-raw-message-delivery-sqs
- **Last verified:** 2026-10-12

### SNS-007 — Respect the topic's maximum message size
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, TypeScript, Go
- **Rule:** Keep body + attributes under the topic's `MaximumMessageSize` (256 KiB default, configurable up to 1 MiB only for topics with ≤ 100 SQS/Lambda/Firehose subscriptions); send larger payloads as S3 references.
- **Why:** Oversized publishes fail with `InvalidParameter`. Raising the topic limit is refused if the topic has HTTP/email/SMS subscriptions or more than 100 subscriptions. Each 64 KB chunk is billed as one request.
- **Detect:** Publishes of whole documents, arrays or base64 files; `maximum_message_size` on `aws_sns_topic` combined with `http`/`https`/`email` subscriptions.
- **Fix:** Store the payload in S3 and publish `{ bucket, key }`; or set `maximum_message_size = 1048576` where the subscription types allow it.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/large-message-payloads.html ; https://docs.aws.amazon.com/general/latest/gr/sns.html
- **Last verified:** 2026-10-12

### SNS-008 — Don't expect order from a standard queue on a FIFO topic
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Consumers that rely on ordering or exactly-once subscribe to a FIFO topic through a FIFO queue; a standard queue on a FIFO topic is only for order-insensitive consumers.
- **Why:** SNS FIFO topics may deliver to standard queues, but the consumer then gets out-of-order and duplicate messages and the message group ID is not passed on. Code that assumes sequence (state machines per entity, balance updates) silently corrupts state.
- **Detect:** `aws_sns_topic` with `fifo_topic = true` subscribed by an `aws_sqs_queue` without `fifo_queue = true`, whose handler applies state transitions or reads `MessageGroupId`.
- **Fix:** Subscribe a `.fifo` queue, or make the consumer order-independent (version checks).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/fifo-message-delivery.html
- **Last verified:** 2026-10-12

### SNS-009 — Use PublishBatch and check its Failed entries
- **Severity:** medium
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Publish bursts with `PublishBatch` (up to 10 entries) and handle `Failed`.
- **Why:** Per-message `Publish` in a loop multiplies latency and requests, and counts against the per-account messages-per-second quota. `PublishBatch` returns 200 with per-entry failures that are lost if ignored.
- **Detect:** `PublishCommand` / `client.Publish` inside loops or `Promise.all(items.map(...))`; `PublishBatchCommand` result whose `Failed` is never read.
- **Fix:** Chunk into 10, call `PublishBatchCommand`, retry `Failed` entries with backoff.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/sns/latest/api/API_PublishBatch.html ; https://docs.aws.amazon.com/general/latest/gr/sns.html
- **Last verified:** 2026-10-12

### SNS-010 — Give SNS-triggered Lambdas an on-failure destination
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** A Lambda subscribed directly to a topic has an asynchronous on-failure destination (or DLQ), or the fan-out goes SNS → SQS → Lambda instead.
- **Why:** SNS invokes Lambda asynchronously. After Lambda's async retries the event is discarded unless a destination exists; there is also no batching or backpressure. SNS → SQS → Lambda gives retries, DLQ, batching and concurrency control.
- **Detect:** `aws_sns_topic_subscription` with `protocol = "lambda"` and no `aws_lambda_function_event_invoke_config` with `destination_config.on_failure`; CDK `new LambdaSubscription(fn)` with no `onFailure` on the function; SST `topic.subscribe(...)` for work that must not be lost.
- **Fix:**
  ```hcl
  resource "aws_lambda_function_event_invoke_config" "notify" {
    function_name = aws_lambda_function.notify.function_name
    destination_config {
      on_failure { destination = aws_sqs_queue.notify_failed.arn }
    }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html ; https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html
- **Last verified:** 2026-10-12

### SNS-011 — Set MessageGroupId and a meaningful dedup ID on FIFO topics
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform
- **Rule:** Publishes to a FIFO topic carry `MessageGroupId` per entity and either `MessageDeduplicationId` from the business event or content-based dedup that fits the payloads.
- **Why:** Same failure modes as SQS FIFO (SQS-013, SQS-014): a constant group serializes delivery (300 msg/s per group), random dedup IDs defeat dedup, content-based dedup drops legitimately identical bodies.
- **Detect:** `PublishCommand` to an ARN ending in `.fifo` without `MessageGroupId`, with a literal group, or with `MessageDeduplicationId: randomUUID()`.
- **Fix:** `MessageGroupId: order.id, MessageDeduplicationId: \`${order.id}:${evt.version}\``.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/sns/latest/dg/fifo-message-delivery.html ; https://docs.aws.amazon.com/general/latest/gr/sns.html
- **Last verified:** 2026-10-12

### SNS-012 — Use SST subscribeQueue / CDK SqsSubscription instead of hand-built fan-out
- **Severity:** low
- **Category:** simplicity
- **Applies to:** SST, CDK
- **Rule:** In SST and CDK, subscribe queues with `topic.subscribeQueue(name, queue.arn, args)` / `topic.addSubscription(new SqsSubscription(queue, props))`, which also create the queue policy.
- **Why:** Hand-assembled `aws.sns.TopicSubscription` / `CfnSubscription` + policy is where SNS-001 bugs come from, and it duplicates what the component already does.
- **Detect:** SST `new aws.sns.TopicSubscription(...)` or CDK `new sns.CfnSubscription(...)` next to a manual `QueuePolicy`.
- **Fix:** `topic.addSubscription(new SqsSubscription(queue, { rawMessageDelivery: true, deadLetterQueue: dlq }))`.
- **Volatile:** no
- **Source:** https://sst.dev/docs/component/aws/sns-topic/ ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_sns_subscriptions.SqsSubscriptionProps.html
- **Last verified:** 2026-10-12
