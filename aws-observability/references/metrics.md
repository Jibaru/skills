# Metrics and dashboards

Custom metrics from TypeScript and Go: Embedded Metric Format (EMF) vs `PutMetricData`,
dimension cardinality, Powertools Metrics, dashboards. Prices are us-east-1, verified
2026-10-12: custom metrics $0.30/metric-month (first 10,000), $0.10 (next 240,000), $0.05
(next 750,000), $0.02 (over 1M); `PutMetricData` / `GetMetricData` $0.01 per 1,000 requests;
dashboards $3.00/month each (3 free); log ingestion $0.50/GB. A metric is billed per unique
combination of namespace + name + dimension values, prorated by the hour it receives data.

### OBS-035 — Emit Lambda custom metrics with EMF, not PutMetricData per invocation
- **Severity:** medium
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Lambda functions publish custom metrics as EMF log lines (Powertools `Metrics`, `aws-embedded-metrics`, or a hand-written `_aws` JSON object to stdout), not by calling `PutMetricData` inside the handler.
- **Why:** A synchronous `PutMetricData` adds a network round trip (tens of ms) to every invocation, can be throttled and fail the request, and is billed per call: 30 M invocations/month = (30,000,000 − 1,000,000 free) ÷ 1,000 × $0.01 = $290/month in API calls alone. EMF is extracted asynchronously from logs with no API call.
- **Detect:** TS `new CloudWatchClient(` + `PutMetricDataCommand` / `client.send(new PutMetricDataCommand(` reachable from a Lambda handler; Go `cloudwatch.NewFromConfig(` + `PutMetricData(ctx, ...)` inside the handler func passed to `lambda.Start`.
- **Fix:**
  ```ts
  import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
  import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
  const metrics = new Metrics({ namespace: "Shop", serviceName: "checkout" });
  const lambdaHandler = async () => { metrics.addMetric("OrderPlaced", MetricUnit.Count, 1); };
  export const handler = middy(lambdaHandler).use(logMetrics(metrics));
  ```
  ```go
  // Go: one EMF line on stdout; CloudWatch extracts the metric
  emf := map[string]any{
      "_aws": map[string]any{
          "Timestamp": time.Now().UnixMilli(),
          "CloudWatchMetrics": []any{map[string]any{
              "Namespace": "Shop", "Dimensions": [][]string{{"service"}},
              "Metrics": []any{map[string]any{"Name": "OrderPlaced", "Unit": "Count"}},
          }},
      },
      "service": "checkout", "OrderPlaced": 1, "orderId": orderID,
  }
  b, _ := json.Marshal(emf)
  fmt.Fprintln(os.Stdout, string(b))
  ```
  Outside Lambda (ECS/EC2 services), batch `PutMetricData` (OBS-040) or use the CloudWatch agent EMF endpoint.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html ; https://docs.aws.amazon.com/powertools/typescript/latest/features/metrics/ ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-036 — Keep high-cardinality values out of metric dimensions
