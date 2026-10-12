# Logging and metrics

Prices below are us-east-1 as verified on 2026-10-12. Confirm them live before quoting.
Reference prices: CloudWatch Logs ingestion Standard $0.50/GB, Infrequent Access $0.25/GB;
vended logs (Lambda, Flow Logs, etc.) tiered from $0.50/GB (0–10 TB) down to $0.05/GB (50 TB+);
log storage $0.03/GB-month; custom metrics $0.30/metric-month (first 10k), $0.10 (next 240k),
$0.05 (beyond); PutMetricData / GetMetricData $0.01 per 1,000 requests; standard alarm
$0.10/alarm-metric-month; CloudTrail additional management-event copies $2.00 per 100,000;
data events $0.10 per 100,000; Container Insights $0.30 per metric (standard), enhanced
observability for EKS $0.21 per million observations.

### COST-014 — Give every log group a retention
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every log group, including the ones Lambda, API Gateway and services create implicitly, has an explicit finite retention matched to its purpose.
- **Why:** Storage is $0.03/GB-month and "never expire" compounds: a service writing 10 GB/day holds 3.65 TB after a year, $109.50/month and climbing every month, for logs nobody reads.
- **Detect:** Terraform `aws_cloudwatch_log_group` without `retention_in_days` or with `retention_in_days = 0`; `aws_lambda_function` with no matching `aws_cloudwatch_log_group` named `/aws/lambda/<name>` (Lambda creates it with no expiry); CDK `new lambda.Function(` / `NodejsFunction` with neither `logGroup` nor `logRetention` (default `RetentionDays.INFINITE`); `logs.RetentionDays.INFINITE`; SST `logging: { retention: "forever" }`.
- **Fix:**
  ```ts
  // CDK
  const logGroup = new logs.LogGroup(this, "FnLogs", { retention: logs.RetentionDays.ONE_MONTH });
  new lambda.Function(this, "Fn", { /* ... */ logGroup });
  ```
  ```hcl
  resource "aws_cloudwatch_log_group" "fn" {
    name              = "/aws/lambda/${aws_lambda_function.fn.function_name}"
    retention_in_days = 30
  }
  ```
  Export to S3 (with its own lifecycle) what must be kept for years.
- **Volatile:** yes
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.Function.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### COST-015 — Filter Lambda logs by level with JSON format
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Production functions use the JSON log format with an application log level of INFO or WARN (and system level INFO/WARN), so DEBUG/TRACE output never reaches CloudWatch.
- **Why:** Ingestion is $0.50/GB. Level filtering only works with JSON format; with the default text format every `console.debug` line is ingested and billed.
- **Detect:** Terraform `aws_lambda_function` without `logging_config { log_format = "JSON" application_log_level = ... }`; CDK `loggingFormat` unset (default `LoggingFormat.TEXT`) or `applicationLogLevelV2: ApplicationLogLevel.DEBUG`/`TRACE` in prod; SST `logging: { format: "text" }` (default); env `LOG_LEVEL=debug` / `POWERTOOLS_LOG_LEVEL=DEBUG` in prod stage.
- **Fix:**
  ```ts
  new lambda.Function(this, "Fn", {
    loggingFormat: lambda.LoggingFormat.JSON,
    applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
    systemLogLevelV2: lambda.SystemLogLevel.WARN,
  });
  ```
  SST: `logging: { format: "json" }` plus a log level from stage config.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html ; https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-logformat.html
- **Last verified:** 2026-10-12

### COST-016 — Do not log whole events, bodies or SDK responses per request
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Request handlers log identifiers and decisions, not the full incoming event, request/response body or SDK response, at INFO level.
- **Why:** A 20 KB event logged on 50M invocations/month is ~1 TB: ~$500/month ingestion plus storage, and it leaks PII (hand off to `aws-security`).
- **Detect:** TS `console.log(JSON.stringify(event))`, `console.log(event)`, `logger.info("event", { event })`, `logger.info(response)` at handler top; Powertools `logEvent: true` / `POWERTOOLS_LOGGER_LOG_EVENT=true` in prod; Go `log.Printf("%+v", event)`, `slog.Info("event", "event", event)`.
- **Fix:** Log `requestId`, keys and outcome; keep full-event logging behind DEBUG (filtered by COST-015) or a sampled rate (Powertools `sampleRateValue`).
- **Volatile:** no
- **Source:** https://aws.amazon.com/cloudwatch/pricing/ ; https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html
- **Last verified:** 2026-10-12

