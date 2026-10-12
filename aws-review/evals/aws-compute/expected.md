# aws-compute eval: expected findings

Fixture: a small app with Terraform (`infra/main.tf`), a CDK stack (`cdk/`), an SST app
(`sst.config.ts`), TypeScript handlers (`functions/`, `cdk/src/`), a Go Lambda (`go/worker/`)
and an ECS service image (`service/Dockerfile`). Run the aws-compute skill over the whole
directory. A passing review reports all 12 planted issues with the listed rule ID (or an
equivalent NEW finding with the same evidence) and does not flag either decoy.

## Planted issues

1. `infra/main.tf:37` → **LMB-001** → `thumbnailer` runs `nodejs20.x`, deprecated on 2026-04-30: no security patches, and function updates are blocked from 2027-08-31.
2. `infra/main.tf:64` + `functions/thumbnail.ts:18-20` → **LMB-035** → the bucket notification fires on every `s3:ObjectCreated:*` with no `filter_prefix`, and the handler writes `thumbnails/<key>` into the same bucket (`MEDIA_BUCKET`): each thumbnail triggers another invocation (thumbnails of thumbnails) until recursion detection stops the chain at about 16 hops, billed every time.
3. `infra/main.tf:92` (with `:106`) → **LMB-030** → `orders` queue visibility timeout is 30 s for a consumer with a 25 s timeout; it should be ≥ 6 × 25 = 150 s, or messages reappear while a batch is still running or retried after throttling, and get processed twice.
4. `infra/main.tf:110` + `functions/orders.ts:26,30` → **LMB-028** → the handler returns `batchItemFailures`, but the event source mapping has no `function_response_types = ["ReportBatchItemFailures"]`, so Lambda treats every invocation as a full success and deletes the failed messages: silent data loss, and the DLQ never sees them.
5. `infra/main.tf:123` → **EC2-001** → the launch template allows IMDSv1 (`http_tokens = "optional"`), so an SSRF on the host can read the instance role credentials.
6. `infra/main.tf:166` → **ECS-001** → `aws_ecs_service.api` has no `deployment_circuit_breaker`, so a bad image keeps replacing tasks forever instead of failing and rolling back.
7. `functions/thumbnail.ts:8` → **LMB-016** → `new S3Client({})` inside the handler re-creates the client (credential/region resolution and a new TLS connection) on every invocation.
8. `functions/thumbnail.ts:10` → **LMB-017** → `event.Records.forEach(async ...)` isn't awaited: the handler returns before the S3 reads and writes finish, the environment is frozen, and thumbnails are lost or written during a later invocation. Errors never reach Lambda either, so the on-failure destination never fires.
9. `cdk/lib/api-stack.ts:21,27` → **LMB-007** → provisioned concurrency is on the `live` alias, but the HTTP API integration invokes the unqualified function (`reports`): 3 warm environments are paid 24/7 and every request still hits `$LATEST` cold starts.
10. `cdk/src/legacy-report.ts:7` (runtime at `cdk/lib/api-stack.ts:14`) → **LMB-015** → callback-style handler `(event, context, callback)` on `NODEJS_24_X`. The Lambda docs say callback handlers are only supported up to Node.js 22, so this handler runs on an unsupported signature and the endpoint breaks.
11. `go/worker/main.go:40` → **LMB-022** → `log.Fatalf` inside the handler on a malformed event exits the process (`Runtime.ExitError`), resets the environment and forces a cold start, instead of returning an error. Each retry of the bad event repeats it.
12. `service/Dockerfile:17` → **ECS-002** → shell-form `CMD npm start` runs as `/bin/sh -c "npm start"`, so the shell is PID 1 and doesn't pass SIGTERM on to Node; every deploy or scale-in SIGKILLs the API after the 30 s `stopTimeout` and drops in-flight requests.

## Decoys (must NOT be flagged)

- **D1 — correct SST queue consumer:** `sst.config.ts:19-33` with `functions/invoice-events.ts`. The visibility timeout is 3 min = 180 s ≥ 6 × 25 s + 20 s window = 170 s (LMB-030 OK), `partialResponses: true` matches the Powertools `processPartialResponse` handler (LMB-028/029 OK), the DLQ uses `retry: 5` (LMB-031 OK), it uses `link: [invoices]` with `Resource.Invoices.name` (LMB-014 OK), and the writes are conditional, so duplicates are no-ops (LMB-026 OK).
- **D2 — correct Go client reuse:** `go/worker/main.go:29-35` creates the DynamoDB client once in `init()` (where `log.Fatalf` on config failure is acceptable), and `:43` passes the handler `ctx` to `UpdateItem` (LMB-016 and LMB-021 OK). Flagging `init()` or the `UpdateItem` call for client reuse or context fails the eval.

## Acceptable extra findings

These are true but not planted; a reviewer may raise them without failing the eval:

- `functions/thumbnail.ts` buffers whole images in memory (`transformToByteArray`), a sizing note (LMB-004/LMB-010 territory).
- `infra/main.tf` `aws_ecs_service.api` without explicit `security_groups` uses the VPC default security group: hand off to aws-networking.
- `aws_lambda_function.thumbnailer` could note the duplicate-processing risk once LMB-035 is fixed (LMB-026), since S3 can deliver an event more than once.
- `go/worker/main.go:49` (LMB-026, low/medium): the condition `#lastEvent <> :id` only rejects a redelivery when no other event for the same account arrived in between, so an async retry that lands after a newer event still double-adds `units`.
- `cdk/lib/api-stack.ts:12-19` (LMB-011, low): `NodejsFunction` on the fixed `NODEJS_24_X` runtime marks `@aws-sdk/*` external by default; `bundling.bundleAwsSDK: true` would include the SDK clients in the bundle as AWS recommends.
- `service/Dockerfile` / app code: ECS-002 may also ask for a `SIGTERM` handler in the server, which the fixture doesn't show.
