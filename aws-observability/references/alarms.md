# Alarms

CloudWatch alarms on the signals that actually page: errors, throttles, backlog (DLQ depth,
oldest message age, iterator age), tail latency and 5xx; how missing data is treated; where
the alarm notification goes. Prices are us-east-1, verified 2026-10-12: standard alarm
$0.10/alarm-metric-month, high-resolution $0.30, composite $0.50.

Tool idioms used below:
- Terraform: `aws_cloudwatch_metric_alarm`, `aws_cloudwatch_composite_alarm` (hashicorp/aws).
- CDK v2: `cloudwatch.Alarm`, `fn.metricErrors()`, `queue.metricApproximateNumberOfMessagesVisible()`,
  `alarm.addAlarmAction(new cw_actions.SnsAction(topic))`.
- SST v3: no alarm component; alarms are Pulumi resources in `sst.config.ts`:
  `new aws.cloudwatch.MetricAlarm(...)`.

### OBS-001 — Alarm on Errors and Throttles for every production Lambda
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Each production function that serves users or drains a queue/stream has an alarm on `AWS/Lambda` `Errors` (Sum) and one on `Throttles` (Sum), dimensioned by `FunctionName`, wired to a notification action.
- **Why:** Without them a function can fail 100% of invocations (bad deploy, expired secret, missing IAM permission) and nobody knows until a customer complains; throttled async/stream events are retried and can age out silently.
- **Detect:** `aws_lambda_function` / `new lambda.Function(` / `new NodejsFunction(` / `new sst.aws.Function(` (also functions created by `sst.aws.ApiGatewayV2.route`, `sst.aws.Queue.subscribe`, `sst.aws.Cron`) with no `aws_cloudwatch_metric_alarm` whose `metric_name = "Errors"` and `dimensions = { FunctionName = ... }` points at it; CDK with no `fn.metricErrors(` / `metricThrottles(` alarm; SST config with no `aws.cloudwatch.MetricAlarm` at all.
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_metric_alarm" "fn_errors" {
    alarm_name          = "${aws_lambda_function.fn.function_name}-errors"
    namespace           = "AWS/Lambda"
    metric_name         = "Errors"
    dimensions          = { FunctionName = aws_lambda_function.fn.function_name }
    statistic           = "Sum"
    period              = 60
    evaluation_periods  = 3
    datapoints_to_alarm = 3
    threshold           = 0
    comparison_operator = "GreaterThanThreshold"
    treat_missing_data  = "notBreaching"
    alarm_actions       = [aws_sns_topic.alerts.arn]
    ok_actions          = [aws_sns_topic.alerts.arn]
  }
  ```
  ```ts
  // CDK
  fn.metricErrors({ period: Duration.minutes(1) })
    .createAlarm(this, "FnErrors", { threshold: 0, evaluationPeriods: 3,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING })
    .addAlarmAction(new cw_actions.SnsAction(alertsTopic));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html ; https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html
- **Last verified:** 2026-10-12

