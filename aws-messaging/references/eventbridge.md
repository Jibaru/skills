# EventBridge rules

Event buses (Custom Event Bus - Classic with rules/targets, and the Custom Event Bus with
subscribers launched September 2026), event patterns, targets, archive/replay, Pipes,
EventBridge Scheduler and publishers using `@aws-sdk/client-eventbridge` or
`github.com/aws/aws-sdk-go-v2/service/eventbridge`.

Note on the two bus products: everything Terraform, CDK L2 and SST call a "bus" with
`aws_cloudwatch_event_rule` / `events.Rule` / `sst.aws.Bus` is the **Classic** bus. The newer
Custom Event Bus uses *subscribers* and its own client and endpoint: CLI `aws eventsv2`, SDK
`@aws-sdk/client-eventbridgev2` (`EventBridgeV2Client`, `CreateSubscriberCommand`), Go
`github.com/aws/aws-sdk-go-v2/service/eventbridgev2`, CloudFormation `AWS::EventsV2::EventBus` /
`AWS::EventsV2::Subscriber`, CDK L1 `aws-cdk-lib/aws-eventsv2` (`CfnSubscriber`, no L2). The
hashicorp/aws provider has no resource for it yet (2026-10-12). IAM actions stay `events:*`.
Check which bus the code targets before applying a default.

### EVB-001 — Attach a DLQ to every rule target
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every target that must not lose events has `DeadLetterConfig` pointing at an SQS standard queue.
- **Why:** After retries are exhausted the event is dropped. Permission errors, deleted targets and invalid addresses are not retried at all: without a DLQ they disappear at once, with only `FailedInvocations` to show for it.
- **Detect:** `aws_cloudwatch_event_target` without a `dead_letter_config { arn = ... }` block; CDK `new targets.LambdaFunction(fn)` / `SqsQueue` / `SfnStateMachine` without `deadLetterQueue`; SST `bus.subscribe(...)` / `subscribeQueue(...)` and `sst.aws.Cron` without `transform.target` setting `deadLetterConfig` (the components have no DLQ argument).
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_event_target" "billing" {
    rule = aws_cloudwatch_event_rule.order_placed.name
    arn  = aws_lambda_function.billing.arn
    dead_letter_config { arn = aws_sqs_queue.billing_events_dlq.arn }
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 10
    }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html ; https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html
- **Last verified:** 2026-10-12

### EVB-002 — Set the retry policy explicitly, especially on new-bus subscribers
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Choose `MaximumEventAgeInSeconds` and `MaximumRetryAttempts` per target from how stale an event may be; on Custom Event Bus subscribers always set them.
- **Why:** Classic targets retry for 24 h / 185 attempts by default, so a stale "send reminder now" can fire hours late. Custom Event Bus subscribers default to only 300 s / 5 attempts: a target outage longer than 5 minutes dead-letters (or drops) events that Classic would have delivered late.
- **Detect:** `aws_cloudwatch_event_target` without `retry_policy` on time-sensitive targets; CDK target props without `maxEventAge`/`retryAttempts` (defaults 24 h / 185); `CreateSubscriberCommand` (`@aws-sdk/client-eventbridgev2`), Go `eventbridgev2.CreateSubscriberInput`, `aws eventsv2 create-subscriber`, CloudFormation `AWS::EventsV2::Subscriber` or CDK `CfnSubscriber` without `RetryPolicy` (and without `OnFailureConfiguration`).
- **Fix:** a `retry_policy` block with `maximum_event_age_in_seconds = 900` and `maximum_retry_attempts = 20` (CDK `maxEventAge: Duration.minutes(15), retryAttempts: 20`); on subscribers, `RetryPolicy: { MaxEventAgeInSeconds: 86400, MaxRetryAttempts: 185 }` when late delivery beats dead-lettering.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html ; https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-retry.html ; https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html ; https://docs.aws.amazon.com/eventbridgev2/latest/APIReference/API_CreateSubscriber.html ; https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-names.html
- **Last verified:** 2026-10-12

