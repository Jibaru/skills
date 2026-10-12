# API Gateway: REST APIs, HTTP APIs, stages, authorizers, caching, CORS

Rules APIGW-001 – APIGW-018. Prices us-east-1: HTTP API $1.00 per million (first 300 M/month,
metered in 512 KB increments); REST API $3.50 per million (first 333 M); REST cache from
$0.038/h for 1.6 GB. Account throttle default 10,000 rps with 5,000 burst per Region, shared by
all REST, HTTP and WebSocket APIs (2,500/1,250 in some newer Regions).

### APIGW-001 — Use an HTTP API unless you need a REST-only feature
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** New APIs are HTTP APIs (`apigatewayv2`) unless they use something only REST APIs have: API keys/usage plans, per-client throttling, caching, request validation or body transformation, AWS WAF, private endpoints, edge-optimized endpoints, resource policies, mock integrations, canary deployments, X-Ray, execution logs, or response streaming.
- **Why:** REST costs 3.5× per request. At 100 M requests/month: REST 100 × $3.50 = $350 vs HTTP 100 × $1.00 = $100 → $250/month ($3,000/year) for features the API does not use. HTTP APIs also have native JWT authorizers and auto-deploy.
- **Detect:** Terraform `aws_api_gateway_rest_api` whose methods are plain `AWS_PROXY` Lambda integrations and the stack has no `aws_api_gateway_usage_plan`, `aws_api_gateway_request_validator`, `aws_wafv2_web_acl_association`, `cache_cluster_enabled = true`, `endpoint_configuration { types = ["PRIVATE"] }`, `aws_api_gateway_rest_api_policy`, `response_transfer_mode = "STREAM"`; CDK `new apigateway.RestApi`/`LambdaRestApi` with only `LambdaIntegration`s and none of `apiKeyRequired`, `requestValidator`, `cachingEnabled`, `EndpointType.PRIVATE`, `policy`, `CfnWebACLAssociation`; SST `sst.aws.ApiGatewayV1` without those.
- **Fix:**
  ```ts
  // CDK
  const api = new apigwv2.HttpApi(this, "Api");
  api.addRoutes({ path: "/orders/{id}", methods: [apigwv2.HttpMethod.GET],
    integration: new HttpLambdaIntegration("GetOrder", getOrderFn) });
  // SST
  const api = new sst.aws.ApiGatewayV2("Api");
  api.route("GET /orders/{id}", "src/orders.get");
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html ; https://aws.amazon.com/api-gateway/pricing/
- **Last verified:** 2026-10-12

### APIGW-002 — Keep backend work inside the integration timeout
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A synchronous API route must finish within its integration timeout: REST default 29 s (Regional/private APIs can raise it above 29 s through a Service Quotas request, which might require lowering the Region-level account throttle quota — the Terraform provider documents a 300,000 ms ceiling for `BUFFERED`; with `STREAM` response transfer mode the response can stream for up to 15 minutes, subject to a 5-minute idle timeout on Regional/private endpoints; edge-optimized integrations cannot exceed 29 s and stream with a 30 s idle timeout); HTTP API hard maximum 30 s. Longer work goes async.
- **Why:** When the backend exceeds the timeout, the client gets **504** but the Lambda keeps running and billing until its own timeout; clients retry and the work runs twice (double charges, duplicate orders).
- **Detect:** A Lambda behind a route with `timeout` > 29 s (REST) or > 30 s (HTTP): Terraform `aws_lambda_function.timeout = 60/120/900` referenced by `aws_api_gateway_integration`/`aws_apigatewayv2_integration`; CDK `timeout: Duration.minutes(2)` on a function passed to `LambdaIntegration`/`HttpLambdaIntegration`; SST `timeout: "2 minutes"` on a route handler (SST default is 20 s). Also `timeout_milliseconds` > 29000 on REST without `response_transfer_mode = "STREAM"` or an evident quota increase; handler code doing long synchronous work (report generation, `await Promise.all` over large batches, external calls with long timeouts).
- **Fix:** Return 202 with a job ID and process via SQS/Step Functions (→ `aws-messaging`); or, for REST Regional, stream: `response_transfer_mode = "STREAM"` + `timeout_milliseconds` (CDK `responseTransferMode: apigateway.ResponseTransferMode.STREAM`); set the Lambda timeout ≤ the integration timeout so failures surface as one error.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_integration
- **Last verified:** 2026-10-12

### APIGW-003 — Set stage or route throttling on every public API
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Give each stage (and hot or expensive routes) explicit rate and burst limits sized to what the backend can take.
- **Why:** Without them, one API can consume the account-wide 10,000 rps / 5,000 burst shared by every API in the Region, starving unrelated APIs with 429s, and a traffic spike passes straight to Lambda/DB (concurrency exhaustion, DB connection storms, bill spikes).
- **Detect:** Terraform `aws_api_gateway_method_settings` absent or `throttling_rate_limit = -1` (default), `aws_apigatewayv2_stage` without `default_route_settings { throttling_rate_limit … }`; CDK `RestApi` without `deployOptions.throttlingRateLimit`/`throttlingBurstLimit`, `HttpApi` stages without `throttle`; SST `ApiGatewayV2` without `transform: { stage: { defaultRouteSettings: … } }`.
- **Fix:**
  ```hcl
  resource "aws_apigatewayv2_stage" "prod" {
    api_id = aws_apigatewayv2_api.api.id  name = "$default"  auto_deploy = true
    default_route_settings { throttling_rate_limit = 200  throttling_burst_limit = 400 }
  }
  ```
  ```ts
  new sst.aws.ApiGatewayV2("Api", { transform: { stage: (args) => {
    args.defaultRouteSettings = { throttlingRateLimit: 200, throttlingBurstLimit: 400 }; } } });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html