- **Severity:** high
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Dimensions only take values from a small, bounded set (service, operation, stage, status class, region); user/tenant/order/request IDs, full URLs with path parameters, timestamps and error messages go in EMF metadata (`metrics.addMetadata`) or log fields, never in `addDimension` / `Dimensions`.
- **Why:** Every distinct dimension value creates a new billable metric. `addDimension("userId", id)` for 50,000 active users is 50,000 metrics: 10,000 × $0.30 + 40,000 × $0.10 = $7,000/month for one metric name, and dashboards/alarms can't aggregate it anyway.
- **Detect:** Powertools `metrics.addDimension(` / `addDimensions(` / `singleMetric().addDimension(` with values like `event.pathParameters`, `userId`, `tenantId`, `orderId`, `requestId`, `awsRequestId`, `context.awsRequestId`, `rawPath`, `err.message`, `Date`; `PutMetricDataCommand` with `Dimensions: [{ Name: ..., Value: <variable id> }]`; Go `types.Dimension{Name: aws.String("UserId"), Value: aws.String(userID)}`; hand-written EMF objects where a dimension key's value is an ID.
- **Fix:**
  ```ts
  metrics.addDimension("operation", "checkout"); // bounded
  metrics.addMetadata("orderId", order.id);      // searchable in logs, not a metric
  metrics.addMetric("OrderValue", MetricUnit.Count, order.total);
  ```
  Each extra dimension *set* (`addDimensions`) also multiplies the series; publish only the rollups you chart or alarm on. Hand off the bill estimate to `aws-cost`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html ; https://docs.aws.amazon.com/powertools/typescript/latest/features/metrics/ ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-037 — Flush Powertools metrics on every path
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript
- **Rule:** Code that calls `metrics.addMetric(...)` flushes through `logMetrics(metrics)` middleware, `@metrics.logMetrics()` decorator, a `using` binding (Node.js 24+), or `metrics.publishStoredMetrics()` in a `finally` block.
- **Why:** Powertools buffers metrics in memory and only writes the EMF blob on flush; a handler that adds metrics but never flushes (or flushes only on the success path) emits nothing, so the business-metric alarm never sees the failures it was built for.
- **Detect:** `new Metrics(` and `addMetric(` in a handler file with no `logMetrics(`, no `@metrics.logMetrics`, no `publishStoredMetrics(` and no `using metrics`; `publishStoredMetrics()` placed after code that can `throw`/`return` early instead of in `finally`.
- **Fix:**
  ```ts
  export const handler = async (event: SQSEvent) => {
    try {
      metrics.addMetric("MessagesProcessed", MetricUnit.Count, event.Records.length);
      await process(event);
    } finally {
      metrics.publishStoredMetrics();
    }
  };
  ```
  Add `throwOnEmptyMetrics: true` where a missing metric should fail loudly; `captureColdStartMetric: true` replaces hand-rolled cold-start flags.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/metrics/
- **Last verified:** 2026-10-12

