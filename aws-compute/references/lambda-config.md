# Lambda: function configuration

Rules for how a function is declared in Terraform (`aws_lambda_function` and friends), CDK v2
(`lambda.Function`, `NodejsFunction`) and SST v3 (`sst.aws.Function`, `handler:` strings on
components). Defaults that matter when a property is missing:

| Setting | Terraform | CDK v2 | SST v3 |
| --- | --- | --- | --- |
| architecture | `["x86_64"]` | `X86_64` | `"x86_64"` |
| memory | 128 MB | 128 MB | 1024 MB |
| timeout | 3 s | 3 s | 20 s |
| runtime | required | `NodejsFunction`: `NODEJS_LATEST` (= `nodejs24.x` in current aws-cdk-lib) only with the `useLatestRuntimeVersion` feature flag, else `NODEJS_16_X` | `"nodejs24.x"` |

### LMB-001 — Upgrade deprecated or soon-deprecated runtimes
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Run every function on a supported runtime: `nodejs22.x`/`nodejs24.x` for Node, `provided.al2023` for Go. Flag anything already deprecated and anything deprecating within ~6 months.
- **Why:** Deprecated runtimes stop receiving security patches and support; after the block dates you cannot update the function code at all, so a hotfix during an incident fails. As of 2026-10-12: `nodejs18.x` deprecated 2025-09-01, `nodejs20.x` deprecated 2026-04-30, `provided.al2` deprecated 2026-07-31, `go1.x` and `provided` deprecated 2024-01-08 (update blocked from 2027-08-31 for most of these). `nodejs22.x` deprecates 2027-04-30 (report as low until it is inside 6 months). `nodejs26.x` is a public preview: not for production.
- **Detect:** Terraform `runtime = "nodejs18.x" | "nodejs20.x" | "nodejs16.x" | "go1.x" | "provided" | "provided.al2"`. CDK `Runtime.NODEJS_18_X`, `NODEJS_20_X`, `NODEJS_16_X`, `GO_1_X`, `PROVIDED_AL2`; `new NodejsFunction(...)` with no `runtime` while `cdk.json` lacks `"@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion": true` (falls back to `NODEJS_16_X`). SST `runtime: "nodejs18.x" | "nodejs20.x" | "provided.al2"`; any `nodejs26.x` / `NODEJS_26_X` in production code (preview runtime, no SLA). Container images built `FROM public.ecr.aws/lambda/nodejs:18|20` or `provided:al2`.
- **Fix:** Move to `nodejs24.x` (check LMB-015 first: callback handlers break on 24) or `provided.al2023`.
  ```hcl
  resource "aws_lambda_function" "api" {
    runtime       = "nodejs24.x"
    architectures = ["arm64"]
  }
  ```
  ```ts
  new NodejsFunction(this, "Api", { runtime: lambda.Runtime.NODEJS_24_X, entry: "src/api.ts" });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html , https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs.NodejsFunction.html
- **Last verified:** 2026-10-12

### LMB-002 — Default new functions to arm64
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, Go
- **Rule:** Set `arm64` unless a dependency ships x86-only native code. Every IaC tool in this stack defaults to x86_64, so an omitted architecture is an x86 function.
- **Why:** Arm duration is billed about 20% lower per GB-second than x86 (us-east-1 first tier: Arm $0.0000133334 vs x86 $0.0000166667 per GB-s, from the pricing page's price data). A 1,024 MB function doing 10 M invocations/month at 200 ms = 2,000,000 GB-s → x86 $33.33 vs Arm $26.67, about $6.67/month saved per function, before any speedup.
- **Detect:** Terraform `aws_lambda_function` without `architectures` or with `["x86_64"]`. CDK `lambda.Function`/`NodejsFunction` without `architecture` or `Architecture.X86_64`. SST `sst.aws.Function` (or a component's `handler`/`transform.function`) without `architecture: "arm64"`. Pure-JS or pure-Go code (no `sharp`, `canvas`, `bcrypt`, prebuilt binaries) confirms the switch is free; with x86-only native dependencies or an amd64-only image, don't report.
- **Fix:**
  ```ts
  new sst.aws.Function("Api", { handler: "src/api.handler", architecture: "arm64" });
  ```
  ```hcl
  architectures = ["arm64"]
  ```
  Pair with LMB-003 so the build targets the same architecture.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/lambda/pricing/ , https://aws.amazon.com/blogs/aws/aws-lambda-functions-powered-by-aws-graviton2-processor-run-your-functions-on-arm-and-get-up-to-34-better-price-performance/ , https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html
- **Last verified:** 2026-10-12

### LMB-003 — Build artifacts for the architecture the function declares
- **Severity:** critical
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, Go, TypeScript
- **Rule:** The binary, native modules, layers and container image must match the function's `architectures`.
- **Why:** An amd64 `bootstrap` on an arm64 function (or the reverse) fails at init with an exec format error on every invocation; native npm modules compiled on an x86 CI runner crash an arm64 function the same way. It deploys cleanly and fails only at runtime.
- **Detect:** `architectures = ["arm64"]` / `Architecture.ARM_64` / `architecture: "arm64"` together with `GOARCH=amd64` (Makefile, `package.json` scripts, CI YAML), `docker build --platform linux/amd64`, `Code.fromAsset` pointing at a prebuilt binary, or layers whose `compatible_architectures` lacks the function's architecture. Native deps in `package.json` (`sharp`, `bcrypt`, `@node-rs/*`, `canvas`, Prisma engines) built without a target platform.
- **Fix:**
  ```sh
  GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o bootstrap main.go
  ```
  For Node native modules install with the target platform (`npm install --os=linux --cpu=arm64 sharp`) or build inside the matching Lambda base image.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html , https://docs.aws.amazon.com/lambda/latest/dg/golang-package.html
- **Last verified:** 2026-10-12

### LMB-004 — Size memory from measurement, not the 128 MB default
- **Severity:** medium
- **Category:** performance
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set `memory_size` deliberately: CPU scales with memory (1,769 MB = 1 vCPU), so 128 MB starves TLS, JSON parsing and SDK calls, while 3–10 GB on an I/O-bound glue function buys idle CPU.
- **Why:** At 128 MB a function that parses a few MB of JSON can run 5–10× longer than at 1 GB, so it costs more *and* is slower; the opposite mistake doubles the bill for no latency gain. `Max Memory Used` in the `REPORT` log line shows the real need.
- **Detect:** Terraform `aws_lambda_function` without `memory_size` (128). CDK `lambda.Function`/`NodejsFunction` without `memorySize` (128). Very high values (`memory_size >= 3008`, `memorySize: 10240`) on handlers that only call DynamoDB/S3/HTTP and do no CPU work.
- **Fix:** Start Node/Go APIs at 512–1,024 MB, then run AWS Lambda Power Tuning and pick the cheapest point on the curve.
  ```ts
  new NodejsFunction(this, "Parse", { memorySize: 1024, entry: "src/parse.ts" });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html , https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html , https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
- **Last verified:** 2026-10-12

### LMB-005 — Set the timeout from the caller's budget
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** The function timeout must exceed the handler's realistic p99 (including SDK retries) and stay below what the caller waits for: API Gateway REST integrations stop at 29 s by default (HTTP APIs at 30 s, not raisable), SQS needs visibility timeout ≥ 6× function timeout (LMB-030).
- **Why:** The 3 s Terraform/CDK default kills functions mid-write on the first slow downstream call (the SDK's own retries alone can exceed it). A 900 s timeout behind API Gateway keeps running and billing for up to 15 minutes after the client got a 504, and retried requests double the work.
- **Detect:** Terraform/CDK functions with no `timeout`/`Duration` that call AWS services or HTTP. Synchronous functions behind `aws_apigatewayv2_integration`, `aws_api_gateway_integration`, `LambdaIntegration`, `HttpLambdaIntegration`, `sst.aws.ApiGatewayV2`, `url: true` with `timeout` far above the API's integration timeout.
- **Fix:** API handlers: timeout just under the integration timeout (e.g. 25 s) and SDK client timeouts below that. Async/queue workers: size from measured duration.
  ```ts
  new lambda.Function(this, "Api", { timeout: Duration.seconds(25), /* ... */ });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html , https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html , https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html
