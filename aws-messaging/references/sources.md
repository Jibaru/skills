# Sources

Every official page the aws-messaging rules cite, grouped by topic, so they can be re-found if
they move. All Last verified 2026-10-12.

## SQS

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html | Message size 1 MiB, retention 4 d default / 14 d max, visibility 30 s / 12 h, batch 10, FIFO throughput, fair queue group ID |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html | Redrive policy, maxReceiveCount, redrive allow policy, DLQ retention vs enqueue timestamp |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html | Short polling default, long polling max 20 s, cost of empty receives |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html | ChangeMessageVisibility heartbeat, 12 h cap, in-flight limits |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html | FIFO 5-minute deduplication window |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagegroupid-property.html | FIFO message groups |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/high-throughput-fifo.html | High-throughput FIFO, partitions |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fair-queues.html | Fair queues on standard queues |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-batch-api-actions.html | Batch actions |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessageBatch.html | Per-entry `Failed` results |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html | At-least-once delivery |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-pricing.html | Pricing model overview |
| https://aws.amazon.com/sqs/pricing/ | 1M free requests/month, 64 KB chunk billing, FIFO rates, fair-queue requests billed at fair-queue plus standard rates (per-request prices did not render in the fetched page: confirm live before quoting dollars) |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SetQueueAttributes.html | `MaximumMessageSize` default 1 MiB in the API |
| https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html | ESM filters: non-matching records are discarded |
| https://docs.aws.amazon.com/lambda/latest/dg/with-sqs-filtering.html | SQS ESM filters on `body`; body/pattern format mismatch drops the message |
| https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html | Visibility ≥ 6× function timeout (+ batch window), maxReceiveCount ≥ 5, batch size limits, provisioned mode |
| https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html | ReportBatchItemFailures, success/failure conditions, FIFO stop-at-first-failure |
| https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html | Maximum concurrency on SQS mappings |
| https://docs.aws.amazon.com/lambda/latest/api/API_CreateEventSourceMapping.html | ESM parameters (FunctionResponseTypes, retries, record age) |
| https://docs.aws.amazon.com/powertools/typescript/latest/features/batch/ | BatchProcessor, SqsFifoPartialProcessorAsync, skipGroupOnError |
| https://docs.aws.amazon.com/powertools/typescript/latest/features/idempotency/ | makeIdempotent, IdempotencyConfig eventKeyJmesPath |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue | `aws_sqs_queue` arguments; `max_message_size` provider default 262144 (256 KiB), `receive_wait_time_seconds` default 0 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping | `aws_lambda_event_source_mapping` arguments |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_sqs.QueueProps.html | CDK Queue defaults (visibility 30 s, retention 4 d, SQS_MANAGED encryption) |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_event_sources.SqsEventSourceProps.html | CDK SqsEventSource (reportBatchItemFailures default false, maxConcurrency) |
| https://sst.dev/docs/component/aws/queue/ | SST Queue (visibilityTimeout 30 s, dlq retry 3, batch.partialResponses default false) |
| https://sst.dev/docs/linking/ | SST `link` and `Resource` |

## SNS

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html | Queue policy for SNS with aws:SourceArn |
| https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html | Subscription DLQs, client vs server errors, retry counts |
| https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html | Raw message delivery, 10-attribute limit |
| https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering.html | Filter policies |
| https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering-scope.html | FilterPolicyScope default MessageAttributes |
| https://docs.aws.amazon.com/sns/latest/dg/large-message-payloads.html | MaximumMessageSize 256 KiB default, up to 1 MiB, ≤ 100 subscriptions |
| https://docs.aws.amazon.com/sns/latest/dg/fifo-message-delivery.html | FIFO topics to standard/FIFO queues |
| https://docs.aws.amazon.com/sns/latest/dg/sns-enable-encryption-for-topic-sqs-queue-subscriptions.html | CMK policy for SNS to encrypted queues |
| https://docs.aws.amazon.com/sns/latest/api/API_PublishBatch.html | PublishBatch per-entry failures |
| https://docs.aws.amazon.com/general/latest/gr/sns.html | SNS quotas (publish TPS, message size, filter policies, FIFO throughput) |
| https://aws.amazon.com/sns/pricing/ | 64 KB chunk billing, payload-based filtering billed on outbound payload scanned (min 1 KB per message) |
| https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html | Async invocation retries and destinations |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_sns_subscriptions.SqsSubscriptionProps.html | CDK rawMessageDelivery default false, filterPolicyWithMessageBody, deadLetterQueue |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic_subscription | `raw_message_delivery`, `filter_policy_scope`, `redrive_policy` |
| https://sst.dev/docs/component/aws/sns-topic/ | SST SnsTopic `subscribe`/`subscribeQueue`, `filter`, `transform.subscription` |

