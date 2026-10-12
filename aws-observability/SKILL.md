---
name: aws-observability
description: Review AWS code, IaC and diffs (Terraform, CDK, SST, TypeScript and Go SDK code) for observability gaps — missing or wrong CloudWatch alarms (errors, throttles, DLQ depth, iterator age, p99 latency, 5xx, missing-data handling, SNS actions), log groups without retention, unstructured or leaky logs (secrets, PII, full events), Lambda log format and levels, EMF vs PutMetricData and metric cardinality, X-Ray vs OpenTelemetry tracing, correlation IDs and context propagation. Use when the user asks "review my alarms", "will we notice if this Lambda fails", "are my logs OK", "is this DynamoDB table monitored", "why is my CloudWatch bill high", "revisa el monitoreo", "review my Lambda", or when aws-review dispatches it.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-observability

Observability reviewer for the AWS review kit. It reads files, diffs and `terraform plan` /
`cdk diff` / `sst diff` output and reports where a failure would go unnoticed, where logs are
unusable or leak data, and where telemetry costs more than it tells. It reviews statically:
it never calls an AWS account, and it only reports. Fixes are applied only if the user asks
afterwards.

## Scope

Covers: CloudWatch alarms and their actions, composite alarms, missing-data treatment; log
groups (retention, ownership, class, data protection); Lambda advanced logging controls;
structured logging with Powertools for AWS Lambda (TypeScript) and Go `log/slog`; what must
never be logged; log levels; Logs Insights cost; custom metrics (EMF, `PutMetricData`,
cardinality, Powertools Metrics); dashboards; tracing (X-Ray, OpenTelemetry/ADOT, Application
Signals, Powertools Tracer); correlation IDs and context propagation in TypeScript and Go.

Hand off what is not about observing the system, in one line per finding:

- Lambda/ECS timeouts, memory, concurrency, retries, client reuse → `aws-compute`
- Table and query design → `aws-data`
- S3/CloudFront behaviour → `aws-storage`
- Redrive policies, visibility timeouts, event contracts → `aws-messaging`
- API Gateway, VPC, load balancer configuration → `aws-networking`
- Tool idioms, state, module layout → `aws-iac`
- IAM least privilege, KMS design, secret storage → `aws-security`
- The bill estimate for log/metric volume → `aws-cost` (this skill flags the waste; cost does the totals)

## Signals

This expert applies whenever compute or messaging is in scope, and whenever any of these appear:

- Files: `**/*.tf`, `**/*.tfvars`, `**/*.tfplan.json`, `cdk.json`, `bin/*.ts`, `lib/**/*.ts`,
  `sst.config.ts`, `infra/**/*.ts`, handler code `**/*.ts`, `**/*.go`, `cdk diff` / `sst diff`
  / `terraform plan` output.
- Alarms and dashboards: `aws_cloudwatch_metric_alarm`, `aws_cloudwatch_composite_alarm`,
  `aws_cloudwatch_dashboard`, `cloudwatch.Alarm`, `createAlarm(`, `CompositeAlarm`,
  `cloudwatch.Dashboard`, `aws.cloudwatch.MetricAlarm`, `SnsAction`, `alarm_actions`,
  `treat_missing_data`, `treatMissingData`, `aws_sns_topic_subscription`, `addSubscription(`,
  `sst.aws.SnsTopic` + `.subscribe(`.
- Logs: `aws_cloudwatch_log_group`, `retention_in_days`, `log_group_class`, `logging_config`,
  `aws_cloudwatch_log_metric_filter`, `aws_cloudwatch_log_subscription_filter`,
  `aws_cloudwatch_log_data_protection_policy`, `aws_cloudwatch_query_definition`,
  `logs.LogGroup`, `logRetention`, `logGroup:`, `loggingFormat`, `applicationLogLevelV2`,
  `systemLogLevelV2`, SST `logging:`, `aws_api_gateway_method_settings`, `data_trace_enabled`,
  `dataTraceEnabled`, `awslogs-create-group`, `aws_apigatewayv2_stage`, `aws_api_gateway_stage`,
  `access_log_settings`, `accessLogSettings`, `accessLogDestination`, `HttpStage`.
