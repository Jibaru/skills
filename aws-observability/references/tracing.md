# Tracing and context propagation

X-Ray and OpenTelemetry (ADOT, AWS Lambda Layer for OpenTelemetry, Application Signals),
Powertools Tracer, and carrying trace context and correlation IDs through TypeScript and Go
code. Status verified 2026-10-12: the X-Ray SDKs and daemon have been in maintenance mode since
2026-02-25 (security fixes only, no new features); the support timeline page shows no end
date for that phase. AWS recommends OpenTelemetry-based instrumentation for new and existing
applications. X-Ray traces recorded
cost $5.00 per million (first 100,000/month free).

### OBS-044 — Turn on Active tracing for entry-point functions, with permissions
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Functions that start a request (API, schedule, S3/EventBridge triggers) and that are instrumented use `tracing_config { mode = "Active" }` and their role has `xray:PutTraceSegments` and `xray:PutTelemetryRecords`.
- **Why:** Without Active tracing Lambda runs in PassThrough: if no upstream header arrives it generates one with the decision *not to sample*, so instrumented code sends nothing. In Terraform, Active without the permissions (`AWSXRayDaemonWriteAccess`) drops every segment silently.
- **Detect:** Terraform `aws_lambda_function` with `tracing_config { mode = "Active" }` whose role has no `aws_iam_role_policy_attachment` of `AWSXRayDaemonWriteAccess` and no `xray:PutTraceSegments` statement; functions whose code imports `@aws-lambda-powertools/tracer`, `aws-xray-sdk-core` or `@opentelemetry/*` but whose IaC lacks `tracing_config` / CDK `tracing: lambda.Tracing.ACTIVE` / SST `transform.function` setting `tracingConfig`. CDK adds the permissions automatically when `tracing` is set.
- **Fix:**
  ```hcl
  tracing_config { mode = "Active" }
  resource "aws_iam_role_policy_attachment" "xray" {
    role       = aws_iam_role.fn.name
    policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
  }
  ```
  ```ts
  // SST v3: no tracing arg; set it on the underlying function and grant the permissions
  new sst.aws.Function("Api", {
    handler: "src/api.handler",
    permissions: [{ actions: ["xray:PutTraceSegments", "xray:PutTelemetryRecords"], resources: ["*"] }],
    transform: { function: (args) => { args.tracingConfig = { mode: "Active" }; } },
  });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function ; https://sst.dev/docs/component/aws/function/
- **Last verified:** 2026-10-12

### OBS-045 — Instrument new code with OpenTelemetry, not the X-Ray SDK
- **Severity:** low
- **Category:** reliability
- **Applies to:** TypeScript, Go, Terraform, CDK, SST
- **Rule:** New tracing instrumentation uses OpenTelemetry: on Lambda the AWS Lambda Layer for OpenTelemetry (recommended) or the ADOT layer, elsewhere the OTel SDK/ADOT with the CloudWatch agent or an OTel Collector; existing X-Ray SDK code (including Powertools Tracer, a thin wrapper over the X-Ray SDK for Node.js) gets a migration ticket.
- **Why:** The X-Ray SDKs and daemon are in maintenance mode since 2026-02-25 (security fixes only); new features (Application Signals, Transaction Search, OTel auto-instrumentation) land only on OTel. Traces still appear in the same X-Ray/CloudWatch console after migrating.
- **Detect:** (report once per codebase, as a migration note, not per file) new imports of `aws-xray-sdk-core`, `aws-xray-sdk`, `AWSXRay.captureAWSv3Client`, `@aws-lambda-powertools/tracer`; Go `github.com/aws/aws-xray-sdk-go` (`xray.Configure`, `xray.AWSv2Instrumentor`, `xray.Capture`); X-Ray daemon sidecars (`amazon/aws-xray-daemon` image) in ECS task definitions.
- **Fix:**
  ```ts
  // CDK: AWS Lambda Layer for OpenTelemetry (ARN per Region from the docs)
  fn.addLayers(lambda.LayerVersion.fromLayerVersionArn(this, "Otel", otelLayerArn));
  fn.addEnvironment("AWS_LAMBDA_EXEC_WRAPPER", "/opt/otel-instrument");
  fn.addEnvironment("OTEL_AWS_APPLICATION_SIGNALS_ENABLED", "false"); // tracing only; omit to enable Application Signals
  ```
  Go: `otellambda.InstrumentHandler(handler, xrayconfig.WithRecommendedOptions(tp)...)` + `otelaws.AppendMiddlewares(&cfg.APIOptions)`. Replace the X-Ray daemon with the CloudWatch agent or OTel Collector.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html ; https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-daemon-timeline.html ; https://docs.aws.amazon.com/xray/latest/devguide/manual-instrumentation-go.html ; https://docs.aws.amazon.com/xray/latest/devguide/migrate-xray-to-opentelemetry-nodejs.html
- **Last verified:** 2026-10-12

### OBS-046 — Pass the request context to every downstream call in Go
- **Severity:** high
- **Category:** bug
- **Applies to:** Go
- **Rule:** Go handlers pass the `ctx` they received to every aws-sdk-go-v2 call, HTTP request (`http.NewRequestWithContext(ctx, ...)`), database call and goroutine they start; `context.Background()` / `context.TODO()` appear only in `main`/init.
- **Why:** The trace span, the Lambda deadline and cancellation all live in `ctx`. `client.PutItem(context.TODO(), ...)` produces orphan spans (the trace stops at the handler), and the call keeps running after the Lambda deadline instead of being cancelled, causing timeouts that look random.
- **Detect:** inside a function with a `ctx context.Context` parameter: `context.Background()` or `context.TODO()` passed to SDK methods (`.GetItem(`, `.PutItem(`, `.SendMessage(`, `.PutObject(`, `.Query(`), `http.NewRequest(` (without `WithContext`), `http.Get(`; `go func() { ... }()` using a fresh background context for request work.
- **Fix:**
  ```go
  func handler(ctx context.Context, e events.SQSEvent) error {
      for _, r := range e.Records {
          if _, err := ddb.PutItem(ctx, &dynamodb.PutItemInput{ /* ... */ }); err != nil {
              return fmt.Errorf("put %s: %w", r.MessageId, err)
          }
      }
      return nil
  }
  ```
  Instrument the SDK once at init: `otelaws.AppendMiddlewares(&cfg.APIOptions)`; HTTP clients with `otelhttp.NewTransport(http.DefaultTransport)`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/xray/latest/devguide/manual-instrumentation-go.html
- **Last verified:** 2026-10-12

### OBS-047 — Carry trace and correlation IDs across async hops
- **Severity:** medium
- **Category:** readability
- **Applies to:** TypeScript, Go
- **Rule:** Producers put the correlation ID (and, when not handled by instrumentation, the trace context) into the message envelope (SQS `MessageAttributes`, SNS `MessageAttributes`, EventBridge `Detail`), and consumers read it back into their logger before processing.
- **Why:** Trace context crosses SQS/SNS/EventBridge only partially (SQS carries `AWSTraceHeader` as a system attribute; custom fields need explicit propagation). Without it a failed message in the worker cannot be tied back to the API request that created it.
- **Detect:** `SendMessageCommand` / `SendMessageBatchCommand` / `PublishCommand` / `PutEventsCommand` (Go `SendMessageInput`, `PublishInput`, `PutEventsRequestEntry`) whose input has no `MessageAttributes` / no correlation field in `Detail`, in a codebase that sets a correlation ID on the producer side; consumers that never read `record.messageAttributes` / `record.attributes.AWSTraceHeader`.
- **Fix:**
  ```ts
  await sqs.send(new SendMessageCommand({
    QueueUrl, MessageBody: JSON.stringify(order),
    MessageAttributes: { correlationId: { DataType: "String", StringValue: logger.getCorrelationId() as string } },
  }));
  // consumer
  logger.setCorrelationId(record.messageAttributes.correlationId?.stringValue);
  ```
  Hand off message contract design to `aws-messaging`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/ ; https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html ; https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html
- **Last verified:** 2026-10-12

### OBS-048 — Don't serialize sensitive responses into traces
- **Severity:** high
- **Category:** security
- **Applies to:** TypeScript, Terraform, CDK, SST
- **Rule:** Handlers and methods that return tokens, secrets or PII disable response capture (`captureResponse: false` on `captureLambdaHandler` / `captureMethod`, or `POWERTOOLS_TRACER_CAPTURE_RESPONSE=false`); errors that may carry sensitive data use `POWERTOOLS_TRACER_CAPTURE_ERROR=false`.
- **Why:** Powertools Tracer records the return value as trace metadata by default, so session tokens or customer records end up in X-Ray, visible to anyone with trace read access and outside log data protection.
- **Detect:** `tracer.captureLambdaHandler()` / `@tracer.captureLambdaHandler()` / `captureLambdaHandler(tracer)` / `@tracer.captureMethod()` without `captureResponse: false` on functions returning `token`, `accessToken`, `password`, `secret`, `SecretString`, user profiles, payment data; `tracer.putMetadata(` / `span.setAttribute(` with such values.
- **Fix:**
  ```ts
  export const handler = middy(lambdaHandler).use(captureLambdaHandler(tracer, { captureResponse: false }));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/tracer/
- **Last verified:** 2026-10-12

### OBS-049 — Instrument every AWS SDK v3 client, once, at module scope
- **Severity:** low
- **Category:** readability
- **Applies to:** TypeScript
- **Rule:** Each AWS SDK v3 client used in a traced function is created once outside the handler and wrapped (`tracer.captureAWSv3Client(new DynamoDBClient({}))`) or covered by OTel AWS SDK instrumentation; no client is created per invocation.
- **Why:** Unwrapped clients are invisible in the trace map, so the slow downstream call never shows; clients built inside the handler also lose connection reuse and re-wrap on every invocation.
- **Detect:** files importing `@aws-lambda-powertools/tracer` with `new <Service>Client(` not passed to `captureAWSv3Client(`; `new DynamoDBClient(` / `new S3Client(` inside the exported handler function body.
- **Fix:**
  ```ts
  const tracer = new Tracer({ serviceName: "checkout" });
  const ddb = tracer.captureAWSv3Client(new DynamoDBClient({}));
  ```
  Hand off client reuse to `aws-compute`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/tracer/
- **Last verified:** 2026-10-12

### OBS-050 — Add the require shim when bundling Powertools Tracer as ESM
- **Severity:** medium
- **Category:** bug
- **Applies to:** CDK, TypeScript
- **Rule:** CDK `NodejsFunction` bundles that use `OutputFormat.ESM` and import `@aws-lambda-powertools/tracer` (or `aws-xray-sdk-core`) add a banner that defines `require` via `createRequire(import.meta.url)`.
- **Why:** The X-Ray SDK for Node.js is CommonJS and calls `require`; in a pure ESM bundle the function fails at init with `Dynamic require of "..." is not supported` / `require is not defined`, a full outage of that function. SST v3 bundles to ESM by default and its docs do not document a require shim; SST's bundler source adds one, so do not flag SST functions unless a `require is not defined` / `Dynamic require` error is in evidence (the explicit fix there is `nodejs: { banner: "..." }`).
- **Detect:** CDK `bundling: { format: OutputFormat.ESM }` without a `banner` containing `createRequire`, in a function whose entry imports `@aws-lambda-powertools/tracer` or `aws-xray-sdk`.
- **Fix:**
  ```ts
  new NodejsFunction(this, "Fn", {
    entry: "src/fn.ts",
    bundling: {
      format: OutputFormat.ESM,
      mainFields: ["module", "main"],
      banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
    },
  });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/tracer/
- **Last verified:** 2026-10-12

### OBS-051 — Wire the OpenTelemetry Lambda layer completely
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** A function with the AWS Lambda Layer for OpenTelemetry / ADOT layer also sets `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument`, and for Application Signals attaches `CloudWatchLambdaApplicationSignalsExecutionRolePolicy`; the layer's runtime matches the function's (Node.js layer on a Node.js function).
- **Why:** Without the exec wrapper the layer is loaded but never instruments anything, adding cold-start time for zero telemetry; without the policy the Application Signals data is rejected.
- **Detect:** `layers` containing an OTel/ADOT layer ARN (`AWSOpenTelemetryDistro`, `aws-otel-nodejs`) with no `AWS_LAMBDA_EXEC_WRAPPER` in `environment`; Application Signals intent (`OTEL_AWS_APPLICATION_SIGNALS_ENABLED` unset or `true`) without the managed policy on the role.
- **Fix:** see OBS-045 snippet; add `fn.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLambdaApplicationSignalsExecutionRolePolicy"))`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable-LambdaMain.html
- **Last verified:** 2026-10-12

### OBS-052 — Sample traces at high volume
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** High-throughput services instrumented with OpenTelemetry set a sampler (`OTEL_TRACES_SAMPLER=parentbased_traceidratio` / `traceidratio` with `OTEL_TRACES_SAMPLER_ARG`) or X-Ray sampling rules, rather than recording every request.
- **Why:** Traces recorded cost $5.00 per million; a service at 500 req/s traced at 100% records ~1.3 billion traces/month ≈ $6,480/month, while 5% keeps statistical visibility for ~$324. Lambda Active tracing already samples (1 request/s + 5%), but the OTel default sampler is parent-based, so every request that starts at the service (no upstream decision) is recorded unless a ratio is set.
- **Detect:** OTel setup (`NodeSDK`, `sdktrace.NewTracerProvider(` without `sdktrace.WithSampler(`, ECS/EC2 services with OTel env) and no `OTEL_TRACES_SAMPLER`; `sdktrace.AlwaysSample()` in production code.
- **Fix:** `OTEL_TRACES_SAMPLER=parentbased_traceidratio`, `OTEL_TRACES_SAMPLER_ARG=0.05`; Go `sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(0.05)))`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html ; https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html ; https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable-LambdaMain.html ; https://aws.amazon.com/cloudwatch/pricing/
- **Last verified:** 2026-10-12

### OBS-053 — Index only low-cardinality, non-sensitive trace attributes as annotations
- **Severity:** low
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** X-Ray annotations (`tracer.putAnnotation`, OTel attributes listed in `aws.xray.annotations`) hold searchable, non-sensitive keys (tenant tier, operation, orderId if allowed); emails, names, tokens never go into annotations or metadata.
- **Why:** Annotations are indexed and visible in trace search and trace maps to everyone with X-Ray read access; traces are outside CloudWatch Logs data protection masking.
- **Detect:** `tracer.putAnnotation("email"|"userEmail"|"phone"|"token"`, `span.setAttribute("user.email"`, Go `span.SetAttributes(attribute.String("email", ...))`.
- **Fix:** annotate with an opaque ID (`customerId`) and look the person up in the system of record.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html ; https://docs.aws.amazon.com/powertools/typescript/latest/features/tracer/
- **Last verified:** 2026-10-12