- **Last verified:** 2026-10-12

### LMB-006 — Cap concurrency in front of fixed-capacity downstreams
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Give functions that open connections to a fixed-capacity resource (RDS/Aurora without a proxy, a third-party API with a rate limit) reserved concurrency sized to that resource. Never ship reserved concurrency `0` outside an incident.
- **Why:** Lambda scales by up to 1,000 execution environments every 10 seconds per function; 500 concurrent environments each opening a Postgres connection exhausts `max_connections` and takes the database down for every other client. Reserved concurrency `0` throttles every invocation (it is the documented kill switch).
- **Detect:** Code importing `pg`, `mysql2`, `postgres`, `@prisma/client`, `database/sql`, `pgx` with no `reserved_concurrent_executions` / `reservedConcurrentExecutions` / SST `concurrency: { reserved }` and no RDS Proxy. Any `reserved_concurrent_executions = 0`, `reservedConcurrentExecutions: 0`, `concurrency: { reserved: 0 }`.
- **Fix:**
  ```hcl
  reserved_concurrent_executions = 50 # = db max_connections budget / connections per env
  ```
  Reserved concurrency is carved out of the account pool, which must keep at least 100 unreserved. For SQS consumers prefer ESM maximum concurrency (LMB-033). Hand off connection pooling/RDS Proxy to **aws-data**.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html , https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html , https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- **Last verified:** 2026-10-12