### EVB-003 — Make target DLQs standard queues EventBridge is allowed to write to
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** A rule-target DLQ is a standard (not FIFO) queue in the rule's Region whose queue policy allows `events.amazonaws.com` `sqs:SendMessage` with `aws:SourceArn` = the rule ARN.
- **Why:** When created through the API/IaC (not the console) the policy is not added for you; EventBridge then cannot dead-letter, `InvocationsFailedToBeSentToDLQ` rises and the events are lost anyway. FIFO DLQs are rejected for Classic targets.
- **Detect:** `dead_letter_config.arn` pointing to an `aws_sqs_queue` without an `aws_sqs_queue_policy` for `events.amazonaws.com`, or with `fifo_queue = true`. (CDK target `deadLetterQueue` adds the policy automatically.)
- **Fix:** Add the queue policy with `ArnEquals aws:SourceArn = aws_cloudwatch_event_rule.<name>.arn`; use a standard queue.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html#eb-dlq-perms
- **Last verified:** 2026-10-12

### EVB-004 — Check FailedEntryCount after PutEvents
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** After `PutEvents`, read `FailedEntryCount` and resend only the entries that carry an `ErrorCode`, with backoff.
- **Why:** `PutEvents` returns 200 even when individual entries fail (throttling, internal failures). Code that only awaits the call drops events silently.
- **Detect:** `await client.send(new PutEventsCommand({ Entries }))` whose result is ignored or not checked for `FailedEntryCount`; Go `_, err := client.PutEvents(ctx, ...)` or `out.FailedEntryCount` never read.
- **Fix:**
  ```ts
  const out = await eb.send(new PutEventsCommand({ Entries: entries }));
  if (out.FailedEntryCount) {
    const retry = entries.filter((_, i) => out.Entries?.[i]?.ErrorCode);
    throw new Error(`PutEvents: ${retry.length} entries failed`); // or retry with backoff
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-putevents.html#eb-failure-handling
- **Last verified:** 2026-10-12

### EVB-005 — Publish to the bus the IaC actually created
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go, SST, CDK
- **Rule:** Take `EventBusName` from IaC (SST `Resource.<Bus>.name`, CDK env var from `bus.eventBusName`), never a hard-coded string, and omit it only when the default bus is intended.
- **Why:** Publishing to a bus that does not exist returns 200 with `FailedEntryCount: 0` and the event is dropped. A typo or a stage suffix mismatch (`orders-bus` vs `orders-bus-prod`) loses every event without an error.
- **Detect:** `EventBusName: "..."` literals in `PutEventsRequestEntry`; missing `EventBusName` while rules are defined on a custom bus (`aws_cloudwatch_event_rule.event_bus_name`, `new events.Rule(..., { eventBus })`, `bus.subscribe`).
- **Fix:** `EventBusName: Resource.OrdersBus.name` with `link: [bus]` in SST.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-putevents.html#eb-failure-handling ; https://sst.dev/docs/component/aws/bus/
- **Last verified:** 2026-10-12

### EVB-006 — Batch PutEvents and keep requests under the size and entry limits
- **Severity:** medium
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Send events in batches (Classic bus: up to 10 entries, request < 1 MB total; Custom Event Bus, through the `eventbridgev2` client: up to 100 entries) and move large payloads to S3.
- **Why:** One `PutEvents` per event multiplies calls against the per-Region `PutEvents` TPS quota (as low as 400/s in smaller Regions) and adds latency. Requests over the entry or size limit fail outright. Each 64 KB chunk is billed as one event.
- **Detect:** `PutEventsCommand` inside `for`/`map` with one entry; `Entries` built from an unbounded array without chunking; `Detail: JSON.stringify(<large object/file>)`.
- **Fix:** Chunk entries (10 for Classic), check size per the documented formula, and handle failures (EVB-004).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-putevents.html#eb-putevent-size ; https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html ; https://aws.amazon.com/eventbridge/pricing/
- **Last verified:** 2026-10-12

### EVB-007 — Write precise patterns that can't match the target's own output
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every pattern names `source` and `detail-type` (and, for CloudTrail events, `eventName`); a target that publishes back to the same bus must emit a source or detail-type its own rule excludes.
- **Why:** A rule that matches the events its target produces loops forever: runaway invocations, throttling of the whole bus and a surprise bill. Lambda's recursion detection stops loops through SQS/SNS/S3/custom buses only after ~16 hops and only with recent SDKs; loops through DynamoDB or other services are not detected.
- **Detect:** `event_pattern` / `eventPattern` / SST `pattern` with only `detail` or with `{"prefix": ""}` / `{"exists": true}` on `source`; a target function that calls `PutEventsCommand` with the same `Source` it is subscribed to; rules on `aws.s3`/CloudTrail events whose target modifies the same resource type.
- **Fix:**
  ```hcl
  event_pattern = jsonencode({
    source        = ["com.acme.orders"]
    "detail-type" = ["OrderPlaced"]
  })
  ```
  and have the target publish `source = "com.acme.billing"`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-patterns-best-practices.html ; https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html
- **Last verified:** 2026-10-12

### EVB-008 — Mirror the event's structure in the pattern
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** Patterns nest fields exactly as in the event (`"detail": {"status": ["PAID"]}`), use arrays for values, and match the event's field names and case.
- **Why:** A pattern with `"detail.status"`, a scalar instead of an array, `"detailType"` instead of `"detail-type"`, or `"paid"` against `"PAID"` is either rejected or, worse, valid and never matches: the target silently receives nothing.
- **Detect:** Pattern keys containing dots (`"detail.status"`), `detailType`/`DetailType` keys in raw JSON patterns (CDK `eventPattern.detailType` is the correct camelCase prop), non-array leaf values, values whose case differs from what publishers send.
- **Fix:** `jsonencode({ source = ["com.acme.orders"], "detail-type" = ["OrderPaid"], detail = { status = ["PAID"] } })`; test in the EventBridge Sandbox or `TestEventPattern`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html
- **Last verified:** 2026-10-12

### EVB-009 — Grant EventBridge permission to invoke Lambda targets in Terraform
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** Each Lambda target of a rule has an `aws_lambda_permission` for `events.amazonaws.com` with `source_arn` = the rule ARN.
- **Why:** Without the resource-based permission every invocation fails (`FailedInvocations`), and since it is a permission error it is not retried: events go straight to the DLQ or are lost. CDK and SST add this permission; Terraform does not.
- **Detect:** `aws_cloudwatch_event_target` whose `arn` is an `aws_lambda_function` with no `aws_lambda_permission` having `principal = "events.amazonaws.com"` and a matching `source_arn`.
- **Fix:**
  ```hcl
  resource "aws_lambda_permission" "billing_from_events" {
    action        = "lambda:InvokeFunction"
    function_name = aws_lambda_function.billing.function_name
    principal     = "events.amazonaws.com"
    source_arn    = aws_cloudwatch_event_rule.order_placed.arn
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html ; https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html
- **Last verified:** 2026-10-12

### EVB-010 — Expect batches from Custom Event Bus subscribers
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** When a handler moves from a Classic rule to a Custom Event Bus subscriber, either accept a JSON array of events or set `BatchConfiguration.MaxBatchSize = 1`.
- **Why:** Classic rules invoke a function or state machine with one event; subscribers deliver a JSON array by default. A handler reading `event.detail` gets `undefined` and fails or writes empty data.
- **Detect:** `CreateSubscriberCommand` (`@aws-sdk/client-eventbridgev2`), `aws eventsv2 create-subscriber`, `AWS::EventsV2::Subscriber` / CDK `CfnSubscriber` targeting Lambda or Step Functions without `BatchConfiguration`, and a handler typed `EventBridgeEvent<...>` that reads `event.detail` directly.
- **Fix:** `BatchConfiguration: { MaxBatchSize: 1 }`, or iterate: `for (const e of events) handle(e.detail)`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-migrate.html#eb-custom-bus-migrate-defaults ; https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html
- **Last verified:** 2026-10-12

### EVB-011 — Use EventBridge Scheduler instead of scheduled rules
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK, SST
- **Rule:** New cron/rate jobs use EventBridge Scheduler (`aws_scheduler_schedule`, CDK `aws-cdk-lib/aws-scheduler` `Schedule`, SST `sst.aws.CronV2`) rather than scheduled rules (legacy).
- **Why:** Scheduler supports time zones with DST, one-time schedules, per-schedule retry policy and DLQ, more targets, and a 14M invocations/month free tier. Scheduled rules evaluate cron in UTC only: `cron(0 9 * * ? *)` meant as 9:00 local runs at the wrong hour and shifts with DST.
- **Detect:** `aws_cloudwatch_event_rule` with `schedule_expression`; CDK `new events.Rule(..., { schedule: events.Schedule.cron(...) })`; SST `new sst.aws.Cron(...)`; cron hours that look like local business hours.
- **Fix:**
  ```hcl
  resource "aws_scheduler_schedule" "nightly" {
    schedule_expression          = "cron(0 9 * * ? *)"
    schedule_expression_timezone = "America/Lima"
    flexible_time_window { mode = "OFF" }
    target {
      arn      = aws_lambda_function.report.arn
      role_arn = aws_iam_role.scheduler.arn
      dead_letter_config { arn = aws_sqs_queue.scheduler_dlq.arn }
      retry_policy { maximum_retry_attempts = 3 }
    }
  }
  ```
  SST: `new sst.aws.CronV2("Nightly", { schedule: "cron(0 9 * * ? *)", timezone: "America/Lima", retries: 3, function: "src/report.handler" })`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-scheduled-rule-pattern.html ; https://sst.dev/docs/component/aws/cron-v2/ ; https://aws.amazon.com/eventbridge/pricing/
- **Last verified:** 2026-10-12

### EVB-012 — Configure retries, DLQ and cleanup on Scheduler schedules
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Schedules set a target `retry_policy` and `dead_letter_config`; one-time schedules created from code set `ActionAfterCompletion: DELETE`.
- **Why:** SST `CronV2` defaults to `retries: 0`, so one transient error skips that run. Applications creating one-time schedules per entity (reminders, trial expiries) accumulate completed schedules until they hit the account quota and creation starts failing.
- **Detect:** `aws_scheduler_schedule.target` without `dead_letter_config`; `CreateScheduleCommand` with `at(...)` expressions and no `ActionAfterCompletion`; SST `CronV2` without `retries`.
- **Fix:** `ActionAfterCompletion: "DELETE"` on one-time schedules; `retry_policy { maximum_retry_attempts = 3 }` plus a DLQ on recurring ones.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/scheduler/latest/UserGuide/managing-schedule-delete.html ; https://docs.aws.amazon.com/scheduler/latest/UserGuide/configuring-schedule-dlq.html ; https://sst.dev/docs/component/aws/cron-v2/
- **Last verified:** 2026-10-12

### EVB-013 — Bound archive retention and filter what you archive
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Archives set `retention_days` and an `event_pattern` limited to events you would replay.
- **Why:** Archives keep events indefinitely by default and bill archive processing per GB plus storage per GB-month, so an unfiltered archive of a busy bus grows forever. Replays re-deliver to rules (not in original order, marked with `replay-name`), so consumers must be idempotent.
- **Detect:** `aws_cloudwatch_event_archive` without `retention_days` (or `0`) or without `event_pattern`; CDK `bus.archive(..., { eventPattern })` without `retention`.
- **Fix:** `retention_days = 30` and a pattern on the business `source`s; make replay consumers idempotent.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-archive.html ; https://aws.amazon.com/eventbridge/pricing/
- **Last verified:** 2026-10-12

### EVB-014 — Replace point-to-point Lambda glue with EventBridge Pipes
- **Severity:** medium
- **Category:** simplicity
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A function whose only job is to read from SQS/Kinesis/DynamoDB Streams/MSK, optionally filter or reshape, and forward to Step Functions, EventBridge, SQS, SNS, Kinesis or an API should be a Pipe (filter + optional enrichment + input template).
- **Why:** The glue function is code to test, deploy, monitor and pay for; it usually lacks partial-batch handling and retries that Pipes provides. With a filter you pay only for events that match.
- **Detect:** Handler bodies that loop `event.Records` and call only `StartExecutionCommand`, `PutEventsCommand`, `SendMessageCommand` or `PutRecordCommand`, with at most a field mapping; Terraform `aws_lambda_event_source_mapping` + such a function. CDK: `CfnPipe` (no stable L2 in `aws-cdk-lib`; `@aws-cdk/aws-pipes-alpha` is preview).
- **Fix:**
  ```hcl
  resource "aws_pipes_pipe" "orders_to_sfn" {
    role_arn = aws_iam_role.pipe.arn
    source   = aws_sqs_queue.orders.arn
    target   = aws_sfn_state_machine.fulfil.arn
    source_parameters {
      filter_criteria {
        filter {
          pattern = jsonencode({ body = { type = ["OrderPlaced"] } })
        }
      }
    }
    target_parameters {
      step_function_state_machine_parameters {
        invocation_type = "FIRE_AND_FORGET"
      }
    }
  }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes.html ; https://aws.amazon.com/eventbridge/pricing/ ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_pipes-readme.html
- **Last verified:** 2026-10-12

### EVB-015 — Use input transformers instead of reshaping in code
- **Severity:** low
- **Category:** readability
- **Applies to:** Terraform, CDK, SST
- **Rule:** When a target only needs a few fields, use `input_transformer` / `input_path` (CDK `RuleTargetInput.fromObject(EventField...)`) so the target receives the shape it expects.
- **Why:** Handlers that start with ten lines of `event.detail.x.y` unpacking couple every consumer to the envelope; a transformer keeps targets (SQS bodies, Step Functions input) clean and makes the contract visible in IaC.
- **Detect:** Targets of SQS/Step Functions/API destinations whose consumers immediately map `detail.*` into a new object; Lambda targets that only extract `detail` before calling another service.
- **Fix:**
  ```ts
  rule.addTarget(new targets.SfnStateMachine(sm, {
    input: events.RuleTargetInput.fromObject({ orderId: events.EventField.fromPath("$.detail.orderId") }),
  }));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-transform-target-input.html
- **Last verified:** 2026-10-12

### EVB-016 — Turn schema discovery off on busy production buses
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Enable schema discovery on dev/test buses to generate code bindings; on high-volume production buses keep it off and publish schemas to a custom registry instead.
- **Why:** Discovery is billed per ingested event beyond its monthly free tier, for no runtime benefit once schemas are known.
- **Detect:** `aws_schemas_discoverer` / `CfnDiscoverer` whose `source_arn` is a production bus.
- **Fix:** Scope the discoverer to non-production stages; version schemas in a registry (`aws_schemas_registry`, `aws_schemas_schema`).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schema.html ; https://aws.amazon.com/eventbridge/pricing/
- **Last verified:** 2026-10-12

### EVB-017 — Bound retries and add a DLQ on Pipes with stream sources
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** A pipe reading Kinesis or DynamoDB Streams sets `maximum_retry_attempts`, `maximum_record_age_in_seconds`, `on_partial_batch_item_failure = "AUTOMATIC_BISECT"` and a `dead_letter_config`.
- **Why:** Stream-source retries and record age default to `-1` (infinite): a record the target keeps rejecting is retried until it expires from the stream, blocking its shard the whole time, and then disappears. SQS-source pipes instead inherit the queue's redrive policy.
- **Detect:** `aws_pipes_pipe` with `source_parameters.kinesis_stream_parameters` or `dynamodb_stream_parameters` lacking `maximum_retry_attempts` / `dead_letter_config`; CDK `CfnPipe` `sourceParameters.kinesisStreamParameters` without `maximumRetryAttempts` / `deadLetterConfig`.
- **Fix:**
  ```hcl
  source_parameters {
    kinesis_stream_parameters {
      starting_position              = "TRIM_HORIZON"
      maximum_retry_attempts         = 5
      maximum_record_age_in_seconds  = 3600
      on_partial_batch_item_failure  = "AUTOMATIC_BISECT"
      dead_letter_config { arn = aws_sqs_queue.pipe_dlq.arn }
    }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes-error-troubleshooting.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/pipes_pipe
- **Last verified:** 2026-10-12

### EVB-018 — Give FIFO queue targets a per-entity message group
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** A rule target that is an SQS FIFO queue sets the message group (`sqs_target { message_group_id }`, CDK `new targets.SqsQueue(queue, { messageGroupId })`); because that ID is fixed per target, use a FIFO target only when one global order is really wanted.
- **Why:** FIFO queues need a message group ID for every message; EventBridge takes it from `SqsParameters` and CDK documents `messageGroupId` as required for FIFO targets, so a FIFO target without it cannot deliver. With a fixed group every event goes through one group, consumed one batch at a time (SQS-013).
- **Detect:** `aws_cloudwatch_event_target` whose `arn` is an `aws_sqs_queue` with `fifo_queue = true` and no `sqs_target` block; CDK `new targets.SqsQueue(fifoQueue)` without `messageGroupId`.
- **Fix:** `sqs_target { message_group_id = "orders" }` when strict global order is required; for per-entity order, have a consumer (e.g. a Lambda target) call `SendMessage` with `MessageGroupId` taken from the event; otherwise use a standard queue.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_events_targets.SqsQueueProps.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target
- **Last verified:** 2026-10-12
