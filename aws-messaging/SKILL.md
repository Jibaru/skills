---
name: aws-messaging
description: Review SQS, SNS, EventBridge (rules, Pipes, Scheduler), Kinesis Data Streams, MSK and Step Functions in Terraform, CDK, SST, TypeScript (AWS SDK v3) and Go (aws-sdk-go-v2) code and diffs — visibility timeouts and DLQs, partial batch responses, FIFO groups and dedup, filter policies and raw delivery, retry policies, PutEvents/PutRecords partial failures, hot shards, Kafka client durability, Standard vs Express cost, payload limits and Lambda glue that a managed integration replaces. Use when the user asks "review my queue/consumer", "why are my SQS messages processed twice", "is this EventBridge rule right", "check my Step Functions workflow", "review my Kinesis/Kafka producer", "revisa mis colas", or when aws-review dispatches it.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-messaging

Messaging and orchestration reviewer for the AWS review kit. It reads files, diffs and
`terraform plan` / `cdk diff` / `sst diff` output and reports bugs, lost or duplicated
messages, cost waste, throughput limits and simplifications. It reviews statically: it never
calls an AWS account, and it only reports. Fixes are applied only if the user asks afterwards.

## Scope

Covers SQS (queues, DLQs, redrive, polling, FIFO, batching, payload size, Lambda event source
mappings on SQS), SNS (subscriptions, filter policies, raw delivery, fan-out, FIFO topics),
EventBridge (Classic buses and the Custom Event Bus with subscribers, patterns, targets,
retries, archive/replay, Pipes, Scheduler, schemas), Kinesis Data Streams (capacity modes,
partition keys, producers, Lambda/EFO consumers), MSK (cluster type, replication, IAM auth,
Kafka client settings) and Step Functions (workflow type, retries/catch, timeouts, payload
limits, integrations, Map).

Hand off what is not messaging semantics, one line per finding (`hand off to <skill>`):

- Function memory, runtime, cold starts, ECS/EC2 consumers' compute → `aws-compute`
- DynamoDB/RDS writes made by consumers, DynamoDB Streams data modelling → `aws-data`
- S3 buckets used for claim-check payloads, Firehose to S3 → `aws-storage`
- VPC reachability to MSK, endpoints, security groups → `aws-networking`
- Module layout, state, drift, tool idioms → `aws-iac`
- IAM policy breadth, key policies, secrets → `aws-security` (this skill flags only the
  service-to-service grants that make delivery fail or that open a queue to any sender)
- Account-wide bill analysis → `aws-cost` (this skill still shows the arithmetic for
  messaging-specific cost findings)
- Which alarms, dashboards and traces exist → `aws-observability`

## Signals

This expert applies when any of these appear in the files under review.

- Files: `**/*.tf`, `**/*.tfplan.json`, `lib/**/*.ts`, `bin/*.ts`, `cdk.json`,
  `sst.config.ts`, `infra/**/*.ts`, `**/*.asl.json`, `**/*.asl.yaml`, `statemachine/**`,
  CloudFormation templates with `AWS::EventsV2::*`, `cdk diff` / `sst diff` / `terraform plan` output, Lambda handlers typed `SQSEvent`,
  `SNSEvent`, `KinesisStreamEvent`, `EventBridgeEvent`, `MSKEvent`, `events.SQSEvent`,
  `events.KinesisEvent`, `events.CloudWatchEvent`.
- Terraform: `aws_sqs_queue`, `aws_sqs_queue_policy`, `aws_sqs_queue_redrive_policy`,
  `aws_sqs_queue_redrive_allow_policy`, `aws_lambda_event_source_mapping`, `aws_sns_topic`,
  `aws_sns_topic_subscription`, `aws_sns_topic_policy`, `aws_cloudwatch_event_bus`,
  `aws_cloudwatch_event_rule`, `aws_cloudwatch_event_target`, `aws_cloudwatch_event_archive`,
  `aws_pipes_pipe`, `aws_scheduler_schedule`, `aws_scheduler_schedule_group`,
  `aws_schemas_discoverer`, `aws_kinesis_stream`, `aws_kinesis_stream_consumer`,
  `aws_msk_cluster`, `aws_msk_serverless_cluster`, `aws_msk_configuration`,
  `aws_sfn_state_machine`, `aws_sfn_activity`.
- CDK: `aws-cdk-lib/aws-sqs` (`new sqs.Queue`), `aws-sns` (`new sns.Topic`),
  `aws-sns-subscriptions` (`SqsSubscription`, `LambdaSubscription`), `aws-events`
  (`new events.Rule`, `EventBus`, `Archive`), `aws-events-targets`, `aws-eventsv2`
  (`CfnEventBus`, `CfnSubscriber`), `aws-scheduler`,
  `aws-scheduler-targets`, `aws-pipes` (`CfnPipe`), `aws-kinesis` (`new kinesis.Stream`),
  `aws-msk` (`CfnCluster`, `CfnServerlessCluster`), `@aws-cdk/aws-msk-alpha`,
  `aws-lambda-event-sources` (`SqsEventSource`, `KinesisEventSource`,
  `ManagedKafkaEventSource`), `aws-stepfunctions` (`StateMachine`, `DefinitionBody`, `Map`,
  `DistributedMap`), `aws-stepfunctions-tasks`.
