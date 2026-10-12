# Logs

Log groups (retention, ownership, class), Lambda advanced logging controls, structured JSON
logging in TypeScript (Powertools Logger, console) and Go (`log/slog`), what must never be
logged, and log query cost. Prices are us-east-1, verified 2026-10-12: ingestion Standard
$0.50/GB, Infrequent Access $0.25/GB; storage $0.03/GB-month; Logs Insights $0.005/GB scanned.
`aws-cost` owns the bill arithmetic; this file owns whether the logs are usable and safe.

### OBS-016 — Give every log group an explicit, finite retention
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every log group the stack creates or causes to exist has a retention matched to its purpose (e.g. 14–30 days for app logs, longer only for audit), never "never expire".
- **Why:** The default is to keep logs forever; 10 GB/day becomes 3.65 TB after a year ($109.50/month storage and growing). Long-lived logs also keep PII around longer than policy allows.
- **Detect:** Terraform `aws_cloudwatch_log_group` without `retention_in_days` or with `retention_in_days = 0`; CDK `new logs.LogGroup(` with `retention: logs.RetentionDays.INFINITE`, or `logRetention: logs.RetentionDays.INFINITE`; SST `logging: { retention: "forever" }`; ECS `awslogs-create-group = "true"` in `logConfiguration.options` (creates a never-expire group); API Gateway / Step Functions log destinations pointing at a group without retention.
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_log_group" "api_access" {
    name              = "/aws/apigateway/checkout-access"
    retention_in_days = 30
  }
  ```
  ```ts
  new sst.aws.Function("Api", { handler: "src/api.handler", logging: { retention: "1 month", format: "json" } });
  ```
  Note: CDK `logs.LogGroup` defaults to `RetentionDays.TWO_YEARS`, SST `logging.retention` defaults to `"1 month"`; those defaults are finite and are not a finding by themselves.
- **Volatile:** yes
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_logs.LogGroup.html ; https://sst.dev/docs/component/aws/function/ ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-017 — Own the Lambda log group in IaC
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Every Lambda function's log group is created by the IaC (Terraform `aws_cloudwatch_log_group` named `/aws/lambda/<function_name>` or passed via `logging_config.log_group`; CDK `logGroup:` prop or the `@aws-cdk/aws-lambda:useCdkManagedLogGroup` flag), not left to Lambda's first invocation.
- **Why:** The auto-created `/aws/lambda/<name>` group never expires, cannot be configured from CDK, is not tagged, and survives `terraform destroy` / stack deletion, so every ephemeral environment leaks a group forever.
- **Detect:** Terraform `aws_lambda_function` with no `aws_cloudwatch_log_group` whose `name` is `"/aws/lambda/${...function_name}"` (or equal literal) and no `logging_config { log_group = ... }`; the group exists but the function lacks `depends_on` to it (Lambda may create it first and the apply fails with `ResourceAlreadyExistsException`); CDK `new lambda.Function(` / `new NodejsFunction(` with neither `logGroup` nor `logRetention`, and `cdk.json` without `"@aws-cdk/aws-lambda:useCdkManagedLogGroup": true`. SST creates and manages the group by default (not a finding).
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_log_group" "fn" {
    name              = "/aws/lambda/${var.function_name}"
    retention_in_days = 30
  }
  resource "aws_lambda_function" "fn" {
    function_name = var.function_name
    # ...
    logging_config {
      log_format = "JSON"
      log_group  = aws_cloudwatch_log_group.fn.name
    }
  }
  ```
  ```ts
  const logGroup = new logs.LogGroup(this, "FnLogs", { retention: logs.RetentionDays.ONE_MONTH });
  new NodejsFunction(this, "Fn", { entry: "src/fn.ts", logGroup, loggingFormat: lambda.LoggingFormat.JSON });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-loggroups.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.Function.html ; https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/cx-api/FEATURE_FLAGS.md ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function
- **Last verified:** 2026-10-12

### OBS-018 — Replace deprecated CDK logRetention with logGroup
- **Severity:** low
- **Category:** simplicity
- **Applies to:** CDK
- **Rule:** New CDK code passes a `logs.LogGroup` through `logGroup:` instead of `logRetention:` (deprecated), and does not combine them.
- **Why:** `logRetention` deploys an extra custom-resource Lambda per stack to set retention after the fact, its group is not tagged or reachable by Aspects, and `logRetention` + `logGroup` together throws at synth. Migrating changes the group name, so dashboards/queries referencing the old name must be updated in the same change.
- **Detect:** `logRetention:` / `logRetentionRole:` / `logRemovalPolicy:` in `lambda.Function`, `NodejsFunction`, `GoFunction` props; `new logs.LogRetention(`.
- **Fix:** `logGroup: new logs.LogGroup(this, "FnLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY })` (choose `RETAIN` in production).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.Function.html
- **Last verified:** 2026-10-12

### OBS-019 — Make sure a custom Lambda log group can actually receive logs
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** A function sending logs to a custom log group has `logs:CreateLogStream` and `logs:PutLogEvents` on *that* group's ARN, and the group name does not start with `aws/`.
- **Why:** Execution roles scoped to `arn:aws:logs:*:*:log-group:/aws/lambda/<name>:*` lose all logs once `log_group` points elsewhere; a name beginning with `aws/` cannot be created by Lambda. Either way the function runs blind and nothing errors.
- **Detect:** Terraform `logging_config { log_group = "..." }` / CDK `logGroup:` / SST `logging: { logGroup: "..." }` where the execution role's policy (`aws_iam_role_policy`, `aws_iam_policy_document`) lists only `/aws/lambda/...` log ARNs and does not attach `AWSLambdaBasicExecutionRole`; any `log_group` value matching `^aws/`; SST `logging: false` on a production function (removes the permission entirely).
- **Fix:**
  ```hcl
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.shared.arn}:*"]
  }
  ```
  Hand off least-privilege review to `aws-security`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-loggroups.html ; https://sst.dev/docs/component/aws/function/
- **Last verified:** 2026-10-12

### OBS-020 — Emit structured JSON logs from Lambda
- **Severity:** medium
- **Category:** readability
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Production functions use JSON log format (`log_format = "JSON"`, `loggingFormat: LoggingFormat.JSON`, SST `logging.format: "json"`) or a logger that already writes JSON (Powertools Logger, `slog.NewJSONHandler`, `lambdacontext.NewLogger`).
- **Why:** Text lines can only be grepped; JSON fields (`level`, `requestId`, `orderId`, `durationMs`) are auto-discovered by Logs Insights, filterable by metric filters and required for Lambda log-level filtering. The default for every managed runtime is still Text.
- **Detect:** Terraform `aws_lambda_function` without `logging_config` or with `log_format = "Text"`; CDK functions without `loggingFormat` (deprecated `logFormat:` also counts); SST functions without `logging: { format: "json" }`; handler code using `console.log(\`...${x}...\`)` string interpolation for business events, Go `log.Printf` / `fmt.Println` in handlers.
- **Fix:**
  ```ts
  // CDK
  new NodejsFunction(this, "Fn", {
    entry: "src/fn.ts",
    loggingFormat: lambda.LoggingFormat.JSON,
    applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
    systemLogLevelV2: lambda.SystemLogLevel.INFO,
    logGroup,
  });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-logformat.html ; https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.Function.html
- **Last verified:** 2026-10-12

### OBS-021 — Pair log-level settings with JSON format, and honour them in custom runtimes
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, Go
- **Rule:** `application_log_level` / `system_log_level` are set only together with `log_format = "JSON"`; Go functions on `provided.al2023` read `AWS_LAMBDA_LOG_LEVEL` / `AWS_LAMBDA_LOG_FORMAT` (via `lambdacontext.NewLogger()` from aws-lambda-go ≥ v1.52.0, or their own slog setup) and emit a `level` key.
- **Why:** Lambda filters application logs by level only for JSON-formatted output; with Text format the WARN level the team configured does nothing and DEBUG lines are still ingested and billed. A Go binary writing plain `log.Printf` is always classified INFO, so ERROR lines can't be filtered or queried by level.
- **Detect:** `logging_config` with `log_format = "Text"` and `application_log_level` set; CDK `applicationLogLevelV2` / `systemLogLevelV2` without `loggingFormat: LoggingFormat.JSON`; Go `runtime = "provided.al2023"` / `lambda.Runtime.PROVIDED_AL2023` / SST `runtime: "go"` whose `main.go` logs with `log.` / `fmt.` and does not import `log/slog`.
- **Fix:**
  ```go
  import (
      "log/slog"
      "github.com/aws/aws-lambda-go/lambda"
      "github.com/aws/aws-lambda-go/lambdacontext"
  )

  func main() {
      slog.SetDefault(lambdacontext.NewLogger()) // reads AWS_LAMBDA_LOG_FORMAT / AWS_LAMBDA_LOG_LEVEL
      lambda.Start(handler)
  }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html ; https://github.com/aws/aws-lambda-go/blob/main/lambdacontext/logger.go ; https://github.com/aws/aws-lambda-go/releases
- **Last verified:** 2026-10-12

### OBS-022 — Know what system_log_level WARN removes
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set `system_log_level = "WARN"` only if nothing depends on the platform `START`/`REPORT` lines (Logs Insights queries on `@duration`, `@maxMemoryUsed`, `@initDuration`, cold-start dashboards, metric filters on `REPORT`).
- **Why:** At WARN, successful `start` and `report` events (INFO) are dropped, so memory-tuning and cold-start queries return nothing; only failures (`status!=success`) remain.
- **Detect:** `system_log_level = "WARN"` / `SystemLogLevel.WARN` together with `aws_cloudwatch_query_definition` / `aws_cloudwatch_log_metric_filter` / dashboard widgets referencing `@maxMemoryUsed`, `@duration`, `@initDuration` or `REPORT` on that function's log group.
- **Fix:** keep `system_log_level = "INFO"` for functions you tune or report on; use WARN for high-volume, well-understood functions only.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html
- **Last verified:** 2026-10-12

### OBS-023 — Never log credentials, secrets or the whole environment
- **Severity:** critical
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** Code never logs `process.env` / `os.Environ()`, `Authorization` / `Cookie` headers, tokens, passwords, API keys, secret values fetched from Secrets Manager or SSM, or full AWS SDK error/request objects that embed them.
- **Why:** The Lambda environment holds `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` of the execution role plus any secret passed as an env var; once in CloudWatch they are readable by everyone with `logs:GetLogEvents`/Logs Insights, copied to subscriptions and kept for the retention period.
- **Detect:** TS `console.log(process.env`, `JSON.stringify(process.env`, `logger.*(…process.env…)`, `logger.info(… headers …)`, `event.headers.authorization` / `Authorization` passed to a log call, logging the result of `GetSecretValueCommand` / `GetParameterCommand` (`SecretString`, `Parameter.Value`); Go `os.Environ()` in a log call, `log.Printf("%+v", req)` on an `events.APIGatewayProxyRequest`/`APIGatewayV2HTTPRequest` (contains headers), `slog.Any("secret", ...)`, logging `*secretsmanager.GetSecretValueOutput`.
- **Fix:** log an allow-list of fields: `logger.info("request", { path: event.rawPath, method: event.requestContext.http.method })`. In Go, implement `slog.LogValuer` on types holding secrets to redact them. Add a CloudWatch Logs data protection policy (OBS-031) as a safety net, not as the fix. Hand off secret handling to `aws-security`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html
- **Last verified:** 2026-10-12

### OBS-024 — Don't log full events or PII at INFO in production
- **Severity:** high
- **Category:** security
- **Applies to:** TypeScript, Go, Terraform, CDK, SST
- **Rule:** Full incoming events (API bodies, SQS/SNS messages, DynamoDB stream images) are not logged in production; Powertools `logEvent` / `POWERTOOLS_LOGGER_LOG_EVENT` are enabled only in non-production stages.
- **Why:** Events carry emails, addresses, payment and health data; logging them copies PII into a store with broad read access and long retention, and multiplies ingestion cost (a 5 KB event × 10 M invocations = 50 GB = $25/month at $0.50/GB, every month).
- **Detect:** `injectLambdaContext(logger, { logEvent: true })`, `@logger.injectLambdaContext({ logEvent: true })`, `logger.logEventIfEnabled(event)` with `POWERTOOLS_LOGGER_LOG_EVENT: "true"` in prod `environment` (Terraform `environment { variables = {...} }`, CDK `environment:`, SST `environment:`); `console.log(JSON.stringify(event))`, `logger.info("event", { event })`; Go `json.Marshal(event)` / `log.Printf("%+v", event)` in the handler.
- **Fix:**
  ```ts
  export const handler = middy(lambdaHandler)
    .use(injectLambdaContext(logger, { logEvent: process.env.STAGE !== "production" }));
  ```
  Log identifiers (`orderId`, `messageId`) instead of payloads.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/ ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-025 — Run production at INFO/WARN and get DEBUG on demand
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Production log level is INFO or WARN; DEBUG detail is obtained with Powertools `sampleRateValue` / `POWERTOOLS_LOGGER_SAMPLE_RATE`, log buffering (`logBufferOptions`, flushed on error), or a temporary level change, never a permanent `DEBUG`.
- **Why:** DEBUG commonly multiplies log volume 5–20×; at $0.50/GB a function writing 2 GB/day at INFO costs ~$30/month and ~$300–600/month at DEBUG, for logs nobody reads until an incident.
- **Detect:** `POWERTOOLS_LOG_LEVEL: "DEBUG"`, `LOG_LEVEL: "debug"`, `application_log_level = "DEBUG"|"TRACE"`, `ApplicationLogLevel.DEBUG|TRACE`, `new Logger({ logLevel: "DEBUG" })`, Go `slog.HandlerOptions{Level: slog.LevelDebug}` in a production stack/stage.
- **Fix:**
  ```ts
  const logger = new Logger({
    serviceName: "checkout",
    logLevel: "INFO",
    logBufferOptions: { enabled: true, flushOnErrorLog: true }, // DEBUG kept in memory, flushed on logger.error
  });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/ ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-026 — Log errors as error objects, not stringified
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Errors are passed to the logger as objects (`logger.error("charge failed", err)`, `console.error(err)`, `slog.Error("charge failed", "err", err)`), so name, message and stack are captured.
- **Why:** `JSON.stringify(err)` returns `"{}"` for an `Error` (its fields are non-enumerable), and `"" + err` drops the stack; the incident log then says `error: {}` with no cause.
- **Detect:** TS `JSON.stringify(err)` / `JSON.stringify(error)` / `JSON.stringify(e)` inside `catch`, `logger.*({ error: JSON.stringify(` , `console.log("error: " + err)`; Go `log.Println("failed")` that drops `err`, `slog.Error("...")` without the error attribute in an `if err != nil` block.
- **Fix:**
  ```ts
  } catch (err) {
    logger.error("charge failed", err as Error); // Powertools serializes name, message, stack
    throw err;
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/ ; https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html
- **Last verified:** 2026-10-12

### OBS-027 — Reset per-request logger keys between invocations
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript
- **Rule:** Keys added with Powertools `logger.appendKeys(...)` for one request (userId, tenantId, orderId) are cleared at the end of the invocation (`injectLambdaContext(logger, { resetKeys: true })` or `logger.resetKeys()` in `finally`); per-instance constants go in `persistentKeys`.
- **Why:** The logger lives at module scope and survives across invocations in the same execution environment, so request A's `tenantId` is stamped on request B's logs: wrong attribution during incidents, and cross-tenant data in logs.
- **Detect:** `logger.appendKeys(` inside the handler with no `resetKeys()` call and no `resetKeys: true` option on `injectLambdaContext` / `@logger.injectLambdaContext(`.
- **Fix:**
  ```ts
  export const handler = middy(lambdaHandler).use(injectLambdaContext(logger, { resetKeys: true }));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/
- **Last verified:** 2026-10-12

### OBS-028 — Pass the context to Go slog calls
- **Severity:** medium
- **Category:** readability
- **Applies to:** Go
- **Rule:** Go handlers log with the context-aware variants (`slog.InfoContext(ctx, ...)`, `logger.ErrorContext(ctx, ...)`) using a handler that enriches from `ctx` (`lambdacontext.NewLogHandler`, or an OTel-aware handler).
- **Why:** The Lambda slog handler adds `requestId` only from the record's context; `slog.Info(...)` without `ctx` produces lines that can't be tied to an invocation or trace.
- **Detect:** `slog.SetDefault(lambdacontext.NewLogger(` together with `slog.Info(` / `slog.Error(` / `logger.Info(` (non-`Context` variants) inside functions that receive `ctx context.Context`.
- **Fix:** `slog.InfoContext(ctx, "order stored", "orderId", id)`.
- **Volatile:** no
- **Source:** https://github.com/aws/aws-lambda-go/blob/main/lambdacontext/logger.go
- **Last verified:** 2026-10-12

### OBS-029 — Use Infrequent Access log class only for logs you never alarm or stream on
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** `INFREQUENT_ACCESS` (half the ingestion price) is for audit/forensic logs read ad hoc with Logs Insights; groups that feed metric filters, subscription filters, EMF metrics, Live Tail or Lambda Insights stay `STANDARD`. The class can't be changed after creation.
- **Why:** IA does not support metric filters, subscription filters, embedded metric format, Live Tail, anomaly detection or `GetLogEvents`/`FilterLogEvents`; moving an app log group to IA silently kills the error metric filter its alarm depends on and the EMF business metrics.
- **Detect:** `log_group_class = "INFREQUENT_ACCESS"` / `logGroupClass: logs.LogGroupClass.INFREQUENT_ACCESS` on a group that is the target of `aws_cloudwatch_log_metric_filter`, `aws_cloudwatch_log_subscription_filter`, `logGroup.addMetricFilter(`, `addSubscriptionFilter(`, or that is a Lambda's `log_group` whose code uses Powertools `Metrics` / EMF. Conversely, high-volume audit groups (CloudTrail-style, access logs kept for compliance) that are never queried live and use STANDARD are a cost candidate (hand off to `aws-cost`).
- **Fix:** keep the app group STANDARD; route archive-only logs to a separate IA group.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-030 — Keep API Gateway data tracing off in production
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Production REST API stages do not enable data trace (full request/response logging); execution logging stays at `ERROR` or `INFO`, and an access log with a JSON format carrying `$context.requestId` is used for per-request visibility.
- **Why:** Data trace writes full request and response bodies and headers (tokens, PII) to CloudWatch, and execution logs at INFO with data trace are very high volume. AWS recommends not enabling it for production APIs.
- **Detect:** Terraform `aws_api_gateway_method_settings` with `data_trace_enabled = true`; CDK `deployOptions: { dataTraceEnabled: true }` / `StageOptions`; SST `sst.aws.ApiGatewayV1` with `transform.stage` setting method settings `dataTraceEnabled: true`.
- **Fix:**
  ```hcl
  resource "aws_api_gateway_method_settings" "all" {
    rest_api_id = aws_api_gateway_rest_api.api.id
    stage_name  = aws_api_gateway_stage.prod.stage_name
    method_path = "*/*"
    settings {
      logging_level      = "ERROR"
      data_trace_enabled = false
      metrics_enabled    = true
    }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-execution-logging.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_settings
- **Last verified:** 2026-10-12

### OBS-031 — Add a data protection policy to log groups that may carry PII
- **Severity:** low
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Log groups of services that handle personal or payment data have a CloudWatch Logs data protection policy that audits and masks identifiers (emails, card numbers, AWS secret keys).
- **Why:** Code-level redaction (OBS-023/024) misses the one new log line; masking keeps the value out of query results for principals without `logs:Unmask`, and audit findings show the leak so it gets fixed.
- **Detect:** services whose code handles `email`, `cardNumber`, `ssn`, `password`, payment SDKs, with log groups lacking `aws_cloudwatch_log_data_protection_policy` / CDK `dataProtectionPolicy:`.
- **Fix:**
  ```ts
  new logs.LogGroup(this, "PaymentsLogs", {
    retention: logs.RetentionDays.ONE_MONTH,
    dataProtectionPolicy: new logs.DataProtectionPolicy({
      identifiers: [logs.DataIdentifier.EMAILADDRESS, logs.DataIdentifier.CREDITCARDNUMBER, logs.DataIdentifier.AWSSECRETKEY],
    }),
  });
  ```
  Data protection scanning is billed per GB for some classes; confirm on the pricing page before quoting.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_data_protection_policy ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-032 — Keep Logs Insights queries narrow when they run on a schedule
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Dashboards widgets, scheduled queries and code calling `StartQuery` target specific log groups and short time ranges, filter early, and use field indexes on hot fields; save shared queries as `aws_cloudwatch_query_definition` rather than copy-pasting them.
- **Why:** Logs Insights bills $0.005 per GB scanned per run: a query over 500 GB of logs run every 5 minutes by automation is 8,640 runs × 500 GB × $0.005 = $21,600/month.
- **Detect:** `StartQueryCommand` / `cloudwatchlogs.StartQueryInput` inside a loop, cron handler or per-request path; `logGroupNames` covering many/all groups or `logGroupIdentifiers` with prefixes; dashboard `LogQueryWidget` / `"type": "log"` widgets over many groups; `aws_cloudwatch_query_definition` absent while the same query string appears in several files.
- **Fix:** narrow `logGroupNames`, add `| filter level = "ERROR"` first, shrink the window, create a field index on the filtered field, or replace the scheduled query with a metric filter / EMF metric plus an alarm.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudwatch/pricing/ ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogs-Field-Indexing.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_query_definition
- **Last verified:** 2026-10-12

### OBS-033 — Put a correlation ID on every log line of a request
- **Severity:** low
- **Category:** readability
- **Applies to:** TypeScript, Go
- **Rule:** Handlers set a correlation ID once per invocation (Powertools `correlationIdPath` with `correlationPaths.API_GATEWAY_HTTP` / `API_GATEWAY_REST`, or `logger.setCorrelationId(...)`; Go `slog` attribute derived from the incoming header or message attribute) and pass it to downstream calls.
- **Why:** Without it, following one order through API → queue → worker means guessing by timestamps across several log groups; with it, one Logs Insights query returns the whole path.
- **Detect:** only in multi-hop flows (the handler calls SQS/SNS/EventBridge/another service, or is called by one): Powertools `new Logger(` without `correlationIdSearchFn` and no `setCorrelationId(` call; handlers reading `x-correlation-id` / `x-request-id` headers but not logging them; producers (`SendMessageCommand`, `PutEventsCommand`, `PublishCommand`, Go `SendMessageInput`) that don't forward an ID in `MessageAttributes` / `Detail`. A single function whose logs already carry the Lambda request ID (Lambda JSON format, `injectLambdaContext`, `lambdacontext.NewLogger`) is not a finding.
- **Fix:**
  ```ts
  import { Logger } from "@aws-lambda-powertools/logger";
  import { search, correlationPaths } from "@aws-lambda-powertools/logger/correlationId";
  const logger = new Logger({ serviceName: "checkout", correlationIdSearchFn: search });
  export const handler = middy(lambdaHandler)
    .use(injectLambdaContext(logger, { correlationIdPath: correlationPaths.API_GATEWAY_HTTP, resetKeys: true }));
  ```
  Propagation across services: see OBS-047.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/
- **Last verified:** 2026-10-12

### OBS-034 — Consider Logs Intelligent Tiering for long-retention log groups
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Accounts keeping large log groups for 90+ days enable CloudWatch Logs Intelligent Tiering (account/Region level, `PutStorageTierPolicy`) instead of exporting to S3 just to save storage.
- **Why:** Data not accessed for 30 days moves to a cheaper Infrequent Access tier and after 90 days to Archive Instant Access with the same query latency, so long retention stops costing the full Standard storage rate.
- **Detect:** `retention_in_days >= 180` / `RetentionDays.SIX_MONTHS` or longer / SST `retention: "1 year"`+ on many groups, or custom export-to-S3 code (`CreateExportTaskCommand`, Firehose subscriptions) whose only purpose is cheaper storage.
- **Fix:** enable Intelligent Tiering once per account/Region (console or `PutStorageTierPolicy`); keep S3 export only for consumers outside CloudWatch. Hand off the savings estimate to `aws-cost`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cwl_intelligent_tier.html ; https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutStorageTierPolicy.html
- **Last verified:** 2026-10-12

### OBS-056 — Turn on API Gateway access logs with a request ID
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every production API Gateway stage (REST, HTTP, WebSocket) writes access logs to a log group with explicit retention, in a JSON format that includes at least `$context.requestId`, `$context.status`, `$context.routeKey` (or resource path), `$context.integrationErrorMessage` / `$context.error.message` and latency.
- **Why:** A 5xx from a timed-out, unauthorized or misconfigured integration never reaches the function, so without access logs it leaves no record; with them one Logs Insights query ties a client's request ID to the failing route and to the function logs. AWS recommends logging all stages of an HTTP API, and for REST APIs access logging is configured independently of execution logging.
- **Detect:** Terraform `aws_apigatewayv2_stage` / `aws_api_gateway_stage` without an `access_log_settings` block; CDK `new apigwv2.HttpStage(` without `accessLogSettings` (and `HttpApi` relying on its auto-created default stage), `RestApi` / `deployOptions` without `accessLogDestination`; SST `sst.aws.ApiGatewayV1` / `ApiGatewayV2` are logged by default (1 month), so only `accessLog: { retention: "forever" }` is a finding (OBS-016).
- **Fix:**
  ```hcl
  resource "aws_apigatewayv2_stage" "default" {
    api_id      = aws_apigatewayv2_api.http.id
    name        = "$default"
    auto_deploy = true
    access_log_settings {
      destination_arn = aws_cloudwatch_log_group.api_access.arn
      format = jsonencode({
        requestId = "$context.requestId", routeKey = "$context.routeKey", status = "$context.status",
        latency = "$context.responseLatency", integrationError = "$context.integrationErrorMessage",
      })
    }
  }
  ```
  REST APIs also need the account-level CloudWatch role (`aws_api_gateway_account`); hand off API configuration to `aws-networking`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2.HttpStage.html ; https://sst.dev/docs/component/aws/apigatewayv2/
- **Last verified:** 2026-10-12
