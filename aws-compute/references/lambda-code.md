# Lambda: handler code (TypeScript and Go)

Rules for what runs inside the function: Node.js handlers using AWS SDK for JavaScript v3, and Go
handlers using `github.com/aws/aws-lambda-go` with `aws-sdk-go-v2`. Read the IaC that declares the
function too: runtime and trigger change what is a bug (a callback handler is fine on
`nodejs22.x` and broken on `nodejs24.x`).

### LMB-015 — Use async handlers on nodejs24.x and later
- **Severity:** critical
- **Category:** bug
- **Applies to:** TypeScript, CDK, SST, Terraform
- **Rule:** On `nodejs24.x`+ the handler must be `async` (or synchronous) and return its result; callback-style handlers `(event, context, callback)` are only supported up to Node.js 22.
- **Why:** The Lambda docs state callback-based handlers are only supported up to Node.js 22. Upgrading the runtime (or relying on SST's default `nodejs24.x`, or CDK `NODEJS_LATEST`, which is `nodejs24.x` in current aws-cdk-lib) leaves a callback handler on an unsupported signature: the endpoint breaks after a routine upgrade, with no deploy-time error.
- **Detect:** `export const handler = (event, context, callback) =>`, `exports.handler = function (event, context, callback)`, `callback(null,`, `context.succeed(`, `context.done(`, `context.callbackWaitsForEmptyEventLoop` in a function whose runtime is `nodejs24.x`/`nodejs26.x`, `Runtime.NODEJS_24_X`, `Runtime.NODEJS_LATEST`, or SST with no `runtime` (defaults to `nodejs24.x`).
- **Fix:**
  ```ts
  import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
  export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const item = await getItem(event.pathParameters!.id!);
    return { statusCode: 200, body: JSON.stringify(item) };
  };
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html#nodejs-handler-callback , https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-lambda/lib/runtime.ts (`NODEJS_LATEST` = `nodejs24.x`) , https://sst.dev/docs/component/aws/function/
- **Last verified:** 2026-10-12

### LMB-016 — Create SDK clients and connections once, outside the handler
- **Severity:** high
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Construct SDK clients, DB pools and config at module scope (TS) or in `init()`/`main()` before `lambda.Start` (Go), and reuse them across invocations.
- **Why:** A client built per invocation re-resolves credentials and region and opens a new TLS connection every time, adding tens to hundreds of ms per call and more billed duration; per-invocation DB connections also exhaust database connection limits under load.
- **Detect:** TS: `new DynamoDBClient(`, `new S3Client(`, `DynamoDBDocumentClient.from(`, `new Pool(`, `new PrismaClient(` inside `handler` or a function it calls per event. Go: `config.LoadDefaultConfig(`, `dynamodb.NewFromConfig(`, `s3.NewFromConfig(`, `sql.Open(` inside the handler func passed to `lambda.Start`.
- **Fix:**
  ```ts
  const s3 = new S3Client({});
  export const handler = async (event: S3Event) => { await s3.send(new GetObjectCommand({ /* ... */ })); };
  ```
  ```go
  var s3Client *s3.Client
  func init() {
      cfg, err := config.LoadDefaultConfig(context.TODO())
      if err != nil { log.Fatalf("load config: %v", err) }
      s3Client = s3.NewFromConfig(cfg)
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html , https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html , https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html
- **Last verified:** 2026-10-12

### LMB-017 — Await every promise and goroutine before the handler returns
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** All work started by an invocation must finish before the handler returns: `await` it, `return` it, or `await Promise.all(...)`; in Go, wait on a `sync.WaitGroup`/`errgroup` before returning.
- **Why:** Lambda freezes the environment as soon as the handler returns. Un-awaited writes either never happen (environment recycled) or resume during a later, unrelated invocation, producing lost writes, writes attributed to the wrong request, and errors logged under someone else's request ID.
- **Detect:** TS: `records.forEach(async`, `.map(async` whose result is not awaited, `client.send(` / `fetch(` / `.then(` without `await`/`return`, `void someAsync()`, `setTimeout(` in a handler. Go: `go func()` in the handler with no `WaitGroup.Wait()`/`errgroup.Wait()` before return.
- **Fix:**
  ```ts
  await Promise.all(event.Records.map((r) => processRecord(r)));
  ```
  ```go
  g, ctx := errgroup.WithContext(ctx)
  for _, r := range event.Records { r := r; g.Go(func() error { return process(ctx, r) }) }
  return g.Wait()
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html , https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
- **Last verified:** 2026-10-12

### LMB-018 — Use AWS SDK for JavaScript v3, bundled; remove `aws-sdk` v2
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript
- **Rule:** Import modular `@aws-sdk/client-*` packages and bundle them. Remove `aws-sdk` (v2).
- **Why:** Supported Node.js runtimes include only SDK v3 (v2 was removed from the runtime with Node.js 18), so `require("aws-sdk")` fails with "Cannot find module" unless v2 is bundled; v2 reached end-of-support on 2025-09-08 and receives no fixes.
- **Detect:** `require("aws-sdk")`, `from "aws-sdk"`, `import AWS from "aws-sdk"`, `"aws-sdk":` in `package.json` dependencies, `new AWS.DynamoDB.DocumentClient()`, `.promise()` on SDK calls, CDK `bundling.externalModules: ["aws-sdk"]`.
- **Fix:**
  ```ts
  import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
  import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-sdk-included , https://aws.amazon.com/blogs/developer/announcing-end-of-support-for-aws-sdk-for-javascript-v2/
- **Last verified:** 2026-10-12

### LMB-019 — Finish async initialization during Init with top-level await
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript
- **Rule:** When init needs async work (loading parameters, secrets, warming a pool), use an ES module with top-level `await`, or a memoized promise awaited inside the handler. Never start an init promise at module scope and leave it un-awaited.
- **Why:** Async work not completed during Init runs during the first invoke, so the value can be `undefined` in the handler; the gap between Init and Invoke can also expire SigV4-signed requests. Init itself is limited to 10 s on on-demand functions (not on provisioned concurrency, SnapStart or Managed Instances), after which it is retried at invoke time under the function timeout.
- **Detect:** Module-scope `const config = loadConfig();` / `ssm.send(...)` / `getSecret(...)` whose promise is never awaited before use; `let secret; fetchSecret().then(s => secret = s)`; CJS (`exports.handler`, `.cjs`) code that needs async init; esbuild/`NodejsFunction` bundling `format` left CJS when the code uses top-level await.
- **Fix:**
  ```ts
  // handler.mjs / "type": "module" / bundling: { format: OutputFormat.ESM }
  const config = await loadConfig();
  export const handler = async (event: unknown) => doWork(config, event);
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html#nodejs-initialization , https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html
- **Last verified:** 2026-10-12

### LMB-020 — Keep per-request and per-user data out of module scope
- **Severity:** high
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** Module-level (TS) and package-level (Go) variables may hold clients and immutable config only, never request data, the current user, tokens or accumulating arrays.
- **Why:** Environments are reused across invocations from different callers, so a `currentUser` or `results` array set in one request is visible in the next one: data leaks between tenants, and unbounded arrays grow until the environment runs out of memory. With Lambda Managed Instances, invocations run concurrently in one environment, so shared mutable state also races.
- **Detect:** TS: module-scope `let currentUser`, `let tenantId`, `const results = []` / `const cache = new Map()` written from the handler with event-derived keys and no eviction. Go: package-level `var` assigned inside the handler (`currentReq = event`, `items = append(items, ...)`).
- **Fix:** Pass request state as arguments; cap caches (size and TTL) and key them by non-sensitive data only.
  ```ts
  export const handler = async (event: Event) => {
    const user = await authenticate(event);
    return handle(user, event);
  };
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html , https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html
- **Last verified:** 2026-10-12

### LMB-021 — Pass the invocation context to SDK calls and stop before the deadline
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Go, TypeScript
- **Rule:** In Go, pass the handler's `ctx` (or a child with a shorter timeout) to every SDK and HTTP call; long loops check the remaining time and stop cleanly. In TS, use `context.getRemainingTimeInMillis()` and per-request `abortSignal`/timeouts for long batches.
- **Why:** With `context.Background()` calls ignore the Lambda deadline: the function is killed mid-loop, half a batch is written, nothing reports which half, and the retry redoes everything (duplicates). Stopping early lets you report a partial batch failure instead (LMB-028).
- **Detect:** Go handler `func(ctx context.Context, ...)` that calls `client.PutItem(context.Background(), ...)` / `context.TODO()` inside the handler, or loops over records without checking `ctx.Done()`/`ctx.Deadline()`. TS handlers looping over large batches or pagination with no `getRemainingTimeInMillis()` check.
- **Fix:**
  ```go
  func handler(ctx context.Context, e events.SQSEvent) (events.SQSEventResponse, error) {
      var resp events.SQSEventResponse
      for _, r := range e.Records {
          if dl, ok := ctx.Deadline(); ok && time.Until(dl) < 2*time.Second {
              resp.BatchItemFailures = append(resp.BatchItemFailures, events.SQSBatchItemFailure{ItemIdentifier: r.MessageId})
              continue
          }
          if err := process(ctx, r); err != nil {
              resp.BatchItemFailures = append(resp.BatchItemFailures, events.SQSBatchItemFailure{ItemIdentifier: r.MessageId})
          }
      }
      return resp, nil
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/golang-context.html , https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html , https://docs.aws.amazon.com/lambda/latest/dg/nodejs-context.html
- **Last verified:** 2026-10-12

### LMB-022 — Return errors instead of exiting the process
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Go, TypeScript
- **Rule:** Inside the handler, return an `error` (Go) or throw/reject (TS). Reserve `log.Fatal`, `os.Exit`, `panic` and `process.exit` for init.
- **Why:** Exiting kills the runtime: Lambda reports `Runtime.ExitError` instead of your error, resets the environment, and the next invocation pays a full cold start (suppressed init). Under a burst of bad input every invocation becomes a cold start.
- **Detect:** Go: `log.Fatal`, `log.Fatalf`, `log.Panic`, `os.Exit(`, bare `panic(` inside the handler function or helpers it calls. TS: `process.exit(` inside a handler.
- **Fix:**
  ```go
  if err != nil {
      return fmt.Errorf("put order %s: %w", id, err)
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html , https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html
- **Last verified:** 2026-10-12

### LMB-023 — Keep payloads under the invocation limits
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Synchronous request and response bodies are limited to 6 MB each (200 MB for streamed responses); asynchronous invocation payloads to 1 MB. Move large data through S3 (presigned URL or object key) or response streaming.
- **Why:** Returning a generated report or base64 file works in tests and fails in production once a customer's data crosses the limit; async `Invoke` with a large payload is rejected at the call site.
- **Detect:** Handlers returning file contents or `Buffer.toString("base64")` bodies; `JSON.stringify(allRows)` responses without pagination; `new InvokeCommand({ InvocationType: "Event", Payload })` / Go `InvocationTypeEvent` carrying whole documents.
- **Fix:**
  ```ts
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: 300 });
  return { statusCode: 200, body: JSON.stringify({ url }) };
  ```
  For Node streaming: `awslambda.streamifyResponse` with a function URL in `RESPONSE_STREAM` mode.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html , https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
- **Last verified:** 2026-10-12

### LMB-024 — Don't chain functions with synchronous Lambda-to-Lambda calls
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Replace a handler that invokes another function and waits for it with a shared module, a queue between them, or an orchestrator (Step Functions or Lambda durable functions).
- **Why:** The caller is billed while it idles waiting for the callee, both need equal concurrency, the slowest function bounds the workflow, and error handling/compensation becomes ad-hoc code.
- **Detect:** TS `new InvokeCommand({ FunctionName, ... })` without `InvocationType: "Event"` (default is `RequestResponse`) awaited inside a handler; `LambdaClient` in handler code. Go `lambdaClient.Invoke(ctx, &lambda.InvokeInput{...})` with default/`RequestResponse` invocation type.
- **Fix:** Import the callee's logic as a library if it is the same team/deploy unit; otherwise send to SQS or model the flow in Step Functions/durable functions.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/functions-calling-functions.html , https://docs.aws.amazon.com/lambda/latest/dg/anti-patterns.html
- **Last verified:** 2026-10-12

### LMB-025 — Wait with Step Functions or durable functions, not sleep loops
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Don't poll or sleep inside a handler to wait for an external job, approval or retry window; use a Step Functions `Wait`/callback task or a Lambda durable function `wait`, which suspend without compute charges.
- **Why:** A handler sleeping 10 minutes per job at 1 GB bills 600 GB-s per job (≈ $0.01 at x86 rates), multiplied by every job, and dies at the 15-minute limit for anything longer.
- **Detect:** TS `await new Promise((r) => setTimeout(r, ...))` with multi-second delays, `while (status !== "DONE") { ...; await sleep(...) }`; Go `time.Sleep(` or `time.After` polling loops in handlers; timeouts near 900 s on such functions.
- **Fix:** Model the wait in Step Functions (`Wait` state, `.waitForTaskToken`) or, for TypeScript/JavaScript, a durable function wait operation (the durable execution SDK covers JavaScript/TypeScript, Python and Java, not Go: Go functions use Step Functions). Keep each Lambda step short.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html , https://docs.aws.amazon.com/lambda/latest/dg/durable-step-functions.html , https://docs.aws.amazon.com/lambda/latest/dg/anti-patterns.html
- **Last verified:** 2026-10-12

### LMB-026 — Make handlers idempotent for at-least-once triggers
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Handlers fed by SQS, SNS, EventBridge, S3, streams or async invoke must tolerate the same event twice: key side effects on an idempotency key with a conditional write, or use Powertools idempotency (TS).
- **Why:** Event source mappings and the async queue deliver at least once and retry on errors and timeouts; a non-idempotent handler double-charges cards, double-sends emails and double-increments counters.
- **Detect:** Handlers for those triggers that call payment/email/SMS APIs, `UpdateItem` with `ADD`/`SET x = x + :n`, or `PutItem` without `ConditionExpression`, and have no dedupe key (`messageId`, event `id`, business ID) checked first; no `@aws-lambda-powertools/idempotency` import.
- **Fix:**
  ```ts
  import { makeIdempotent } from "@aws-lambda-powertools/idempotency";
  import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
  const persistenceStore = new DynamoDBPersistenceLayer({ tableName: process.env.IDEMPOTENCY_TABLE! });
  export const handler = makeIdempotent(async (event: OrderEvent) => charge(event), { persistenceStore });
  ```
  Go: `PutItem` with `ConditionExpression: aws.String("attribute_not_exists(pk)")` on the idempotency key. Hand off table design to **aws-data**.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html , https://docs.aws.amazon.com/powertools/typescript/latest/features/idempotency/ , https://repost.aws/knowledge-center/lambda-function-idempotent
- **Last verified:** 2026-10-12