### COST-017 — Use the Infrequent Access log class for logs you only query after the fact
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Audit, forensic and bulk debug log groups that need no metric filters, subscription filters, Live Tail, anomaly detection, EMF, `GetLogEvents`/`FilterLogEvents` reads, or Container/Lambda Insights ingestion use `INFREQUENT_ACCESS`.
- **Why:** Ingestion drops from $0.50 to $0.25/GB: 2 TB/month saves $512/month. The class cannot be changed after creation, so it must be chosen in the IaC.
- **Detect:** Terraform `aws_cloudwatch_log_group` without `log_group_class` for high-volume groups with no `aws_cloudwatch_log_metric_filter` / `aws_cloudwatch_log_subscription_filter` attached; CDK `new logs.LogGroup(` without `logGroupClass`.
- **Fix:** `log_group_class = "INFREQUENT_ACCESS"` / `logGroupClass: logs.LogGroupClass.INFREQUENT_ACCESS`. Do not use it where alarms depend on metric filters or EMF.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### COST-018 — Send high-volume Lambda logs to S3 or Firehose when you only archive them
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Functions producing very large log volumes that are only archived or analysed in a lake deliver through the `DELIVERY` log class to S3/Firehose instead of Standard CloudWatch Logs.
- **Why:** Delivery-class log groups keep events for a fixed 2 days (Terraform forces `retention_in_days` to 2) and forward them to S3/Firehose at vended-log delivery rates, avoiding Standard ingestion plus months of CloudWatch storage on terabytes of logs. They cannot be queried with Logs Insights.
- **Detect:** Lambda functions with heavy logging (`console.log` in loops, batch processors) whose log groups are Standard with long retention and no metric filters.
- **Fix:** Create the log group with `log_group_class = "DELIVERY"` / `logs.LogGroupClass.DELIVERY`, point the function's log group at it, and add a subscription filter whose destination is the S3 bucket or Firehose stream; keep alarm-relevant logs in a Standard group. Read the vended-log delivery rate on the CloudWatch pricing page before quoting a saving.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/logging-with-s3.html ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html
- **Last verified:** 2026-10-12

### COST-019 — Keep custom metric dimensions low-cardinality
- **Severity:** high
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Custom metrics and EMF never use unbounded values (request ID, user ID, order ID, URL path with IDs, timestamp) as dimensions.
- **Why:** Every unique dimension combination is a separate billed metric at $0.30/month. A `UserId` dimension with 50,000 active users creates 50,000 metrics: 10,000 × $0.30 + 40,000 × $0.10 = $7,000/month, growing with the user base.
- **Detect:** TS `new PutMetricDataCommand({ MetricData: [{ Dimensions: [{ Name: "UserId", Value: ... }] }] })`; Powertools `metrics.addDimension("userId", ...)`, `addDimension("requestId", ...)`; EMF JSON `"Dimensions": [["RequestId"]]`; Go `types.Dimension{Name: aws.String("CustomerId"), Value: ...}` in `cloudwatch.PutMetricDataInput`.
- **Fix:** Use bounded dimensions (service, operation, status class, tenant tier). Put high-cardinality values in log fields (`metrics.addMetadata("userId", id)` in Powertools) and query them with Logs Insights.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### COST-020 — Do not call PutMetricData synchronously per request
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Request paths emit metrics through EMF (log lines) or batched PutMetricData, never one API call per request.
- **Why:** PutMetricData costs $0.01 per 1,000 calls beyond the free tier and adds a network round trip to each request: 100M requests/month ≈ $1,000/month in API calls alone, plus latency.
- **Detect:** `await cw.send(new PutMetricDataCommand(` inside a Lambda handler or HTTP route; Go `client.PutMetricData(ctx, ...)` inside a per-message loop.
- **Fix:** Powertools `Metrics` with `logMetrics` / `publishStoredMetrics()` (EMF, no API call); or aggregate in memory and send up to the per-call metric limit in one request.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudwatch/pricing/ ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html
- **Last verified:** 2026-10-12

