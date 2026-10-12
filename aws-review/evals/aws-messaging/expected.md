# Expected findings — aws-messaging

Run: *"run aws-messaging on aws-review/evals/aws-messaging"*. Score recall on the 12 plants and
false positives on the decoys. Line numbers point at the line a finding should cite; evidence on
an adjacent line of the same resource/call counts.

## Planted issues (12)

| # | Evidence | Rule | Why |
| --- | --- | --- | --- |
| 1 | `infra/main.tf:38` (with `infra/main.tf:54`) | SQS-001 | Orders queue visibility 30 s equals the consumer's 30 s timeout; needs ≥ 6 × 30 = 180 s. Throttled or slow batches reappear while still being processed. |
| 2 | `infra/main.tf:58` (with `src/orders-consumer.ts:33`) | SQS-006 | Handler catches errors and returns `batchItemFailures`, but the mapping has no `function_response_types = ["ReportBatchItemFailures"]`: Lambda treats the return as full success and deletes failed orders. |
| 3 | `go/worker/main.go:38` (with `infra/main.tf:71`) | SQS-008 | Custom poller calls `ReceiveMessage` without `WaitTimeSeconds` and the jobs queue has no `receive_wait_time_seconds`: short polling every 100 ms when idle (~26M requests/month per worker). SQS-009 on the same call (no `MaxNumberOfMessages`, so 1 message per receive) is also correct. |
| 4 | `go/worker/main.go:73` | SQS-010 | `SendMessageBatch` result discarded; entries in `Failed` are lost, yet the jobs are deleted right after, so their results never reach the results queue. |
| 5 | `infra/main.tf:91` (queue at `infra/main.tf:87`) | SNS-001 | SQS subscription in Terraform with no `aws_sqs_queue_policy` allowing `sns.amazonaws.com`; every delivery fails as a client error and is dropped. |
| 6 | `sst.config.ts:33` (with `src/publish-signup.ts:11`) | SNS-004 | SST `filter` uses the MessageAttributes scope, but the publisher puts `eventType` only in the JSON body and sets no attributes: WelcomeEmail never receives anything. |
| 7 | `infra/main.tf:124` | EVB-001 | Billing target has no `dead_letter_config`; events that exhaust retries (or hit non-retried errors) are dropped. |
| 8 | `src/publish-events.ts:14` | EVB-004 | `PutEventsCommand` result ignored; entries with `ErrorCode` (throttling, internal failure) are lost while the API answers 202. |
| 9 | `go/producer/main.go:35` | KIN-002 | Constant partition key `"clicks"` sends every record to one shard (1 MB/s / 1,000 records/s cap), throttling the producer. |
| 10 | `sst.config.ts:18` | KIN-004 | Kinesis subscription with SST defaults: no `maximumRetryAttempts`, `maximumRecordAgeInSeconds`, `bisectBatchOnFunctionError` or on-failure destination, so a poison record blocks its shard until it expires (24 h). |
| 11 | `infra/orders-stack.ts:76` (with `infra/orders-stack.ts:86`) | SFN-003 | `WAIT_FOR_TASK_TOKEN` (callback) in an EXPRESS state machine: unsupported pattern, and a 4 h wait exceeds Express's 5-minute limit. |
| 12 | `infra/orders-stack.ts:68` (with `src/save-order.ts:10`) | SFN-009 | Lambda whose only job is one DynamoDB `PutItem` with a condition; replace with `tasks.DynamoPutItem` / `arn:aws:states:::dynamodb:putItem`. |

## Decoys (must not be flagged)

| Evidence | Looks like | Why it is correct |
| --- | --- | --- |
| `infra/main.tf:36` | SQS-008 (no `receive_wait_time_seconds`) | The orders queue is consumed only by a Lambda event source mapping, which long-polls on its own. |
| `infra/orders-stack.ts:34` | SNS-001 / SNS-003 | CDK `SqsSubscription` adds the queue policy itself; raw delivery is on and `src/shipping-consumer.ts` parses `record.body` as the order, which matches. |
| `src/clicks.ts:31` | KIN-005 | Returns `record.kinesis.sequenceNumber` for the first failure and stops; the mapping enables `ReportBatchItemFailures` via `transform` (`sst.config.ts:24`). |
| `go/producer/main.go:50` | KIN-003 | `FailedRecordCount` is checked and only entries with `ErrorCode` are retried with backoff. |
| `src/orders-consumer.ts:17` | SQS-012 | The write is conditional on `attribute_not_exists(pk)` and `ConditionalCheckFailedException` is treated as already processed: redelivery is harmless. |

## Also correct if reported (not counted as false positives)

- SNS-002 on `infra/main.tf:91` and `sst.config.ts:32`: subscriptions without a DLQ.
- SNS-010 on `sst.config.ts:32`: SNS → Lambda without an on-failure destination.
- EVB-002 on `infra/main.tf:124`: default 24 h / 185 retry policy, if the finding argues billing is time-sensitive.
- KIN-012 on `sst.config.ts:12`: no iterator-age alarm for the Clickstream consumer (or a hand-off to aws-observability).
- KIN-011 on `sst.config.ts:12`: SST `KinesisStream` sets no `encryptionType`, so the Clickstream stream is unencrypted at rest.
- SQS-002 on `infra/main.tf:87` only if the finding notes that the notifications consumer lives outside these files.
