# Sources

Every official URL the aws-observability rules rely on, grouped by topic. All last verified
2026-10-12. If a link moves, search the title on the same domain and update the rule that
cites it.

## Pricing

- https://aws.amazon.com/cloudwatch/pricing/ — CloudWatch pricing: logs ingestion/storage/Insights, custom metrics tiers, API requests, alarms (standard, high-res, composite), dashboards, X-Ray traces, Application Signals. Last verified 2026-10-12.
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/us-east-1/index.json — AWS Price List API for CloudWatch in us-east-1; the machine-readable prices behind the pricing page (used to confirm the numbers quoted). Last verified 2026-10-12.

## Alarms

- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html — Recommended alarms per service (Lambda Errors/Throttles/Duration/ClaimedAccountConcurrency, SQS age/visible/sent, API Gateway). Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html — treat missing data options, default `missing`, DynamoDB default `ignore`. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/percentiles-with-low-samples.html — percentile alarms and the 10/(1−p) sample threshold. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm — `aws_cloudwatch_metric_alarm` arguments (`treat_missing_data`, `extended_statistic`, `metric_query`, `datapoints_to_alarm`). Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_composite_alarm — `aws_cloudwatch_composite_alarm`, `alarm_rule`, `actions_suppressor`. Last verified 2026-10-12.
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudwatch.Alarm.html — CDK `Alarm` props (`treatMissingData` default Missing, `evaluateLowSampleCountPercentile`). Last verified 2026-10-12.
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudwatch.CompositeAlarm.html — CDK `CompositeAlarm`, `AlarmRule.anyOf`, `actionsSuppressor`. Last verified 2026-10-12.
- https://repost.aws/knowledge-center/cloudwatch-configure-alarm-sns — CloudWatch alarm with an encrypted SNS topic needs a customer managed key granting cloudwatch.amazonaws.com. Last verified 2026-10-12.
- https://repost.aws/knowledge-center/cloudwatch-receive-sns-for-alarm-trigger — troubleshooting missing SNS notifications from alarms. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Notify_Users_Alarm_Changes.html — alarm notifications through SNS: create the topic, then subscribe to it and confirm. Last verified 2026-10-12.
- https://docs.aws.amazon.com/sns/latest/dg/sns-create-subscribe-endpoint-to-topic.html — email, HTTP(S) and cross-account subscriptions need confirmation before they receive messages. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic_subscription — `aws_sns_topic_subscription`. Last verified 2026-10-12.
- https://sst.dev/docs/component/aws/sns-topic/ — SST `SnsTopic`, `subscribe`, `subscribeQueue`, `transform`. Last verified 2026-10-12.

## Service metrics

- https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html — Lambda metrics: IteratorAge, OffsetLag, AsyncEventsDropped, DeadLetterErrors, DestinationDeliveryFailures, RecursiveInvocationsDropped. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-available-cloudwatch-metrics.html — SQS metrics; redrive-moved messages not counted in NumberOfMessagesSent; use ApproximateNumberOfMessagesVisible for DLQs. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/monitoring-using-cloudwatch.html — SQS metrics stop after 6 h of inactivity, up to 15 min delay on reactivation, SQS metrics are free. Last verified 2026-10-12.
- https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html — HTTP API metrics `4xx`, `5xx`, `Latency`, dimension `ApiId`. Last verified 2026-10-12.
- https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html — REST API metrics `4XXError`, `5XXError`, dimension `ApiName`. Last verified 2026-10-12.

## Logs