### OBS-002 — Alarm on DLQ depth with ApproximateNumberOfMessagesVisible
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every dead-letter queue has an alarm on `ApproximateNumberOfMessagesVisible` (Maximum, threshold > 0); never use `NumberOfMessagesSent` to watch a DLQ.
- **Why:** Messages moved to a DLQ by the redrive policy are not counted in `NumberOfMessagesSent` (only manual sends are), so an alarm on it never fires while failed orders pile up until `message_retention_seconds` deletes them.
- **Detect:** `aws_sqs_queue` referenced in another queue's `redrive_policy` / `deadLetterTargetArn`, CDK `deadLetterQueue: { queue: dlq, ... }`, SST `new sst.aws.Queue(..., { dlq: ... })` with no alarm on the DLQ; or an alarm on the DLQ with `metric_name = "NumberOfMessagesSent"` / `dlq.metricNumberOfMessagesSent()`.
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
    alarm_name          = "orders-dlq-not-empty"
    namespace           = "AWS/SQS"
    metric_name         = "ApproximateNumberOfMessagesVisible"
    dimensions          = { QueueName = aws_sqs_queue.orders_dlq.name }
    statistic           = "Maximum"
    period              = 300
    evaluation_periods  = 1
    threshold           = 0
    comparison_operator = "GreaterThanThreshold"
    treat_missing_data  = "notBreaching"
    alarm_actions       = [aws_sns_topic.alerts.arn]
  }
  ```
  An idle queue stops emitting metrics after 6 hours and resumes with up to 15 minutes delay; `notBreaching` keeps the alarm quiet while it sleeps. Hand off redrive and retention settings to `aws-messaging`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-available-cloudwatch-metrics.html ; https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/monitoring-using-cloudwatch.html
- **Last verified:** 2026-10-12

### OBS-003 — Alarm on the age of the oldest message for work queues
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Queues with an SLA have an alarm on `ApproximateAgeOfOldestMessage` (Maximum), with the threshold derived from the processing SLA, not only on queue depth.
- **Why:** Depth alone does not tell a healthy burst from a stuck consumer or a poison message; age crossing the SLA (and approaching `message_retention_seconds`) is the signal that work will be lost or late.
- **Detect:** `aws_sqs_queue` / `new sqs.Queue(` / `new sst.aws.Queue(` consumed by a function (`aws_lambda_event_source_mapping`, `SqsEventSource`, `queue.subscribe(`) with no alarm whose `metric_name = "ApproximateAgeOfOldestMessage"` (CDK `metricApproximateAgeOfOldestMessage`).
- **Fix:**
  ```ts
  queue.metricApproximateAgeOfOldestMessage({ period: Duration.minutes(1), statistic: "Maximum" })
    .createAlarm(this, "QueueAge", { threshold: 600, evaluationPeriods: 15, datapointsToAlarm: 15 })
    .addAlarmAction(new cw_actions.SnsAction(alertsTopic));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html
- **Last verified:** 2026-10-12

### OBS-004 — Alarm on IteratorAge / OffsetLag for stream consumers
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every Lambda consuming Kinesis, DynamoDB Streams or DocumentDB has an alarm on `AWS/Lambda` `IteratorAge` (Maximum); Kafka/MSK consumers alarm on `OffsetLag`.
- **Why:** A poison record or a throttled consumer blocks a shard; records keep aging until they fall off the stream's retention (24 h by default for Kinesis and DynamoDB Streams) and are lost, while `Errors` may look calm because of retries and bisecting.
- **Detect:** `aws_lambda_event_source_mapping` with `event_source_arn` of a Kinesis stream or DynamoDB stream / `starting_position`; CDK `KinesisEventSource`, `DynamoEventSource`, `ManagedKafkaEventSource`; SST `stream.subscribe(` / `table.subscribe(` — with no alarm on `IteratorAge` or `OffsetLag`.
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_metric_alarm" "iterator_age" {
    alarm_name          = "${aws_lambda_function.consumer.function_name}-iterator-age"
    namespace           = "AWS/Lambda"
    metric_name         = "IteratorAge"
    dimensions          = { FunctionName = aws_lambda_function.consumer.function_name }
    statistic           = "Maximum"
    period              = 60
    evaluation_periods  = 5
    threshold           = 300000 # 5 min, in ms
    comparison_operator = "GreaterThanThreshold"
    treat_missing_data  = "notBreaching"
    alarm_actions       = [aws_sns_topic.alerts.arn]
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html
- **Last verified:** 2026-10-12

### OBS-005 — Alarm on dropped and undeliverable async events
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Functions invoked asynchronously (S3, SNS, EventBridge, `InvocationType: "Event"`) alarm on `AsyncEventsDropped`, and on `DeadLetterErrors` / `DestinationDeliveryFailures` when a DLQ or on-failure destination is configured.
- **Why:** A misconfigured DLQ or destination (missing permission, FIFO target, size limit) means failed events are dropped with no trace; `Errors` alone does not show that the safety net itself failed.
- **Detect:** `aws_lambda_function_event_invoke_config` / `dead_letter_config` / CDK `onFailure:` / `deadLetterQueue:` / SST `transform.eventInvokeConfig`, or S3/SNS/EventBridge triggers (`aws_s3_bucket_notification`, `aws_lambda_permission` with `principal = "events.amazonaws.com"`), with no alarm on those metric names.
- **Fix:** Add an alarm like OBS-001 with `metric_name = "AsyncEventsDropped"` (and `DestinationDeliveryFailures`), `threshold = 0`, `treat_missing_data = "notBreaching"`. Hand off retry/destination design to `aws-compute`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html
- **Last verified:** 2026-10-12

### OBS-006 — Alarm on tail latency with a percentile, not Average
- **Severity:** medium
- **Category:** performance
- **Applies to:** Terraform, CDK, SST
- **Rule:** Latency alarms (`Duration`, API Gateway `Latency`, ALB `TargetResponseTime`) use `extended_statistic = "p99"` (or p90/p95), and set `evaluate_low_sample_count_percentiles` deliberately on low-traffic resources.
- **Why:** An `Average` hides the slow tail: 1% of requests taking 10 s barely moves the mean but breaks clients with timeouts. With few samples a p99 is noisy; CloudWatch needs 10/(1−0.99) = 1,000 samples in the period for a significant p99.
- **Detect:** `aws_cloudwatch_metric_alarm` with `metric_name` in `Duration`, `Latency`, `IntegrationLatency`, `TargetResponseTime` and `statistic = "Average"`; CDK `metricDuration()` / `metricLatency()` alarms without `statistic: "p99"`; Pulumi `MetricAlarm` with `statistic: "Average"` on those names.
- **Fix:**
  ```hcl
  extended_statistic                    = "p99"
  evaluate_low_sample_count_percentiles = "ignore" # low-traffic API: wait for enough samples
  ```
  ```ts
  fn.metricDuration({ statistic: "p99", period: Duration.minutes(5) })
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/percentiles-with-low-samples.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm
- **Last verified:** 2026-10-12

### OBS-007 — Use the metric names of the API type you deployed
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** HTTP APIs (API Gateway v2) emit `5xx`, `4xx`, `Latency` with dimension `ApiId` (+ `Stage`); REST APIs emit `5XXError`, `4XXError` with dimension `ApiName` (+ `Stage`). The alarm must match the API it watches.
- **Why:** An alarm on `5XXError` / `ApiName` for an HTTP API watches a metric that never exists; it sits in `INSUFFICIENT_DATA` (or OK with `notBreaching`) through a full outage.
- **Detect:** `aws_apigatewayv2_api` / CDK `HttpApi` / SST `sst.aws.ApiGatewayV2` paired with an alarm using `metric_name = "5XXError"` or `dimensions = { ApiName = ... }`; or `aws_api_gateway_rest_api` / `RestApi` / `sst.aws.ApiGatewayV1` alarmed with `5xx` / `ApiId`.
- **Fix:**
  ```hcl
  # HTTP API
  namespace   = "AWS/ApiGateway"
  metric_name = "5xx"
  dimensions  = { ApiId = aws_apigatewayv2_api.http.id, Stage = "$default" }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html
- **Last verified:** 2026-10-12

### OBS-008 — Choose treat_missing_data per metric, not by default
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set `treat_missing_data` explicitly: `notBreaching` for metrics that only appear when something happens (errors, throttles, DLQ depth of a sleeping queue), `breaching` for heartbeat-style alarms whose silence is the failure (producer `NumberOfMessagesSent`, `Invocations` of a cron job, custom "job completed" metric).
- **Why:** The default `missing` leaves error alarms flapping into `INSUFFICIENT_DATA` on idle functions, and makes "nothing was processed tonight" alarms never fire because no data is not a breach. `AWS/DynamoDB` alarms default to `ignore`.
- **Detect:** a heartbeat alarm (`comparison_operator = "LessThanThreshold"` / `LessThanOrEqualToThreshold`, CDK `LESS_THAN_*`) on a count metric without `treat_missing_data = "breaching"` (the real bug); an alarm on a sparse metric (`Errors`, `Throttles`, `5xx`, `5XXError`, DLQ `ApproximateNumberOfMessagesVisible`, `AsyncEventsDropped`) without `treat_missing_data` / `treatMissingData` (lower impact: flaps to `INSUFFICIENT_DATA`). An alarm on a continuously emitted metric left at the default is not a finding. Remember `AWS/DynamoDB` alarms default to `ignore`.
- **Fix:**
  ```hcl
  # nightly export must run: no data = failure
  metric_name         = "Invocations"
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  period              = 86400
  treat_missing_data  = "breaching"
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html
- **Last verified:** 2026-10-12

### OBS-009 — Give every alarm an action
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every alarm that is meant to page or notify has `alarm_actions` (usually an SNS topic, also `ok_actions` so the recovery is visible) and `actions_enabled` is not `false`; alarms used only as composite inputs are the exception.
- **Why:** An alarm without an action changes state in the console and nobody is told; it costs $0.10/month and protects nothing.
- **Detect:** `aws_cloudwatch_metric_alarm` without `alarm_actions` (or `alarm_actions = []`), `actions_enabled = false`; CDK `createAlarm(` / `new cloudwatch.Alarm(` whose result is never passed to `addAlarmAction(` nor used in an `AlarmRule`; Pulumi `MetricAlarm` without `alarmActions`.
- **Fix:**
  ```ts
  const alarm = fn.metricErrors().createAlarm(this, "Errors", { threshold: 0, evaluationPeriods: 3 });
  alarm.addAlarmAction(new cw_actions.SnsAction(alertsTopic));
  alarm.addOkAction(new cw_actions.SnsAction(alertsTopic));
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudwatch.Alarm.html
- **Last verified:** 2026-10-12

### OBS-010 — Encrypt alarm SNS topics with a customer managed key that CloudWatch can use
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** An SNS topic that receives CloudWatch alarm actions is either unencrypted or encrypted with a customer managed KMS key whose policy allows `cloudwatch.amazonaws.com` `kms:Decrypt` and `kms:GenerateDataKey*`; never `alias/aws/sns`.
- **Why:** The AWS managed `alias/aws/sns` key policy cannot grant CloudWatch access, so every alarm action fails ("CloudWatch Alarms does not have authorization to access the SNS topic encryption key") and no page is ever sent.
- **Detect:** Terraform `aws_sns_topic` with `kms_master_key_id = "alias/aws/sns"` used in `alarm_actions`; CDK `new sns.Topic(this, ..., { masterKey: kms.Alias.fromAliasName(this, "k", "alias/aws/sns") })` passed to `SnsAction`; SST `new sst.aws.SnsTopic` with `transform.topic` setting `kmsMasterKeyId: "alias/aws/sns"`.
- **Fix:**
  ```hcl
  resource "aws_kms_key" "alerts" {
    policy = jsonencode({ Version = "2012-10-17", Statement = [
      { Sid = "Root", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.me.account_id}:root" }, Action = "kms:*", Resource = "*" },
      { Sid = "CloudWatch", Effect = "Allow", Principal = { Service = "cloudwatch.amazonaws.com" },
        Action = ["kms:Decrypt", "kms:GenerateDataKey*"], Resource = "*" } ] })
  }
  resource "aws_sns_topic" "alerts" { kms_master_key_id = aws_kms_key.alerts.arn }
  ```
  Hand off key design to `aws-security`.
- **Volatile:** no
- **Source:** https://repost.aws/knowledge-center/cloudwatch-configure-alarm-sns ; https://repost.aws/knowledge-center/cloudwatch-receive-sns-for-alarm-trigger
- **Last verified:** 2026-10-12

### OBS-011 — Alarm on error rate with M-of-N datapoints for busy endpoints
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** For high-traffic functions and APIs, alarm on an error *rate* (metric math `errors / invocations`) and use `datapoints_to_alarm` < `evaluation_periods` (e.g. 3 of 5) instead of a single-datapoint raw count.
- **Why:** A fixed count (`Errors > 5`) pages constantly at peak and never at night; a single breaching datapoint flaps on every blip, training the team to ignore the alarm.
- **Detect:** `aws_cloudwatch_metric_alarm` with `evaluation_periods = 1` and no `datapoints_to_alarm` on `Errors`, `5xx`, `5XXError`; a raw-count threshold above 0 (e.g. `threshold = 5` with `statistic = "Sum"`) on `5xx` / `5XXError` / `Errors` of an API or consumer. Not a finding: `threshold = 0` count alarms (any error pages, a deliberate choice for low-traffic functions), or alarms that already use `metric_query` / `Average` of `5XXError` (which is already a rate). Report as a suggestion unless the evidence shows real flapping or traffic volume.
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_metric_alarm" "api_error_rate" {
    alarm_name          = "checkout-error-rate"
    comparison_operator = "GreaterThanThreshold"
    threshold           = 1 # percent
    evaluation_periods  = 5
    datapoints_to_alarm = 3
    treat_missing_data  = "notBreaching"
    alarm_actions       = [aws_sns_topic.alerts.arn]
    metric_query {
      id = "rate"
      expression  = "100 * errors / MAX([errors, invocations])"
      return_data = true
    }
    metric_query {
      id = "errors"
      metric { namespace = "AWS/Lambda", metric_name = "Errors", period = 60, stat = "Sum", dimensions = { FunctionName = aws_lambda_function.fn.function_name } }
    }
    metric_query {
      id = "invocations"
      metric { namespace = "AWS/Lambda", metric_name = "Invocations", period = 60, stat = "Sum", dimensions = { FunctionName = aws_lambda_function.fn.function_name } }
    }
  }
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html
- **Last verified:** 2026-10-12

### OBS-012 — Page through a composite alarm when one failure trips many alarms
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK, SST
- **Rule:** When several alarms describe one user-facing failure (API 5xx, function errors, DLQ depth of the same flow), send the page from one `aws_cloudwatch_composite_alarm` and keep the children action-less; use `actions_suppressor` for planned maintenance or an upstream outage alarm.
- **Why:** One incident producing 10 pages is alert fatigue; a composite alarm ($0.50/month) gives one actionable notification and still lets you drill into the children.
- **Detect:** three or more `aws_cloudwatch_metric_alarm` for the same service/flow all with the same `alarm_actions` topic; CDK many `addAlarmAction(` to the same topic for one stack; no `aws_cloudwatch_composite_alarm` / `cloudwatch.CompositeAlarm`.
- **Fix:**
  ```ts
  new cloudwatch.CompositeAlarm(this, "CheckoutDown", {
    alarmRule: cloudwatch.AlarmRule.anyOf(apiErrors, fnErrors, dlqDepth),
    actionsSuppressor: maintenanceAlarm,
  }).addAlarmAction(new cw_actions.SnsAction(pagerTopic));
  ```
- **Volatile:** yes
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_composite_alarm ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudwatch.CompositeAlarm.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-013 — Use high-resolution alarms only where seconds matter
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Alarms with `period` of 10 or 30 seconds (high resolution, $0.30/alarm-metric-month vs $0.10) are reserved for metrics published at high resolution and for decisions that need sub-minute reaction; everything else uses `period >= 60`.
- **Why:** AWS service metrics such as Lambda and SQS arrive at one-minute granularity, so a 10-second alarm on them adds cost without faster detection; generated per-tenant or per-function alarms multiply the 3× price.
- **Detect:** `aws_cloudwatch_metric_alarm` with `period = 10` or `period = 30`; CDK `period: Duration.seconds(10|30)`; alarms created in `for_each` / `count` / `.map(` loops with those periods.
- **Fix:** `period = 60` (or larger) and tune `evaluation_periods`; publish custom metrics with `StorageResolution: 1` only when a 10/30 s alarm truly needs them.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudwatch/pricing/ ; https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/monitoring-using-cloudwatch.html
- **Last verified:** 2026-10-12

### OBS-014 — Alarm on account-level concurrency when functions share a Region quota
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Accounts running several production functions (or using reserved/provisioned concurrency) have one alarm on `ClaimedAccountConcurrency` (Maximum, no dimension) at ~90% of the Region concurrency quota.
- **Why:** All functions in a Region share the quota (1,000 by default); a burst in a batch job throttles the customer-facing API, and per-function `Throttles` alarms fire only after users are already rejected.
- **Detect:** multiple `aws_lambda_function` / `sst.aws.Function` / `lambda.Function` in the same stack or account, or any `reserved_concurrent_executions` / `reservedConcurrentExecutions` / `provisioned_concurrent_executions`, with no alarm on `ClaimedAccountConcurrency` or `ConcurrentExecutions`.
- **Fix:** `metric_name = "ClaimedAccountConcurrency"`, `namespace = "AWS/Lambda"`, `statistic = "Maximum"`, `period = 60`, `evaluation_periods = 10`, `threshold = 0.9 * <quota>`. Hand off concurrency sizing to `aws-compute`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html
- **Last verified:** 2026-10-12

### OBS-015 — Alarm on the silence of scheduled and producer workloads
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Scheduled jobs and queue producers that must run have a "did it happen" alarm: `Invocations < 1` over the schedule window for crons, `NumberOfMessagesSent <= 0` for a producer's queue, both with `treat_missing_data = "breaching"`.
- **Why:** A disabled EventBridge rule, an expired credential in the producer or a deleted schedule produces no errors at all; the first signal is a customer asking where yesterday's report is.
- **Detect:** `aws_cloudwatch_event_rule` with `schedule_expression` / `aws_scheduler_schedule` / CDK `events.Rule({ schedule })` / SST `new sst.aws.Cron(` targeting a function that has no `Invocations` alarm with `LessThanThreshold`.
- **Fix:** See OBS-008 snippet; set `period` to the schedule interval (max 86400 for one datapoint, or evaluate several periods).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html
- **Last verified:** 2026-10-12

### OBS-054 — Make sure the alarm topic actually reaches someone
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every SNS topic used in `alarm_actions` has at least one subscription defined in IaC (email, chat, pager webhook, Lambda, SQS) or is documented as managed elsewhere; email and HTTP(S) subscriptions are confirmed after deploy.
- **Why:** CloudWatch publishes to the topic and the alarm history shows "Successfully executed action", but a topic with no subscribers (or only an unconfirmed email subscription) delivers to nobody, so the alarm stack looks complete and pages no one.
- **Detect:** Terraform `aws_sns_topic` referenced in `alarm_actions` with no `aws_sns_topic_subscription` whose `topic_arn` points at it anywhere in the stack; CDK `new sns.Topic(` passed to `SnsAction` with no `topic.addSubscription(` / `new sns.Subscription(`; SST `new sst.aws.SnsTopic(` used as `alarmActions` with no `.subscribe(` / `.subscribeQueue(` call and no `aws.sns.TopicSubscription`. Topics imported by ARN (`fromTopicArn`, `data "aws_sns_topic"`, a props/variable input) are owned elsewhere and are not a finding.
- **Fix:**
  ```ts
  // SST v3
  const alerts = new sst.aws.SnsTopic("Alerts");
  new aws.sns.TopicSubscription("AlertsOncall", { topic: alerts.arn, protocol: "email", endpoint: "oncall@example.com" });
  ```
  ```hcl
  resource "aws_sns_topic_subscription" "oncall" {
    topic_arn = aws_sns_topic.alerts.arn
    protocol  = "email"
    endpoint  = "oncall@example.com" # must be confirmed from the inbox
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Notify_Users_Alarm_Changes.html ; https://docs.aws.amazon.com/sns/latest/dg/sns-create-subscribe-endpoint-to-topic.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic_subscription ; https://sst.dev/docs/component/aws/sns-topic/
- **Last verified:** 2026-10-12

### OBS-055 — Alarm on 5xx and latency for every production API
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Each production REST API, HTTP API or ALB has an alarm on server errors (`5XXError` for REST, `5xx` for HTTP APIs, `HTTPCode_Target_5XX_Count` for ALB) and one on tail latency (`Latency` p90/p99, `TargetResponseTime` p99), wired to a notification action.
- **Why:** Function `Errors` alarms miss failures that never reach the function: integration timeouts, authorizer failures, permission errors on the integration, and a misrouted stage all show up only as API 5xx. AWS lists `5XXError` and p90 `Latency` among the recommended API Gateway alarms.
- **Detect:** `aws_api_gateway_rest_api` / `aws_apigatewayv2_api` / `aws_lb` (CDK `RestApi`, `LambdaRestApi`, `HttpApi`, `ApplicationLoadBalancer`; SST `sst.aws.ApiGatewayV1`, `sst.aws.ApiGatewayV2`, `sst.aws.Router`-fronted APIs) with no alarm in the stack whose `namespace` is `AWS/ApiGateway` / `AWS/ApplicationELB` and whose dimensions point at that API or load balancer. An alarm that exists but uses the wrong metric names is OBS-007, not this rule.
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_metric_alarm" "http_api_5xx" {
    alarm_name          = "orders-http-5xx"
    namespace           = "AWS/ApiGateway"
    metric_name         = "5xx"
    dimensions          = { ApiId = aws_apigatewayv2_api.http.id }
    statistic           = "Sum"
    period              = 60
    evaluation_periods  = 5
    datapoints_to_alarm = 3
    threshold           = 0
    comparison_operator = "GreaterThanThreshold"
    treat_missing_data  = "notBreaching"
    alarm_actions       = [aws_sns_topic.alerts.arn]
  }
  ```
  Add a `Latency` alarm with `extended_statistic = "p99"` (OBS-006). Hand off API configuration to `aws-networking`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html
- **Last verified:** 2026-10-12