### COST-021 — Send VPC Flow Logs to S3 unless you alarm on them
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Flow logs kept for audit or occasional analysis go to S3 (with lifecycle) or are filtered to `REJECT`; CloudWatch is for flows you actively alarm on.
- **Why:** `traffic_type = "ALL"` on a busy VPC is many GB/day; in CloudWatch Logs it pays ingestion plus storage (often with no retention, see COST-014).
- **Detect:** `aws_flow_log` with `traffic_type = "ALL"` and `log_destination_type` unset or `"cloud-watch-logs"`; CDK `vpc.addFlowLog(` / `new ec2.FlowLog(` with `FlowLogDestination.toCloudWatchLogs()`.
- **Fix:** `log_destination_type = "s3"` with a bucket lifecycle; or `traffic_type = "REJECT"` if only denies matter.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-cw.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### COST-022 — Keep one trail for management events
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Management events are captured once (usually an organization trail); extra trails do not re-record them.
- **Why:** The first copy of management events is free; each additional copy costs $2.00 per 100,000 events. A busy account with 50M management events/month pays $1,000/month per duplicate trail.
- **Detect:** More than one `aws_cloudtrail` (or `cloudtrail.Trail`) with management events enabled in the same account/Region, or a per-account trail alongside an organization trail (`is_organization_trail = true` elsewhere).
- **Fix:** Keep the organization trail; set `include_management_events = false` (in `event_selector`) on secondary trails used for data events.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudtrail/pricing/
- **Last verified:** 2026-10-12

### COST-023 — Scope CloudTrail data events
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Data events (S3 object-level, Lambda invoke, DynamoDB) are enabled for named resources with advanced selectors, not for every bucket/function.
- **Why:** Data events cost $0.10 per 100,000; logging all S3 objects on a bucket serving 1B GETs/month is $1,000/month.
- **Detect:** `aws_cloudtrail` `event_selector { data_resource { type = "AWS::S3::Object" values = ["arn:aws:s3"] } }` (all buckets) or `advanced_event_selector` with only `eventCategory = Data`; CDK `trail.logAllS3DataEvents()`, `logAllLambdaDataEvents()`.
- **Fix:** Restrict to sensitive buckets and to write events (`readOnly = false`) when reads are not needed.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudtrail/pricing/ ; https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html
- **Last verified:** 2026-10-12

### COST-024 — Turn on Container Insights and Lambda Insights deliberately
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Container Insights / Lambda Insights are enabled where someone uses the dashboards, not account-wide by default in every stage.
- **Why:** Container Insights bills $0.30 per metric (it reports dozens of metrics per cluster, service, task and container; enhanced observability on EKS bills $0.21 per million observations) plus the performance-log ingestion at Standard rates; on large fleets that is a visible line item in dev stacks nobody watches.
- **Detect:** `aws_ecs_cluster` `setting { name = "containerInsights" value = "enabled" | "enhanced" }` in non-prod; CDK `containerInsightsV2: ecs.ContainerInsights.ENHANCED`; Lambda layer `LambdaInsightsExtension` / `insightsVersion` on every function.
- **Fix:** Enable per stage from config; prod only unless a team uses it.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### COST-025 — Keep API Gateway execution logging off INFO with full data in production
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** REST API stages log access logs (one line per request); execution logging stays at ERROR and `dataTraceEnabled` stays false in production.
- **Why:** INFO execution logs with data trace write many lines plus full request/response bodies per call into CloudWatch at $0.50/GB, and expose payloads (hand off to `aws-security`).
- **Detect:** Terraform `aws_api_gateway_method_settings` `settings { logging_level = "INFO" data_trace_enabled = true }`; CDK `deployOptions: { loggingLevel: apigw.MethodLoggingLevel.INFO, dataTraceEnabled: true }`.
- **Fix:** `logging_level = "ERROR"`, `data_trace_enabled = false`, plus an access log format with the fields you need.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_settings
- **Last verified:** 2026-10-12