## EventBridge and Scheduler

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html | Classic retry default 24 h / 185 attempts |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html | Target DLQ: standard queues only, permissions, errors not retried |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-putevents.html | FailedEntryCount handling, nonexistent bus drops events, entry size (10 entries, < 1 MB) |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html | PutEvents TPS per Region, targets per rule, Custom Event Bus fixed limits |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html | Pattern structure mirrors the event, loop warning |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-patterns-best-practices.html | Precise patterns, infinite loops |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html | Resource-based permissions for Lambda/SQS/SNS targets |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-transform-target-input.html | Input transformers |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-archive.html | Archive retention indefinite by default, replay behaviour |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes.html | Pipes (filter, enrichment, pay for filtered events) |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schema.html | Schema registry and discovery |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-scheduled-rule-pattern.html | Scheduled rules are legacy; use Scheduler |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-migrate.html | Classic vs Custom Event Bus; subscriber defaults (300 s / 5 attempts, batched delivery) |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-retry.html | Subscriber RetryPolicy and OnFailureConfiguration |
| https://aws.amazon.com/eventbridge/pricing/ | Classic custom events $1.00/M ingested (cross-account delivery also $1.00/M, same-account delivery free), 64 KB chunk = 1 event; Pipes $0.40/M; Scheduler 14M free then $1.00/M; archive $0.10/GB + $0.023/GB-month; schema discovery 5M free then $1.00/M (8 KB chunks); Custom Event Bus billed per GB ingress/egress/storage plus $0.15/M evaluations |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-names.html | Custom Event Bus CLI `eventsv2`, SDK client `EventBridgeV2`, endpoint, `AWS::EventsV2` CloudFormation types, shared `events:` IAM namespace |
| https://docs.aws.amazon.com/eventbridgev2/latest/APIReference/API_CreateSubscriber.html | CreateSubscriber parameters (RetryPolicy, BatchConfiguration, OnFailureConfiguration) |
| https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-eventsv2-subscriber.html | `AWS::EventsV2::Subscriber` |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_eventsv2-readme.html | CDK `aws-eventsv2`: L1 only |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes-error-troubleshooting.html | Pipes retry behaviour per source type, DLQ for stream sources |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html | Targets list; SqsParameters message group for FIFO/fair queue targets |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_events_targets.SqsQueueProps.html | CDK `messageGroupId` required for FIFO targets |
| https://docs.aws.amazon.com/scheduler/latest/UserGuide/managing-schedule-delete.html | ActionAfterCompletion DELETE |
| https://docs.aws.amazon.com/scheduler/latest/UserGuide/configuring-schedule-dlq.html | Scheduler DLQ |
| https://docs.aws.amazon.com/scheduler/latest/UserGuide/managing-schedule-flexible-time-windows.html | Flexible time windows |
| https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html | Recursive loop detection (SQS, SNS, S3, EventBridge custom buses; ~16 invocations) |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target | `dead_letter_config`, `retry_policy`, `input_transformer` |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/scheduler_schedule | `action_after_completion`, `schedule_expression_timezone`, target `retry_policy`/`dead_letter_config` |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/pipes_pipe | `aws_pipes_pipe` source/target parameters; stream-source `maximum_retry_attempts` / `maximum_record_age_in_seconds` default -1 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_archive | `retention_days` (indefinite by default), `event_pattern` |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_events_targets.LambdaFunctionProps.html | CDK target defaults (maxEventAge 24 h, retryAttempts 185, no DLQ) |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_scheduler-readme.html | CDK Scheduler L2 and targets |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_pipes-readme.html | Pipes in CDK: L1 `CfnPipe` only |
| https://sst.dev/docs/component/aws/bus/ | SST Bus subscribe/subscribeQueue, `transform` for rule/target |
| https://sst.dev/docs/component/aws/cron/ | SST Cron (EventBridge scheduled rule) |
| https://sst.dev/docs/component/aws/cron-v2/ | SST CronV2 (Scheduler, timezone, retries default 0) |

## Kinesis Data Streams

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/streams/latest/dev/how-do-i-size-a-stream.html | On-demand Standard/Advantage vs provisioned, hot partition keys, shard formula |
| https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html | Per-shard 1 MB/s / 1,000 rec/s write, 2 MB/s / 5 TPS read, 10 MiB records, EFO consumers 20 (50 Advantage) |
| https://docs.aws.amazon.com/streams/latest/dev/developing-producers-with-sdk.html | PutRecords 500 records, FailedRecordCount handling, partition key guidance |
| https://docs.aws.amazon.com/streams/latest/dev/enhanced-consumers.html | Enhanced fan-out |
| https://docs.aws.amazon.com/streams/latest/dev/kinesis-extended-retention.html | Retention periods |
| https://docs.aws.amazon.com/streams/latest/dev/monitoring-with-cloudwatch.html | IteratorAgeMilliseconds |
| https://docs.aws.amazon.com/streams/latest/dev/server-side-encryption.html | Server-side encryption |
| https://aws.amazon.com/kinesis/data-streams/pricing/ | On-demand Standard $0.04/stream-h + $0.08/GB in + $0.04/GB out; On-demand Advantage $0.032/GB in, $0.016/GB out, EFO included, 25 MiB/s commitment; provisioned $0.015/shard-h + $0.014/M PUT units, EFO $0.015/consumer-shard-h + $0.013/GB (us-east-1) |
| https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html | Polling, batching, ParallelizationFactor, at-least-once |
| https://docs.aws.amazon.com/lambda/latest/dg/kinesis-on-failure-destination.html | Retries until expiry by default, bisect, on-failure destinations |
| https://docs.aws.amazon.com/lambda/latest/dg/services-kinesis-batchfailurereporting.html | itemIdentifier = sequence number, lowest-sequence checkpoint |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kinesis.StreamProps.html | CDK Stream defaults (PROVISIONED, 1 shard, 24 h, KMS) |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_event_sources.KinesisEventSourceProps.html | CDK KinesisEventSource defaults (retryAttempts −1, maxRecordAge −1) |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kinesis_stream | `stream_mode_details`, `encryption_type`, `retention_period` |
| https://sst.dev/docs/component/aws/kinesis-stream/ | SST KinesisStream, `transform.stream`, subscribe `transform.eventSourceMapping` |