### OBS-038 — Keep EMF working when switching Lambda to JSON log format
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Terraform, CDK, SST
- **Rule:** When a function's log format becomes JSON, EMF must be written straight to stdout (`process.stdout.write(JSON.stringify(emf) + "\n")`) or through an up-to-date Powertools / `aws-embedded-metrics` version; never via `console.log(JSON.stringify(emf))`.
- **Why:** With JSON format, Lambda wraps `console.log` output in its own JSON envelope, so CloudWatch no longer recognises the `_aws` block and every custom metric (and its alarm) stops silently.
- **Detect:** `console.log(JSON.stringify({ _aws:` or `console.log(` of an object containing `CloudWatchMetrics` in a function whose IaC sets `log_format = "JSON"` / `loggingFormat: LoggingFormat.JSON` / SST `logging: { format: "json" }`; old `@aws-lambda-powertools/metrics` or `aws-embedded-metrics` versions in `package.json` alongside JSON format.
- **Fix:**
  ```ts
  process.stdout.write(JSON.stringify({
    _aws: { Timestamp: Date.now(), CloudWatchMetrics: [{ Namespace: "Shop", Dimensions: [["service"]], Metrics: [{ Name: "OrderPlaced", Unit: "Count" }] }] },
    service: "checkout", OrderPlaced: 1,
  }) + "\n");
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html
- **Last verified:** 2026-10-12

### OBS-039 — Respect EMF limits so metrics are not dropped
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** One EMF log event holds at most 100 metric definitions, each DimensionSet at most 30 keys (Powertools allows 29 custom dimensions plus `service`), array values at most 100 entries, event size ≤ 1 MB.
- **Why:** If an event exceeds the 100-metric or 100-value limit, CloudWatch extracts *no* metrics from it; hand-rolled EMF that loops over items and appends one metric per item breaks once traffic grows.
- **Detect:** hand-written `CloudWatchMetrics[0].Metrics.push(` or Go slices of metric definitions built in a loop over records; `addMetric(` with a dynamic name (`` `latency_${route}` ``) inside loops; more than 29 `addDimension(` calls.
- **Fix:** use Powertools Metrics (auto-flushes at 100 metrics), keep metric names static, and aggregate per invocation (one `ItemsProcessed` count, not one metric per item).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html ; https://docs.aws.amazon.com/powertools/typescript/latest/features/metrics/
- **Last verified:** 2026-10-12

### OBS-040 — Batch PutMetricData in long-running services
- **Severity:** low
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Services on ECS/EC2 that call `PutMetricData` aggregate in memory and send batches (up to 1,000 metrics per request, `Values`/`Counts` arrays of up to 150 values) on a timer, instead of one call per event.
- **Why:** One call per event at 200 req/s is 518 M requests/month ≈ $5,170/month in API charges, plus throttling risk; a 60-second flush makes it 43,200 calls ≈ $0.
- **Detect:** `PutMetricDataCommand` / Go `PutMetricData(` inside an HTTP handler, consumer loop or per-message callback with a single `MetricData` entry; no buffering or ticker (`setInterval`, `time.NewTicker`).
- **Fix:**
  ```go
  // flush every 60 s
  ticker := time.NewTicker(60 * time.Second)
  for range ticker.C {
      batch := agg.Drain() // []types.MetricDatum with Values/Counts
      for len(batch) > 0 {
          n := min(len(batch), 1000)
          _, err := cw.PutMetricData(ctx, &cloudwatch.PutMetricDataInput{Namespace: aws.String("Shop"), MetricData: batch[:n]})
          if err != nil { slog.ErrorContext(ctx, "put metrics", "err", err) }
          batch = batch[n:]
      }
  }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_PutMetricData.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-041 — Don't re-publish metrics AWS already emits
- **Severity:** low
- **Category:** simplicity
- **Applies to:** TypeScript, Go
- **Rule:** Custom metrics measure business events and domain latency; invocation counts, errors, duration, throttles, queue depth and API 4xx/5xx come free from `AWS/Lambda`, `AWS/SQS`, `AWS/ApiGateway`.
- **Why:** Duplicates cost $0.30/metric-month each, drift from the source of truth, and add code to maintain.
- **Detect:** `addMetric("Invocations"|"Errors"|"Duration"|"Requests"`, custom `Latency` timers that wrap the whole handler, `PutMetricData` with `MetricName: "Errors"`.
- **Fix:** delete the custom metric and alarm on the AWS namespace metric (see OBS-001, OBS-006).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-042 — Build one dashboard per service, not one per resource
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Dashboards are defined in IaC, one per service or user journey, aggregating its functions with metric math / SEARCH; ephemeral stages (PR previews, dev) don't create dashboards.
- **Why:** Each dashboard beyond the 3 free costs $3.00/month; `for_each` over 40 functions × 5 stages = 200 dashboards = $591/month, and nobody opens per-function dashboards that Lambda's console already provides.
- **Detect:** `aws_cloudwatch_dashboard` with `for_each` / `count` over functions or tenants; CDK `new cloudwatch.Dashboard(` inside a loop or construct instantiated per function; dashboards created unconditionally in stacks deployed per PR/stage (`$app.stage`, `stage` context).
- **Fix:** one `aws_cloudwatch_dashboard` per service with widgets per signal (errors, p99, backlog); gate on `stage == "production"`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudwatch/pricing/ ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_dashboard
- **Last verified:** 2026-10-12

### OBS-043 — Turn log-based error counts into metrics with a metric filter or EMF
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK, TypeScript
- **Rule:** When an alarm needs "count of ERROR lines" or a business event already logged, create a metric filter on the (STANDARD class) log group or emit EMF from the code; don't run scheduled Logs Insights queries or a Lambda that greps logs and calls `PutMetricData`.
- **Why:** Glue Lambdas and scheduled queries cost per run, add failure modes and lag; a metric filter is free to define and the metric costs one custom metric.
- **Detect:** scheduled functions that call `StartQueryCommand` / `FilterLogEventsCommand` then `PutMetricDataCommand`; `aws_cloudwatch_event_rule` schedules targeting such functions.
- **Fix:**
  ```hcl
  resource "aws_cloudwatch_log_metric_filter" "errors" {
    name           = "checkout-error-lines"
    log_group_name = aws_cloudwatch_log_group.fn.name
    pattern        = "{ $.level = \"ERROR\" }"
    metric_transformation {
      name      = "ErrorLines"
      namespace = "Shop/Checkout"
      value     = "1"
      default_value = "0"
    }
  }
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_metric_filter ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html
- **Last verified:** 2026-10-12