- **Last verified:** 2026-10-12

### APIGW-004 — With REST authorizer caching on, return a policy that covers every method
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform, CDK
- **Rule:** When a REST Lambda authorizer caches (TTL > 0), its policy must allow every resource the token may call (e.g. `arn:…:{apiId}/{stage}/*/*`), not just `event.methodArn`; for per-method decisions, disable caching or add the method/path to the cache key (REQUEST authorizer identity sources).
- **Why:** The cache key is the token (TOKEN) or identity sources (REQUEST), not the route. The first call caches a policy allowing only `GET /orders`; the next call with the same token to `POST /cart` within the TTL is evaluated against that cached policy and gets **403 "User is not authorized to access this resource"** — intermittently, depending on which route was hit first.
- **Detect:** Authorizer code returning `Resource: event.methodArn` (TS) / `Resource: []string{event.MethodArn}` (Go, `events.APIGatewayCustomAuthorizerResponse`) combined with caching enabled: Terraform `aws_api_gateway_authorizer` with `authorizer_result_ttl_in_seconds` absent (default 300) or > 0; CDK `TokenAuthorizer`/`RequestAuthorizer` without `resultsCacheTtl: Duration.seconds(0)` (default 5 min).
- **Fix:**
  ```ts
  const [arnPrefix, stage] = event.methodArn.split("/");          // arn:aws:execute-api:region:acct:apiId , stage
  const resource = `${arnPrefix}/${stage}/*/*`;
  return { principalId: sub, policyDocument: { Version: "2012-10-17",
    Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: resource }] } };
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html ; https://repost.aws/knowledge-center/api-gateway-lambda-authorization-errors
- **Last verified:** 2026-10-12

### APIGW-005 — Scope HTTP API authorizer caching to the route when decisions differ per route
- **Severity:** high
- **Category:** security
- **Applies to:** TypeScript, Go, Terraform, CDK, SST
- **Rule:** An HTTP API Lambda authorizer with caching uses its identity sources as the cache key for **all** routes; if it allows or denies differently per route (admin vs user routes) add `$context.routeKey` to the identity sources or disable caching. Simple (`isAuthorized`) responses apply the cached allow/deny to every route.
- **Why:** A user who first calls an allowed route gets `isAuthorized: true` cached for their token; within the TTL they can call `/admin/*` routes the authorizer would have denied — privilege escalation. The reverse produces spurious 403s.
- **Detect:** Authorizer code that inspects `event.routeKey`, `event.rawPath`, `event.requestContext.http.path` or `routeArn` to decide, combined with caching: Terraform `aws_apigatewayv2_authorizer` with `authorizer_result_ttl_in_seconds` absent (default 300) or > 0 and `identity_sources` lacking `$context.routeKey`; CDK `HttpLambdaAuthorizer` (default `resultsCacheTtl` 5 min, `identitySource` `['$request.header.Authorization']`); SST `addAuthorizer({ lambda: { ttl: "300 seconds" } })`.
- **Fix:** `identity_sources = ["$request.header.Authorization", "$context.routeKey"]`; CDK `identitySource: ["$request.header.Authorization", "$context.routeKey"]`; or `resultsCacheTtl: Duration.seconds(0)`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_authorizer
- **Last verified:** 2026-10-12

### APIGW-006 — Cache authorizer results when the decision depends only on the token
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Route-independent token validation (JWT verify, session lookup) caches for a few minutes; or use the HTTP API native JWT authorizer, which needs no Lambda at all.
- **Why:** With caching off, every request also invokes the authorizer Lambda: 50 M requests/month adds 50 M invocations plus their duration and latency (and JWKS fetches) for a result that changes only when the token does. SST Lambda authorizers are not cached by default.
- **Detect:** Terraform `authorizer_result_ttl_in_seconds = 0`; CDK `resultsCacheTtl: Duration.seconds(0)`; SST `addAuthorizer({ lambda: { function: … } })` without `ttl`; a Lambda authorizer that only verifies a JWT from Cognito/Auth0/Clerk (`jose`, `jwtVerify`, `aws-jwt-verify`, Go `jwt.Parse`) on an HTTP API.
- **Fix:** HTTP API: `jwt` authorizer (`aws_apigatewayv2_authorizer` `authorizer_type = "JWT"`, CDK `HttpJwtAuthorizer`, SST `addAuthorizer({ jwt: { issuer, audiences } })`); otherwise TTL 300 with APIGW-004/005 respected.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html
- **Last verified:** 2026-10-12

### APIGW-007 — Include the caller's identity in REST cache keys for per-user responses
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** When REST API caching is on for a method whose response depends on the caller (or on query parameters), every such input is a cache key parameter; otherwise disable caching for that method. Require authorization for cache invalidation (`FAIL_WITH_403`).
- **Why:** API Gateway serves the cached response to any request with the same cache key values. A `GET /me` cached without the `Authorization` header in the key returns user A's profile to user B; `GET /users?type=admin&department=A` keyed only on `type` serves department A's data to department B. Without `InvalidateCache` authorization, any client can send `Cache-Control: max-age=0` and bypass the cache, driving load to the backend.
- **Detect:** Terraform `aws_api_gateway_method_settings` with `caching_enabled = true` (or stage `cache_cluster_enabled = true` with `method_path = "*/*"`) on methods that read the user from the authorizer/headers and `aws_api_gateway_integration.cache_key_parameters` missing `method.request.header.Authorization` (or the relevant query/path params); `require_authorization_for_cache_control` not `true`, or `unauthorized_cache_control_header_strategy` set to a `SUCCEED_*` value; CDK `deployOptions: { cachingEnabled: true }` / `methodOptions: { "/*/*": { cachingEnabled: true } }` without per-method `cacheKeyParameters`.
- **Fix:** Cache only public, user-independent GETs; add `cache_key_parameters = ["method.request.header.Authorization", "method.request.querystring.department"]` (and declare them in `request_parameters`); set `require_authorization_for_cache_control = true` and `unauthorized_cache_control_header_strategy = "FAIL_WITH_403"`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_settings
- **Last verified:** 2026-10-12

### APIGW-008 — Don't pay for a REST cache cluster you don't use
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Provision a stage cache only where a method actually caches with a meaningful TTL and hit rate; never in dev/preview stages by copy-paste.
- **Why:** The cache is billed per hour from the moment `cache_cluster_enabled = true`, even if no method has caching on, and is not in the Free Tier: 1.6 GB × $0.038/h × 730 = $27.74/month per stage; a 6.1 GB cache in five preview stages is several hundred dollars a month. Resizing wipes the cache.
- **Detect:** Terraform `aws_api_gateway_stage.cache_cluster_enabled = true` with no `aws_api_gateway_method_settings` `caching_enabled = true`, or `cache_ttl_in_seconds = 0`; CDK `deployOptions.cacheClusterEnabled: true` without `cachingEnabled`; cache enabled in stacks parametrized by stage name other than prod.
- **Fix:** Remove the cluster, or enable caching on specific GET methods with TTLs and watch `CacheHitCount`/`CacheMissCount`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html ; https://aws.amazon.com/api-gateway/pricing/
- **Last verified:** 2026-10-12

### APIGW-009 — Restrict CORS origins on credentialed or authenticated APIs
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, SST, TypeScript
- **Rule:** APIs called from browsers with cookies or tokens list their exact origins; `allowOrigins: ["*"]` is for public, unauthenticated data only, and is never combined with `allowCredentials: true`.
- **Why:** Browsers reject `Access-Control-Allow-Origin: *` with credentials, so a wildcard + credentials config breaks the frontend in production; reflecting any origin with credentials (a common "fix") lets any website make authenticated calls on behalf of a logged-in user. SST `ApiGatewayV2` enables CORS with `allowOrigins: ["*"]` by default.
- **Detect:** Terraform `cors_configuration { allow_origins = ["*"]  allow_credentials = true }`; CDK `corsPreflight: { allowOrigins: ["*"], allowCredentials: true }`, `defaultCorsPreflightOptions: { allowOrigins: apigateway.Cors.ALL_ORIGINS, allowCredentials: true }`; SST `new sst.aws.ApiGatewayV2("Api")` with no `cors` while routes use `auth` or cookies; handler code echoing `event.headers.origin` into `Access-Control-Allow-Origin` with `Access-Control-Allow-Credentials: true`.
- **Fix:**
  ```ts
  new sst.aws.ApiGatewayV2("Api", { cors: { allowOrigins: ["https://app.example.com"], allowCredentials: true } });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html ; https://sst.dev/docs/component/aws/apigatewayv2/
- **Last verified:** 2026-10-12

### APIGW-010 — Configure CORS in one place for HTTP APIs
- **Severity:** low
- **Category:** simplicity
- **Applies to:** TypeScript, Go, Terraform, CDK, SST
- **Rule:** When an HTTP API has a CORS configuration, delete the CORS headers and `OPTIONS` handlers in the Lambda code: API Gateway answers preflights itself and ignores CORS headers returned by integrations.
- **Why:** Duplicate CORS logic in handlers is dead code that misleads readers ("we allow origin X") while the API config decides; teams debug the wrong layer.
- **Detect:** `cors_configuration` / `corsPreflight` / SST `cors` (default on) present, and handlers set `"Access-Control-Allow-Origin"`, `Access-Control-Allow-Methods` or branch on `event.requestContext.http.method === "OPTIONS"` (Go `request.RequestContext.HTTP.Method == "OPTIONS"`).
- **Fix:** Remove the headers/branches from handlers; keep the API-level config.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html
- **Last verified:** 2026-10-12

### APIGW-011 — Let CORS preflight through when `$default` or `ANY /{proxy+}` has an authorizer
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** If an HTTP API's `$default` (or `ANY /{proxy+}`) route requires authorization and browsers call it, add an unauthenticated `OPTIONS /{proxy+}` route (with an integration), or enable API-level CORS so preflights never reach the authorizer.
- **Why:** Browsers send preflight `OPTIONS` without the `Authorization` header; the catch-all route's authorizer rejects it with 401 and every cross-origin call fails in the browser while curl tests pass.
- **Detect:** Terraform `aws_apigatewayv2_route` with `route_key = "$default"` or `"ANY /{proxy+}"` and `authorization_type` `JWT`/`CUSTOM`, no `OPTIONS /{proxy+}` route and no `cors_configuration`; CDK `HttpApi` with `defaultAuthorizer` and `defaultIntegration`/proxy routes, `corsPreflight` absent; SST `cors: false` with `api.route("$default", …, { auth })`.
- **Fix:** Add `route_key = "OPTIONS /{proxy+}"` with `authorization_type = "NONE"`, or configure `cors_configuration`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html
- **Last verified:** 2026-10-12

### APIGW-012 — Send large uploads and downloads through S3, not API Gateway
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform, CDK
- **Rule:** Payloads that can exceed API Gateway's 10 MB limit (and a Lambda proxy's 6 MB synchronous payload) go through S3 presigned URLs; the API returns the URL.
- **Why:** Uploads above the limit fail with 413 at the gateway; base64-encoded binaries inflate ~33 %, so a 5 MB file already breaks a Lambda proxy. HTTP API also meters in 512 KB increments, so big bodies are billed as multiple requests.
- **Detect:** Handlers parsing `multipart/form-data`, `Buffer.from(event.body, "base64")`, `isBase64Encoded`, Go `base64.StdEncoding.DecodeString(req.Body)` to then `PutObject`; `binary_media_types`/`binaryMediaTypes` set for file types; responses returning file contents.
- **Fix:**
  ```ts
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn: 300 });
  return { statusCode: 200, body: JSON.stringify({ url }) };
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html ; https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html ; https://aws.amazon.com/api-gateway/pricing/
- **Last verified:** 2026-10-12

### APIGW-013 — Choose the REST endpoint type deliberately (CDK defaults to edge-optimized)
- **Severity:** low
- **Category:** performance
- **Applies to:** CDK, Terraform
- **Rule:** Use `REGIONAL` for REST APIs called from the same Region, from your own CloudFront distribution, or that need an integration timeout above 29 s; use `EDGE` only for geographically spread clients without your own CDN.
- **Why:** CDK `RestApi` defaults to `EndpointType.EDGE`. Putting your own CloudFront in front of an edge-optimized API double-hops through CloudFront, edge-optimized APIs capitalize header names and reorder cookies, cannot raise the 29 s integration timeout, and have a 30 s idle timeout for streaming.
- **Detect:** CDK `new apigateway.RestApi(`/`LambdaRestApi(` without `endpointTypes` (or `EndpointType.EDGE`) where a `cloudfront.Distribution` uses it as origin or callers are internal; Terraform `endpoint_configuration { types = ["EDGE"] }` (or absent: Terraform defaults to EDGE) in the same situation.
- **Fix:** `endpointTypes: [apigateway.EndpointType.REGIONAL]`; Terraform `endpoint_configuration { types = ["REGIONAL"] }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-endpoint-types.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway.RestApi.html
- **Last verified:** 2026-10-12

### APIGW-014 — Disable the default execute-api endpoint behind a custom domain
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** When clients must come through a custom domain (mTLS, WAF on CloudFront, domain-level access logging), set `disable_execute_api_endpoint = true`.
- **Why:** The `{id}.execute-api.{region}.amazonaws.com` URL stays live by default; anyone who learns it skips the mTLS truststore or the CloudFront WAF in front of the domain.
- **Detect:** `aws_api_gateway_domain_name`/`aws_apigatewayv2_domain_name` with `mutual_tls_authentication`, or a CloudFront origin pointing at the API, while the API lacks `disable_execute_api_endpoint = true`; CDK `domainName`/`mtls` without `disableExecuteApiEndpoint: true`; SST `domain:` without `transform.api.disableExecuteApiEndpoint`.
- **Fix:** `disable_execute_api_endpoint = true`; CDK `disableExecuteApiEndpoint: true`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-disable-default-endpoint.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html
- **Last verified:** 2026-10-12

### APIGW-015 — Don't use API keys as authorization
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript
- **Rule:** API keys identify clients for usage plans; access control comes from IAM, a Lambda authorizer, Cognito or JWT. Usage-plan quotas are best-effort and don't cap cost.
- **Why:** A key valid for one API in a usage plan works on every API in that plan; keys travel in headers that get logged; usage plans can be exceeded, so they are not a spend or abuse control.
- **Detect:** Terraform `aws_api_gateway_method` with `api_key_required = true` and `authorization = "NONE"`; CDK `apiKeyRequired: true` with no `authorizer`/`authorizationType`; handlers trusting `event.requestContext.identity.apiKey` as the user identity.
- **Fix:** Add an authorizer (`authorization = "CUSTOM"` / `"COGNITO_USER_POOLS"` / `"AWS_IAM"`); keep keys only for metering. Use WAF rate rules and AWS Budgets for abuse and cost.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html
- **Last verified:** 2026-10-12

### APIGW-016 — Use a direct service integration instead of a pass-through Lambda
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Routes whose Lambda only forwards the body to SQS, EventBridge, Kinesis, Step Functions or AppConfig use an API Gateway AWS service integration instead.
- **Why:** The glue Lambda adds cold starts, an invocation charge per request, an IAM role, code and tests — for a call API Gateway makes natively (HTTP API first-class integrations: `SQS-SendMessage`, `EventBridge-PutEvents`, `StepFunctions-StartExecution`, …).
- **Detect:** Handlers whose whole body is `await sqs.send(new SendMessageCommand({ QueueUrl, MessageBody: event.body }))`, `PutEventsCommand`, `StartExecutionCommand` (Go `sqs.SendMessage`, `eventbridge.PutEvents`, `sfn.StartExecution`) followed by a fixed 200/202.
- **Fix:**
  ```hcl
  resource "aws_apigatewayv2_integration" "enqueue" {
    api_id = aws_apigatewayv2_api.api.id  integration_type = "AWS_PROXY"
    integration_subtype = "SQS-SendMessage"  credentials_arn = aws_iam_role.apigw_sqs.arn
    request_parameters = { QueueUrl = aws_sqs_queue.jobs.url, MessageBody = "$request.body" }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services.html
- **Last verified:** 2026-10-12

### APIGW-017 — Give Lambda authorizers identity sources so missing credentials fail fast
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** REQUEST-type Lambda authorizers declare identity sources (e.g. the `Authorization` header) so API Gateway rejects requests lacking them with 401 without invoking the Lambda. On HTTP APIs this happens whenever identity sources are set; on REST APIs only while authorizer caching is on (TTL > 0). HTTP API caching requires at least one identity source.
- **Why:** Without identity sources every anonymous or bot request invokes the authorizer Lambda just to say no, and HTTP API authorizer caching cannot be turned on.
- **Detect:** Terraform `aws_apigatewayv2_authorizer` (`REQUEST`) or `aws_api_gateway_authorizer` (`type = "REQUEST"`) with `identity_sources`/`identity_source` empty or absent; CDK `RequestAuthorizer` with `identitySources: []`.
- **Fix:** `identity_sources = ["$request.header.Authorization"]`. Don't set identity sources only if the function itself must return 401 for missing headers.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html ; https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html
- **Last verified:** 2026-10-12

### APIGW-018 — Redeploy REST APIs in Terraform when their configuration changes
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** Every `aws_api_gateway_deployment` has a `triggers` map hashing the resources that define the API (methods, integrations, authorizers, the `body`), plus `lifecycle { create_before_destroy = true }`.
- **Why:** A REST API change is live only after a new deployment. A deployment resource with no `triggers` (or only `depends_on`) is created once; later edits to methods, integrations or authorizers apply cleanly in Terraform but the stage keeps serving the old deployment — fixes "ship" and nothing changes, or a new route returns 403 `Missing Authentication Token`. Without `create_before_destroy`, recreation fails with `BadRequestException: Active stages pointing to this deployment must be moved or deleted`.
- **Detect:** `resource "aws_api_gateway_deployment"` without `triggers`, or with `triggers` that omit resources added in the diff (new `aws_api_gateway_method`/`aws_api_gateway_integration` not referenced); `depends_on` used instead of `triggers`; no `create_before_destroy`.
- **Fix:**
  ```hcl
  resource "aws_api_gateway_deployment" "this" {
    rest_api_id = aws_api_gateway_rest_api.api.id
    triggers = {
      redeployment = sha1(jsonencode([
        aws_api_gateway_resource.orders.id, aws_api_gateway_method.orders_post.id,
        aws_api_gateway_integration.orders_post.id, aws_api_gateway_authorizer.jwt.id,
      ]))
    }
    lifecycle { create_before_destroy = true }
  }
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_deployment
- **Last verified:** 2026-10-12
