# aws-observability — expected findings

Fixture: an order flow. `infra/main.tf` deploys the Go SQS worker (`worker/main.go`) and the
Node.js `orders-api` (`src/report.ts`) with alarms; `infra/checkout-stack.ts` (CDK) deploys
`src/checkout.ts`; `sst.config.ts` deploys a mailer function.

Run: *"run aws-observability on aws-review/evals/aws-observability"*.

## Planted issues (13)

| # | Evidence | Rule | Why it is a finding |
| --- | --- | --- | --- |
| 1 | `infra/main.tf:23` | OBS-010 | The alerts topic used by every alarm is encrypted with `alias/aws/sns`; CloudWatch cannot use that key, so every alarm action fails and nobody is paged. |
| 2 | `infra/main.tf:96` | OBS-017 | `orders-api` has no `aws_cloudwatch_log_group` and no `logging_config.log_group`; Lambda creates `/aws/lambda/orders-api` with no expiry, outside Terraform, surviving destroy. |
| 3 | `infra/main.tf:163` | OBS-002 | The DLQ alarm watches `NumberOfMessagesSent`, which does not count messages moved by the redrive policy; it never fires. Should be `ApproximateNumberOfMessagesVisible` (Maximum). |
| 4 | `infra/main.tf:206` (and `:207`) | OBS-007 | `aws_apigatewayv2_api` is an HTTP API: its metrics are `5xx` with dimension `ApiId`. `5XXError` / `ApiName` is the REST API metric, so the alarm watches nothing. |
| 5 | `infra/checkout-stack.ts:39` | OBS-050 | ESM bundle (`OutputFormat.ESM`) of a handler that imports `@aws-lambda-powertools/tracer`, with no `createRequire` banner: the function fails at init with a dynamic `require` error. |
| 6 | `src/checkout.ts:45` | OBS-024 | `logEvent: true` logs the whole API Gateway event (body with customer and items, headers) on every production invocation. |
| 7 | `src/checkout.ts:23` (with `:45`) | OBS-027 | `logger.appendKeys({ customerId })` at module-scoped logger, and `injectLambdaContext` lacks `resetKeys: true`: the previous customer's ID is stamped on the next request's logs. |
| 8 | `src/checkout.ts:35` | OBS-036 | `customerId` used as a metric dimension: one billable custom metric per customer (e.g. 50,000 customers ≈ $7,000/month). Belongs in `addMetadata`. |
| 9 | `src/report.ts:13` | OBS-023 | `process.env` logged on every invocation: includes `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` of the execution role. Critical. |
| 10 | `src/report.ts:31` | OBS-035 | Synchronous `PutMetricDataCommand` inside the API handler: extra latency and a per-call charge on every request; use EMF (Powertools Metrics). |
| 11 | `worker/main.go:43` | OBS-046 | `PutItem(context.TODO(), ...)` inside the handler drops the invocation context: no deadline/cancellation and an orphaned span; must pass `ctx`. |
| 12 | `sst.config.ts:19` | OBS-016 | `retention: "forever"` keeps the mailer's logs (and any PII in them) indefinitely. |
| 13 | `sst.config.ts:12` | OBS-054 | The `Alerts` SnsTopic receives both mailer alarms (`:33`) but nothing subscribes to it (no `.subscribe(`, no `aws.sns.TopicSubscription`): the alarms fire into a topic that notifies nobody. |

## Decoys (must NOT be flagged)

| Evidence | Looks like | Why it is correct |
| --- | --- | --- |
| `infra/main.tf:199` (alarm `orders_producer_silent`, `:192`) | OBS-008 / OBS-002 ("missing data should be notBreaching", "NumberOfMessagesSent is wrong") | This is a heartbeat on the *main* queue's producer: no messages sent in an hour is the failure, so `breaching` is the right missing-data treatment, and `NumberOfMessagesSent` is the right metric for a producer (the DLQ caveat does not apply). |
| `worker/main.go:60` | OBS-046 ("context.Background() instead of ctx") | `context.Background()` in `main()` to load the SDK config at init is correct: there is no request context yet. Request work in the handler is the only place that must use `ctx`. |

## Tolerated (do not count as false positives, do not count toward recall)

- OBS-045 on `src/checkout.ts:6` — Powertools Tracer wraps the X-Ray SDK, which is in maintenance mode; a migration note is acceptable.
- OBS-012 (low) — several alarms share `aws_sns_topic.alerts`; suggesting a composite alarm is acceptable.
- OBS-033/OBS-047 (medium/readability) on `src/report.ts` — no correlation ID in the orders API logs.
- OBS-055 (latency half) on `infra/main.tf:110` — the HTTP API has a (broken) 5xx alarm but no latency alarm.
- OBS-011 (suggestion) on `infra/main.tf:212` — `http_5xx` uses a raw count threshold of 5 instead of a rate.
- OBS-009 (low) — `fn_throttles` and the DLQ/age alarms have no `ok_actions`.
- OBS-047 on `worker/main.go` — the consumer never reads a correlation ID from the SQS message attributes.
- NEW / hand-off to `aws-messaging` on `infra/main.tf:90` — the event source mapping lacks `function_response_types = ["ReportBatchItemFailures"]`, so the `BatchItemFailures` the worker returns are ignored.
- NEW on `infra/main.tf:110` — the HTTP API has no stage, so no access logs (OBS-056 needs a stage resource to anchor on).
- Hand-off notes to other experts (e.g. `aws-security` for the KMS key, `aws-compute` for `orders-api` env vars).