- https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html — Lambda logs to CloudWatch, default group `/aws/lambda/<name>`, required permissions. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-logformat.html — Configuring JSON and plain text log formats (default Text for all managed runtimes; JSON recommended). Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-loggroups.html — custom log groups, `aws/` prefix restriction, `logs:PutLogEvents` permission. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html — log-level filtering requires JSON, defaults (app INFO, system INFO), system event level mapping, `AWS_LAMBDA_LOG_LEVEL` / `AWS_LAMBDA_LOG_FORMAT` for custom runtimes. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html — Node.js console → JSON log records, EMF caveat when switching to JSON format, log groups not deleted with the function. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/golang-logging.html — Go Lambda logging basics. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html — reserved env vars include `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `_X_AMZN_TRACE_ID`. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html — Standard vs Infrequent Access vs Delivery class features (IA: no metric filters, subscription filters, EMF, Live Tail); class immutable. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cwl_intelligent_tier.html — CloudWatch Logs Intelligent Tiering (Standard → IA after 30 days → Archive Instant Access after 90). Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutStorageTierPolicy.html — API to enable Intelligent Tiering. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html — CloudWatch Logs data protection (audit and mask). Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogs-Field-Indexing.html — field indexes to reduce Logs Insights scanning. Last verified 2026-10-12.
- https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-execution-logging.html — REST API execution logging; data tracing not recommended for production. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group — `retention_in_days` (0 = never expire), `log_group_class` (STANDARD, INFREQUENT_ACCESS, DELIVERY). Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function — `logging_config` (`log_format`, `application_log_level`, `system_log_level`, `log_group`), `tracing_config`. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_settings — `data_trace_enabled`, `logging_level`. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_data_protection_policy — data protection policy resource. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_query_definition — saved Logs Insights queries. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_metric_filter — metric filters. Last verified 2026-10-12.
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.Function.html — CDK Lambda `loggingFormat`, `applicationLogLevelV2`, `systemLogLevelV2`, `logGroup`, deprecated `logRetention`/`logFormat`, `tracing`. Last verified 2026-10-12.
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_logs.LogGroup.html — CDK `LogGroup` defaults (retention TWO_YEARS, removal RETAIN, class STANDARD), `dataProtectionPolicy`. Last verified 2026-10-12.
- https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/cx-api/FEATURE_FLAGS.md — `@aws-cdk/aws-lambda:useCdkManagedLogGroup` (since 2.200.0). Last verified 2026-10-12.
- https://sst.dev/docs/component/aws/function/ — SST `logging` (`retention` default "1 month", `format` default "text", `logGroup`, `false`), `permissions`, `transform`, `nodejs.format` default esm. Last verified 2026-10-12.
- https://github.com/aws/aws-lambda-go/blob/main/lambdacontext/logger.go — `lambdacontext.NewLogger` / `NewLogHandler` slog handler (reads `AWS_LAMBDA_LOG_FORMAT`/`LEVEL`, injects requestId from ctx). Last verified 2026-10-12.
- https://github.com/aws/aws-lambda-go/releases — aws-lambda-go v1.52.0 added the structured logging helper; latest v1.55.1. Last verified 2026-10-12.
- https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/ — Powertools Logger: logEvent, correlation IDs, appendKeys/resetKeys, sampling, log buffering, ALC priority, error logging. Last verified 2026-10-12.
- https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html — HTTP API logging to CloudWatch Logs; AWS recommends logging all stages. Last verified 2026-10-12.
- https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging-variables.html — HTTP API access log variables (`$context.requestId`, `routeKey`, `status`, `responseLatency`, `integrationErrorMessage`). Last verified 2026-10-12.
- https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html — REST API execution vs access logging, configured independently; CloudWatch role. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage — `access_log_settings` (`destination_arn`, `format`). Last verified 2026-10-12.
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2.HttpStage.html — CDK `HttpStage` `accessLogSettings` (format must include the request ID). Last verified 2026-10-12.
- https://sst.dev/docs/component/aws/apigatewayv2/ — SST `ApiGatewayV2` access logs enabled by default, retention "1 month". Last verified 2026-10-12.

## Metrics

- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html — EMF spec: 100 metrics per event, 30 dimension keys, 100-value arrays, 1 MB, high-cardinality warning. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_PutMetricData.html — PutMetricData limits: 1,000 metrics per request, 150 values per metric, 30 dimensions, 1 MB. Last verified 2026-10-12.
- https://docs.aws.amazon.com/powertools/typescript/latest/features/metrics/ — Powertools Metrics: flushing, addMetadata for high cardinality, 29 dimensions, auto-flush at 100 metrics, cold start metric. Last verified 2026-10-12.
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_dashboard — dashboards in Terraform. Last verified 2026-10-12.

## Tracing

- https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html — X-Ray SDK/daemon maintenance (2026-02-25), migration to OpenTelemetry, Lambda layer options, propagation, sampling. Last verified 2026-10-12.
- https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-daemon-timeline.html — X-Ray SDK and daemon support timeline: maintenance mode from 2026-02-25, end date N/A. Last verified 2026-10-12.
- https://docs.aws.amazon.com/xray/latest/devguide/manual-instrumentation-go.html — Go OTel migration: `otelaws.AppendMiddlewares`, `otellambda.InstrumentHandler`, `xray.Propagator`, `otelhttp`. Last verified 2026-10-12.
- https://docs.aws.amazon.com/xray/latest/devguide/migrate-xray-to-opentelemetry-nodejs.html — Node.js OTel migration, AWSXRayPropagator, Lambda layers. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html — Lambda Active vs PassThrough, sampling 1 req/s + 5%, required X-Ray permissions. Last verified 2026-10-12.
- https://docs.aws.amazon.com/lambda/latest/dg/nodejs-tracing.html — Node.js Lambda tracing with ADOT or X-Ray/Powertools. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable-LambdaMain.html — AWS Lambda Layer for OpenTelemetry, `AWS_LAMBDA_EXEC_WRAPPER`, `CloudWatchLambdaApplicationSignalsExecutionRolePolicy`, sampling env vars. Last verified 2026-10-12.
- https://docs.aws.amazon.com/powertools/typescript/latest/features/tracer/ — Powertools Tracer: X-Ray SDK wrapper, captureResponse/captureError, captureAWSv3Client, ESM banner. Last verified 2026-10-12.
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html — `AWSTraceHeader` is the only message system attribute. Last verified 2026-10-12.