### LMB-007 — Point every caller at the alias or version that has provisioned concurrency
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Provisioned concurrency lives on a version or alias (never `$LATEST`); the API integration, function URL or event source mapping must invoke that same qualifier.
- **Why:** If the integration uses the unqualified ARN, every request goes to `$LATEST` on-demand: you pay for the warm environments 24/7 and still get every cold start.
- **Detect:** Terraform `aws_lambda_provisioned_concurrency_config { qualifier = aws_lambda_alias.x.name }` while `aws_api_gateway_integration`/`aws_apigatewayv2_integration` uses `aws_lambda_function.x.invoke_arn` (not the alias's `invoke_arn`), or `aws_lambda_event_source_mapping.function_name = aws_lambda_function.x.arn`. CDK `fn.addAlias("live", { provisionedConcurrentExecutions })` or `new lambda.Alias(...)` while `new HttpLambdaIntegration(..., fn)`, `new LambdaIntegration(fn)`, `fn.addEventSource(...)`, `fn.addFunctionUrl()` use `fn` instead of the alias. SST `concurrency: { provisioned }` without `versioning: true`.
- **Fix:**
  ```ts
  const live = fn.addAlias("live", { provisionedConcurrentExecutions: 5 });
  new HttpLambdaIntegration("Api", live);
  ```
  ```hcl
  integration_uri = aws_lambda_alias.live.invoke_arn
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html , https://sst.dev/docs/component/aws/function/
- **Last verified:** 2026-10-12

### LMB-008 — Justify always-on provisioned concurrency and scale it
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Use provisioned concurrency only for latency-sensitive synchronous paths, sized from measured concurrency (+10%), and scale it with Application Auto Scaling (schedule or target tracking). Not on queue consumers, async processors or dev stages.
- **Why:** You pay for provisioned environments whether or not they serve traffic. x86 us-east-1: $0.0000041667 per GB-s. 10 environments × 1 GB × 2,592,000 s (30 days) = 25,920,000 GB-s ≈ $108/month before a single request; on five dev stages that is $540/month of idle.
- **Detect:** `aws_lambda_provisioned_concurrency_config` / `provisionedConcurrentExecutions` / SST `concurrency: { provisioned }` on functions triggered by SQS, EventBridge, S3, schedules; with no `aws_appautoscaling_target { scalable_dimension = "lambda:function:ProvisionedConcurrency" }` or `alias.addAutoScaling(...)`; set unconditionally in stage-agnostic SST/CDK code.
- **Fix:**
  ```ts
  const live = fn.addAlias("live", { provisionedConcurrentExecutions: 2 });
  live.addAutoScaling({ minCapacity: 2, maxCapacity: 20 }).scaleOnUtilization({ utilizationTarget: 0.7 });
  ```
  In SST gate it: `concurrency: $app.stage === "production" ? { provisioned: 2 } : undefined`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html , https://aws.amazon.com/lambda/pricing/
- **Last verified:** 2026-10-12

### LMB-009 — Use SnapStart only where it is supported and init is snapshot-safe
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** SnapStart supports Java 11+, Python 3.12+ and .NET 8+ only, on published versions/aliases; not other managed runtimes (the docs name `nodejs24.x`), OS-only runtimes (Go on `provided.al2023`), provisioned concurrency, EFS, S3 Files, or ephemeral storage above 512 MB. Where enabled, generate unique IDs, secrets and random seeds after restore, not during init.
- **Why:** On this stack's runtimes SnapStart is not supported, so configs that set it don't give the cold-start win the author expects (whether the API rejects or ignores the setting is not documented: say "not supported", not "fails"); on supported runtimes, IDs generated during init are duplicated across every environment restored from the same snapshot.
- **Detect:** Terraform `snap_start { apply_on = "PublishedVersions" }` with `runtime` `nodejs*`/`provided*`, or with `ephemeral_storage { size > 512 }`, or alongside `aws_lambda_provisioned_concurrency_config`. CDK `snapStart: lambda.SnapStartConf.ON_PUBLISHED_VERSIONS` on Node/Go functions. Python/Java init code calling `uuid4()`, `secrets.token_*`, `random.seed()` at module scope with SnapStart on.
- **Fix:** For Node/Go cold starts: smaller bundles (LMB-011), arm64, provisioned concurrency on the hot path. For Python/Java: move uniqueness into the handler or an after-restore hook.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html
- **Last verified:** 2026-10-12

### LMB-010 — Treat /tmp as a per-environment cache: clean it and size it deliberately
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Delete per-request files from `/tmp` before returning, and raise ephemeral storage above the free 512 MB only for a measured need.
- **Why:** `/tmp` survives across invocations of the same environment, even after an invocation error resets the runtime. Writing `/tmp/<requestId>.pdf` without deleting fills the disk after N requests (`ENOSPC`, then every invocation on that environment fails) and can leak one user's file to the next. Storage above 512 MB is billed ($0.0000000309 per GB-s in us-east-1).
- **Detect:** TS `fs.writeFile*('/tmp/` / `createWriteStream('/tmp/` / `os.tmpdir()` without a matching `unlink`/`rm` in `finally`; Go `os.CreateTemp`/`os.WriteFile("/tmp/` without `defer os.Remove`. Terraform `ephemeral_storage { size = 10240 }`, CDK `ephemeralStorageSize: Size.gibibytes(10)`, SST `storage: "10 GB"` on functions that stream or never touch disk.
- **Fix:**
  ```ts
  const path = `/tmp/${randomUUID()}.pdf`;
  try { await writeFile(path, body); /* ... */ } finally { await rm(path, { force: true }); }
  ```
  Prefer streaming S3 objects (`GetObjectCommand` body piped) over staging them on disk.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html , https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html , https://aws.amazon.com/lambda/pricing/
- **Last verified:** 2026-10-12

### LMB-011 — Bundle and tree-shake Node code; keep layers for shared binaries
- **Severity:** medium
- **Category:** performance
- **Applies to:** CDK, SST, Terraform, TypeScript
- **Rule:** Ship TypeScript functions as an esbuild bundle that includes the `@aws-sdk/client-*` modules you use. Don't zip whole `node_modules`, and don't move app dependencies into layers to "speed up" deploys. Relying on the runtime-provided SDK is the lowest-priority part of this rule: report it as low.
- **Why:** Package size and module loading dominate Node cold starts; layers are still loaded at init and count toward the 250 MB unzipped limit (max 5 layers). The runtime-provided SDK is updated by Lambda underneath you; AWS "strongly recommends" including the SDK clients you need in the deployment package for backward compatibility during runtime updates. CDK `NodejsFunction` marks `@aws-sdk/*` external by default on fixed runtimes (e.g. `NODEJS_24_X`) unless `bundleAwsSDK: true`; with `NODEJS_LATEST` it bundles them.
- **Detect:** CDK `lambda.Function` with `Code.fromAsset("dist")`/`fromAsset(".")` for TS code containing `node_modules`; `NodejsFunction` with `bundling: { externalModules: ["@aws-sdk/*"] }`, or on a fixed runtime (`Runtime.NODEJS_22_X`/`NODEJS_24_X`) without `bundling.bundleAwsSDK: true` (low), or `nodeModules` listing the whole dependency tree; Terraform `archive_file` zipping a project root with `node_modules`; `aws_lambda_layer_version` containing app dependencies; `import * as AWS from "aws-sdk"`.
- **Fix:**
  ```ts
  new NodejsFunction(this, "Api", {
    entry: "src/api.ts",
    bundling: { minify: true, sourceMap: true, format: OutputFormat.ESM, bundleAwsSDK: true },
  });
  ```
  SST bundles with esbuild by default; use `nodejs.install` only for packages that cannot be bundled.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html#nodejs-example-sdk-usage , https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html , https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html , https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs.BundlingOptions.html , https://docs.aws.amazon.com/lambda/latest/dg/runtimes-update.html
- **Last verified:** 2026-10-12

### LMB-012 — Run Go on provided.al2023 with a `bootstrap` binary
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, Go
- **Rule:** Go functions use the OS-only runtime `provided.al2023`, an executable named `bootstrap` at the zip root, built with `-tags lambda.norpc` and `CGO_ENABLED=0`.
- **Why:** `go1.x` and `provided.al2` are deprecated; a binary not named `bootstrap` fails at init; a cgo-linked binary built on another distro can fail on AL2023's libc. The RPC component is only for the deprecated `go1.x` runtime and inflates the package.
- **Detect:** Terraform `runtime = "go1.x" | "provided.al2"`, `handler = "main"` with a zip whose binary is not `bootstrap`; CDK `Runtime.GO_1_X`, `Runtime.PROVIDED_AL2`; build scripts `go build -o main`, missing `-tags lambda.norpc`, missing `CGO_ENABLED=0`. SST: `runtime: "go"` builds correctly; flag only hand-rolled builds.
- **Fix:**
  ```hcl
  resource "aws_lambda_function" "worker" {
    runtime       = "provided.al2023"
    handler       = "bootstrap"
    architectures = ["arm64"]
    filename      = "worker.zip" # contains ./bootstrap
  }
  ```
  ```ts
  new sst.aws.Function("Worker", { runtime: "go", handler: "./functions/worker", architecture: "arm64" });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/golang-package.html , https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html , https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html , https://sst.dev/docs/component/aws/function/
- **Last verified:** 2026-10-12

### LMB-013 — Keep recursive loop detection on
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Leave recursion handling at `Terminate` (the default). Switch to `Allow` only for a deliberate recursive design that carries its own depth counter.
- **Why:** Lambda stops a request chain after about 16 invocations through SQS, S3, SNS, EventBridge custom event buses or direct Lambda-to-Lambda calls (detection needs a supported SDK version, e.g. JS v3 ≥ 3.105.0, Go v2 ≥ 1.57.0). With `Allow`, a self-feeding loop scales to the account's concurrency and bills until someone notices.
- **Detect:** Terraform `aws_lambda_function_recursion_config { recursive_loop = "Allow" }`; CDK `recursiveLoop: lambda.RecursiveLoop.ALLOW`; CloudFormation `RecursiveLoop: Allow`.
- **Fix:** Remove the override, or keep `Allow` only with an explicit hop counter in the payload plus reserved concurrency as a ceiling.
  ```hcl
  resource "aws_lambda_function_recursion_config" "this" {
    function_name  = aws_lambda_function.this.function_name
    recursive_loop = "Terminate"
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function_recursion_config , https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.FunctionProps.html
- **Last verified:** 2026-10-12

### LMB-014 — Use SST `link` and CDK `grant*` instead of hand-written env vars and IAM
- **Severity:** low
- **Category:** simplicity
- **Applies to:** SST, CDK, TypeScript
- **Rule:** Wire a function to a resource with SST `link: [resource]` (read via `Resource.<Name>` from `"sst"`) or CDK `resource.grant*(fn)` plus one env var, not with a hand-maintained environment map and a separate inline IAM statement.
- **Why:** The manual pair drifts: a renamed table keeps the old env var, or the policy says `dynamodb:*` on `*` because nobody wanted to write the ARN. `link`/`grant*` generate least-privilege permissions and typed access from one line.
- **Detect:** SST `sst.aws.Function`/`handler` args with `environment: { TABLE_NAME: table.name }` plus `permissions: [{ actions: [...], resources: [table.arn] }]` for an SST component; code reading `process.env.TABLE_NAME` in an SST app. CDK `fn.addToRolePolicy(new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [bucket.arnForObjects("*")] }))` where `bucket.grantRead(fn)` exists.
- **Fix:**
  ```ts
  const table = new sst.aws.Dynamo("Orders", { /* ... */ });
  new sst.aws.Function("Api", { handler: "src/api.handler", link: [table] });
  // src/api.ts
  import { Resource } from "sst";
  const tableName = Resource.Orders.name;
  ```
  Hand off broader IAM scoping to **aws-security**.
- **Volatile:** no
- **Source:** https://sst.dev/docs/linking/ , https://sst.dev/docs/component/aws/function/ , https://docs.aws.amazon.com/cdk/v2/guide/permissions.html
- **Last verified:** 2026-10-12

### LMB-037 — Don't pin the runtime version with Manual runtime management
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Leave runtime management on `Auto` (the default). Use `FunctionUpdate` only with regular deploys, and `Manual` only as a short, documented rollback while an incompatibility is fixed.
- **Why:** A function in `Manual` mode keeps the pinned runtime version indefinitely and receives no runtime security patches; AWS describes `Manual` as a temporary mitigation for rollback, not a way to get consistency across deploys. In Terraform, `Manual` also blocks changing the function's `runtime` until the mode is switched back, so a forced runtime upgrade turns into a two-step change.
- **Detect:** Terraform `aws_lambda_runtime_management_config { update_runtime_on = "Manual" runtime_version_arn = ... }`; CDK `runtimeManagementMode: lambda.RuntimeManagementMode.manual("arn:...")`; `update_runtime_on = "FunctionUpdate"` / `RuntimeManagementMode.FUNCTION_UPDATE` on functions that are rarely redeployed. For runtime-version consistency AWS recommends container images instead.
- **Fix:** Remove the override (back to `Auto`), or keep `Manual` with a ticket/expiry comment and a plan to return to `Auto`.
  ```hcl
  resource "aws_lambda_runtime_management_config" "api" {
    function_name     = aws_lambda_function.api.function_name
    update_runtime_on = "Auto"
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/runtimes-update.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_runtime_management_config
- **Last verified:** 2026-10-12