- SST v3: `sst.aws.Queue`, `sst.aws.SnsTopic`, `sst.aws.Bus`, `sst.aws.KinesisStream`,
  `sst.aws.Cron`, `sst.aws.CronV2`, `sst.aws.StepFunctions`, `.subscribe(`,
  `.subscribeQueue(`, `batch: { partialResponses`, `dlq:`.
- TypeScript SDK: `@aws-sdk/client-sqs`, `@aws-sdk/client-sns`,
  `@aws-sdk/client-eventbridge`, `@aws-sdk/client-eventbridgev2`, `@aws-sdk/client-scheduler`, `@aws-sdk/client-pipes`,
  `@aws-sdk/client-kinesis`, `@aws-sdk/client-kafka`, `@aws-sdk/client-sfn`, `kafkajs`,
  `aws-msk-iam-sasl-signer-js`, `@aws-lambda-powertools/batch`; calls such as
  `SendMessageBatchCommand`, `ReceiveMessageCommand`, `PublishCommand`, `PutEventsCommand`,
  `PutRecordsCommand`, `CreateSubscriberCommand`, `StartExecutionCommand`, `batchItemFailures`.
- Go SDK: `github.com/aws/aws-sdk-go-v2/service/sqs`, `.../service/sns`,
  `.../service/eventbridge`, `.../service/eventbridgev2`, `.../service/scheduler`, `.../service/pipes`,
  `.../service/kinesis`, `.../service/kafka`, `.../service/sfn`,
  `github.com/aws/aws-lambda-go/events`, `github.com/aws/aws-msk-iam-sasl-signer-go`,
  `github.com/segmentio/kafka-go`, `github.com/twmb/franz-go`,
  `github.com/confluentinc/confluent-kafka-go`.

## Procedure

1. **Collect the inputs.** Use the files you were given; otherwise find them with the Signals.
   When reviewing a change, start from the diff, then read what it wires into: for every queue,
   topic, rule, stream or state machine in scope, open its producers, its consumers (handler
   code and the event source mapping or subscription) and its DLQ. Most messaging bugs live in
   the gap between the IaC and the handler (partial batch flags, raw delivery, filter scope,
   visibility vs timeout). Done when each channel in scope has its producer, consumer and
   failure path identified, or noted as outside the files.
2. **Open only the references that match.** Use the index below; skip topics with nothing in
   scope.
3. **Apply the rules.** Check every rule of each opened reference against the inputs. Also hunt
   for problems no rule names (lost messages, duplicates, ordering, poison messages, loops,
   unbounded cost) and mark them `NEW`.
4. **Verify every finding** against the actual code before reporting it: trace the setting to
   its effective value (defaults included: the references list the Terraform, CDK and SST
   defaults) and the code path that hits it. Report only what you traced; a rule that merely
   *could* apply is dropped.
5. **Staleness.** Every rule carries `Last verified`. If a rule you used was last verified more
   than 120 days before today, add "reference is stale, run /aws-refresh" to the report, and for
   `Volatile: yes` rules confirm the fact live before quoting numbers (the AWS Knowledge or AWS
   Documentation MCP if connected, otherwise WebFetch the rule's Source URL).

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

## References

| File | Covers |
| --- | --- |
| [sqs.md](references/sqs.md) | Visibility vs Lambda timeout, DLQ and maxReceiveCount, DLQ retention, partial batch responses (both sides), FIFO ordering, long polling, batching and per-entry failures, visibility heartbeats, idempotency, FIFO groups/dedup/high throughput, payload size (Terraform 256 KiB default), queue policies, KMS for service publishers, ESM concurrency, fair queues, SST link, ESM filters that delete messages (SQS-001–022) |
| [sns.md](references/sns.md) | Queue policy for fan-out, subscription DLQs, raw delivery vs consumer parsing, filter policy scope, filtering in subscriptions, attribute and size limits, FIFO topics to standard queues, PublishBatch, SNS→Lambda failures, FIFO publish keys, SST/CDK subscription helpers (SNS-001–012) |
| [eventbridge.md](references/eventbridge.md) | Target DLQs and retry policy (Classic vs Custom Event Bus defaults), DLQ permissions, PutEvents failures and bus names, batching, precise patterns and loops, pattern structure, Lambda permissions in Terraform, subscriber batching, Scheduler vs scheduled rules, schedule cleanup, archive retention, Pipes instead of glue, input transformers, schema discovery, Pipes stream-source retries, FIFO queue targets (EVB-001–018) |
| [kinesis.md](references/kinesis.md) | On-demand vs provisioned cost, partition keys and hot shards, PutRecords failures, bounded ESM retries, partial batch with sequence numbers, EFO cost, shared-throughput consumer limits, ParallelizationFactor, PutRecords batching, retention, encryption, iterator age (KIN-001–012) |
| [msk.md](references/msk.md) | Serverless vs provisioned cost and limits, RF/minISR/AZs, producer acks and idempotence, IAM auth and TLS, client lifecycle and connection storms, bootstrap brokers, partitions per broker, disk and retention, offset commits, rack awareness, producer batching, consumer group stability (MSK-001–012) |
| [step-functions.md](references/step-functions.md) | Standard vs Express cost and semantics, unsupported patterns in Express, timeouts and heartbeats, Lambda retries, Catch ResultPath, States.ALL ordering, 256 KiB payloads, SDK integrations instead of Lambda glue, polling loops, Distributed Map, history limit, Map concurrency, Express logging, execution names, JSONata (SFN-001–016) |
| [sources.md](references/sources.md) | Every official URL used, grouped by topic, with Last verified dates |