## MSK

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices.html | RF 3, minISR = RF − 1, 3 AZs, partitions per broker, CPU < 60 %, disk alarms, retention |
| https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-kafka-client.html | acks=all, retries, delivery.timeout, linger/batch/compression, client.rack, connection storms, consumer rebalances |
| https://docs.aws.amazon.com/msk/latest/developerguide/limits.html | Standard/Express/Serverless quotas, IAM connection limits |
| https://docs.aws.amazon.com/msk/latest/developerguide/serverless.html | Serverless requires IAM, Regions |
| https://docs.aws.amazon.com/msk/latest/developerguide/configure-clients-for-iam-access-control.html | SASL/OAUTHBEARER signer libraries |
| https://docs.aws.amazon.com/msk/latest/developerguide/msk-encryption.html | Encryption in transit |
| https://docs.aws.amazon.com/msk/latest/developerguide/msk-autoexpand.html | Storage auto scaling |
| https://docs.aws.amazon.com/msk/latest/developerguide/msk-get-bootstrap-brokers.html | Bootstrap broker strings |
| https://aws.amazon.com/msk/pricing/ | Serverless $0.75/cluster-h, $0.0015/partition-h, $0.10/GB in, $0.05/GB out (US East (Ohio) example); kafka.m7g.large $0.204/h; express.m7g.large $0.408/h (us-east-1 examples) |
| https://aws.amazon.com/blogs/big-data/reduce-network-traffic-costs-of-your-amazon-msk-consumers-with-rack-awareness/ | Rack-aware consumers |
| https://github.com/aws/aws-msk-iam-sasl-signer-js | IAM signer for KafkaJS |
| https://github.com/aws/aws-msk-iam-sasl-signer-go | IAM signer for Go clients |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/msk_cluster | `client_authentication`, `encryption_info`, `storage_mode` |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/msk_serverless_cluster | Serverless IAM auth block |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_msk-readme.html | CDK MSK: L1 only; `@aws-cdk/aws-msk-alpha` preview |

## Step Functions

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html | Standard vs Express semantics, unsupported patterns, idempotent start by name |
| https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html | 256 KiB payload, 25,000 history events, durations, Map Run limits |
| https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html | Timeouts/heartbeats, S3 for large payloads, history limit, Lambda service exceptions, Express cost, vendedlogs |
| https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html | Retrier defaults (1 s, 3 attempts, 2.0), States.ALL rules, catcher ResultPath default |
| https://docs.aws.amazon.com/step-functions/latest/dg/input-output-resultpath.html | ResultPath in catchers |
| https://docs.aws.amazon.com/step-functions/latest/dg/state-map-inline.html | Inline Map 40 concurrent iterations, MaxConcurrency default 0 |
| https://docs.aws.amazon.com/step-functions/latest/dg/state-map-distributed.html | Distributed Map |
| https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html | Request Response, .sync, .waitForTaskToken |
| https://docs.aws.amazon.com/step-functions/latest/dg/integrate-optimized.html | Optimized integrations |
| https://docs.aws.amazon.com/step-functions/latest/dg/supported-services-awssdk.html | AWS SDK integrations ARN format |
| https://docs.aws.amazon.com/step-functions/latest/dg/transforming-data.html | JSONata |
| https://docs.aws.amazon.com/step-functions/latest/dg/cw-logs.html | CloudWatch Logs for executions |
| https://docs.aws.amazon.com/step-functions/latest/apireference/API_StartExecution.html | Execution name |
| https://aws.amazon.com/step-functions/pricing/ | Standard $0.025/1,000 transitions (4,000 free); Express $1.00/M requests + $0.06/GB-h first tier, 64 MB / 100 ms rounding (us-east-1) |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions_tasks.LambdaInvoke.html | retryOnServiceExceptions default true, no default timeout |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions_tasks.DynamoPutItem.html | Direct DynamoDB integration |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions_tasks.SqsSendMessage.html | SQS integration and callback pattern |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions.DistributedMap.html | DistributedMap, S3JsonItemReader, toleratedFailurePercentage |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sfn_state_machine | `type`, `logging_configuration` |
| https://sst.dev/docs/component/aws/step-functions/ | SST StepFunctions (type default standard, task timeout, retry/catch) |