- Compute and messaging that should be watched: `aws_lambda_function`, `lambda.Function`,
  `NodejsFunction`, `GoFunction`, `sst.aws.Function`, `sst.aws.Cron`, `aws_lambda_event_source_mapping`,
  `aws_sqs_queue`, `redrive_policy`, `deadLetterQueue`, `sst.aws.Queue`, `aws_kinesis_stream`,
  `stream_enabled`, `aws_apigatewayv2_api`, `aws_api_gateway_rest_api`, `HttpApi`, `RestApi`,
  `sst.aws.ApiGatewayV2`, `aws_sns_topic`, `tracing_config`, `tracing: lambda.Tracing`.
- TypeScript: `@aws-lambda-powertools/logger`, `@aws-lambda-powertools/metrics`,
  `@aws-lambda-powertools/tracer`, `aws-xray-sdk-core`, `@opentelemetry/`, `aws-embedded-metrics`,
  `@aws-sdk/client-cloudwatch` (`PutMetricDataCommand`), `@aws-sdk/client-cloudwatch-logs`
  (`StartQueryCommand`), `console.log(`, `process.env` in log calls, `JSON.stringify(event)`.
- Go: `log/slog`, `github.com/aws/aws-lambda-go/lambdacontext`, `github.com/aws/aws-xray-sdk-go`,
  `go.opentelemetry.io/`, `github.com/aws/aws-sdk-go-v2/service/cloudwatch`,
  `github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs`, `context.Background()` / `context.TODO()`
  inside handlers, `log.Printf(`, `os.Environ()`.

## Procedure

1. **Collect the inputs.** Use the files you were given; otherwise find them with the Signals.
   When reviewing a change, start from the diff, then read what it wires into: the IaC that
   deploys a changed handler, the handler behind a changed function, the alarms and log groups
   that reference it. Done when, for each function, queue, stream and API in scope, you know
   its log group, its log format/level, its alarms and their actions, and its tracing mode.
2. **Open only the references that match.** Use the index below; skip topics with nothing in
   scope.
3. **Apply the rules.** Check every rule of each opened reference against the inputs. Absence
   is evidence here: a production function with no alarm is a finding, anchored on the line
   that declares the function. Also look for problems no rule names and mark them `NEW`.
4. **Verify every finding** against the actual code before reporting: trace the alarm to the
   metric and dimension it really watches, the log call to the value it really prints, the
   `ctx` to the call it really reaches. Search the whole stack for the alarm or log group
   before claiming it is missing. Drop anything you cannot point at; no speculation.
5. **Staleness.** Every rule carries `Last verified`. If a rule you used was last verified more
   than 120 days before today, add "reference is stale, run /aws-refresh" to the report, and
   for `Volatile: yes` rules confirm the fact live before quoting numbers: the AWS Knowledge or
   AWS Documentation MCP if connected, otherwise WebFetch the rule's Source URL.

Cost findings show their arithmetic with the unit price, its region and a link to
https://aws.amazon.com/cloudwatch/pricing/ (e.g. "custom metrics $0.30/metric-month for the
first 10,000, us-east-1"). When volume is unknown, state the assumption and the formula.

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
| [alarms.md](references/alarms.md) | Lambda Errors/Throttles, DLQ depth, queue age, IteratorAge/OffsetLag, async drops, p99 latency, HTTP vs REST API metric names, missing data, alarm actions, encrypted SNS topics, error rate and M-of-N, composite alarms, high-resolution cost, account concurrency, heartbeat alarms, alarm topics without subscribers, missing API 5xx/latency alarms (OBS-001–015, OBS-054–055) |
| [logs.md](references/logs.md) | Retention, owning the Lambda log group, CDK `logRetention` → `logGroup`, custom log group permissions, JSON format and level filtering, system log level, secrets and PII in logs, debug in production, error serialization, Powertools key leaks, Go slog context, Infrequent Access class, API Gateway data trace, data protection, Logs Insights cost, correlation IDs, Intelligent Tiering, API Gateway access logs (OBS-016–034, OBS-056) |
| [metrics.md](references/metrics.md) | EMF vs PutMetricData, metric cardinality, Powertools Metrics flushing, EMF under JSON log format, EMF limits, batching, duplicate AWS metrics, dashboards, metric filters (OBS-035–043) |
| [tracing.md](references/tracing.md) | Active tracing and permissions, X-Ray SDK maintenance → OpenTelemetry, Go `ctx` propagation, async correlation, Powertools Tracer captureResponse, SDK client instrumentation, ESM shim, OTel layer wiring, sampling, annotations (OBS-044–053) |
| [sources.md](references/sources.md) | Every official URL used, grouped by topic, with Last verified dates |
