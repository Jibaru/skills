# Managed services: APIs, workflows, secrets, keys, queues

Prices below are us-east-1 as verified on 2026-10-12. Confirm them live before quoting.
Reference prices: API Gateway REST $3.50 per million (first 333M), HTTP API $1.00 per million
(first 300M); Step Functions Standard $0.000025 per state transition (4,000 free/month),
Express $1.00 per million executions + $0.00001667 per GB-s (64 MB memory chunks, 100 ms
rounding); Secrets Manager $0.40 per secret-month + $0.05 per 10,000 API calls; Parameter
Store standard parameters and standard-throughput calls free, advanced $0.05/parameter-month;
KMS $1/customer managed key-month (+$1 for each of the first two rotations), $0.03 per 10,000
requests (20,000 free/month), AWS managed keys free to store. SQS: first 1M requests/month free;
every 64 KB chunk is one request; read the per-million rate live (the table renders
dynamically). Kinesis Data Streams on-demand standard $0.04 per stream-hour + $0.08/GB in,
$0.04/GB out; provisioned $0.015 per shard-hour + $0.014 per million PUT payload units.

### COST-059 — Prefer HTTP APIs when REST-only features are unused
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** New API Gateway APIs are HTTP APIs unless they need a REST-only feature: API keys/usage plans, per-client throttling, request validation, AWS WAF, caching, private endpoints, edge-optimized endpoints, X-Ray, request body transforms, mock integrations or response streaming.
- **Why:** HTTP APIs cost $1.00 per million vs $3.50 for REST: at 100M requests/month that is $350 → $100, saving $250/month.
- **Detect:** Terraform `aws_api_gateway_rest_api` with only `AWS_PROXY` Lambda integrations and no `aws_api_gateway_usage_plan`, `aws_wafv2_web_acl_association`, `cache_cluster_enabled`, `request_validator_id`; CDK `new apigw.LambdaRestApi(` / `RestApi` with plain proxy methods; SST `sst.aws.ApiGatewayV1` without `apiKey`/usage plans.
- **Fix:** CDK `new apigwv2.HttpApi(this, "Api", { defaultIntegration: new HttpLambdaIntegration("Fn", fn) })`; Terraform `aws_apigatewayv2_api { protocol_type = "HTTP" }`; SST `sst.aws.ApiGatewayV2`. Mind payload format v2 and JWT authorizers when migrating (hand off to `aws-networking`).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/api-gateway/pricing/ ; https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html
- **Last verified:** 2026-10-12

### COST-060 — Use Express workflows for high-volume, short, idempotent work
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** State machines that run under 5 minutes at high volume, with idempotent steps and no `.sync`/`.waitForTaskToken`, are `EXPRESS`; Standard is for long-running, exactly-once or callback workflows.
- **Why:** Standard bills every transition: 10M executions × 10 transitions × $0.000025 = $2,500/month. Express for the same, at 64 MB and 500 ms: $10 requests + 0.0625 GB × 0.5 s × 10M × $0.00001667 ≈ $5.21 → ~$15/month. The type cannot be changed after creation.
- **Detect:** Terraform `aws_sfn_state_machine` without `type` (default `STANDARD`) started per API request or per event; CDK `new sfn.StateMachine(` without `stateMachineType` (default STANDARD) invoked from API Gateway / EventBridge on every event; TS `StartExecutionCommand` / `StartSyncExecutionCommand` in a request handler; Go `sfn.StartExecution` per message.
- **Fix:** `type = "EXPRESS"` / `stateMachineType: sfn.StateMachineType.EXPRESS` with logging to CloudWatch (Express has no execution history); keep Standard for payments and other non-idempotent steps. Hand off semantics to `aws-messaging`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/step-functions/pricing/ ; https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sfn_state_machine
- **Last verified:** 2026-10-12

### COST-061 — Do not poll inside Standard workflows
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Standard workflows wait for jobs with `.sync` or `.waitForTaskToken` integrations, not `Wait` → `Task(GetStatus)` → `Choice` loops with short intervals.
- **Why:** Each loop iteration is ~3 billed transitions: polling every 10 s for a 1-hour job is ~1,080 transitions = $0.027 per execution; at 100k executions/month that is $2,700/month spent asking "done yet?".
- **Detect:** ASL with a `Wait` state (`Seconds` ≤ 30) whose `Next` leads to a `Task` calling `Describe*`/`Get*Status` and a `Choice` looping back; CDK `new sfn.Wait(this, ..., { time: sfn.WaitTime.duration(Duration.seconds(10)) })` in a loop.
- **Fix:** Use `arn:aws:states:::ecs:runTask.sync`, `glue:startJobRun.sync`, `batch:submitJob.sync`, or a task token callback; if polling is unavoidable, lengthen the interval.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html ; https://aws.amazon.com/step-functions/pricing/
- **Last verified:** 2026-10-12

### COST-062 — Cache secrets and parameters; never fetch them per invocation
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Secrets and parameters are fetched once per execution environment (module scope with TTL, Powertools Parameters, or the AWS Parameters and Secrets Lambda Extension), not inside the handler on every call.
- **Why:** Secrets Manager charges $0.05 per 10,000 calls: 50M invocations/month fetching one secret each = $250/month, plus added latency and throttling risk; cached with a 5-minute TTL it is a few dollars.
- **Detect:** TS `await client.send(new GetSecretValueCommand(` or `GetParameterCommand(` inside `export const handler = async` body; Go `secretsmanager.GetSecretValue(ctx,` / `ssm.GetParameter(ctx,` inside the handler func rather than in `init()` / `sync.Once` / a cached loader.
- **Fix:**
  ```ts
  import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
  export const handler = async () => {
    const apiKey = await getSecret("prod/api-key", { maxAge: 300 }); // cached across invocations
  };
  ```
  Go: load in a `sync.Once` or a struct field with expiry. With SST, prefer `sst.Secret` + `link` (value injected at deploy) for static secrets.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/secrets-manager/pricing/ ; https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html ; https://docs.aws.amazon.com/powertools/typescript/latest/features/parameters/
- **Last verified:** 2026-10-12

### COST-063 — Store non-secret configuration in Parameter Store standard
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Feature flags, URLs, ARNs and other non-sensitive config live in SSM Parameter Store standard parameters (or env vars), not in Secrets Manager.
- **Why:** Each secret is $0.40/month; standard parameters are free. 200 config values as secrets = $80/month for nothing secret.
- **Detect:** `aws_secretsmanager_secret` with names like `*url*`, `*endpoint*`, `*bucket*`, `*flag*`, `*config*`; `aws_secretsmanager_secret_version` storing non-sensitive JSON; CDK `new secretsmanager.Secret(` with `secretStringValue: SecretValue.unsafePlainText("https://...")`.
- **Fix:** `aws_ssm_parameter { type = "String" tier = "Standard" }` / CDK `new ssm.StringParameter(`; keep rotation-requiring credentials in Secrets Manager.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/secrets-manager/pricing/ ; https://aws.amazon.com/systems-manager/pricing/
- **Last verified:** 2026-10-12

### COST-064 — Do not mint a secret or a CMK per tenant, user or token
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Per-entity credentials are stored in a database encrypted with one key (envelope encryption), not as one Secrets Manager secret or one KMS key per tenant/user/session.
- **Why:** Cost scales with entity count: 10,000 tenants × $0.40 = $4,000/month in secrets; 1,000 tenant KMS keys × $1 = $1,000/month (up to $3/key with rotations). AWS's own example of 5M ephemeral secrets is $2,850/month.
- **Detect:** TS `new CreateSecretCommand(` / Go `secretsmanager.CreateSecret(` in signup/onboarding code; `CreateKeyCommand` / `kms.CreateKey` per tenant; Terraform `aws_secretsmanager_secret` / `aws_kms_key` with `for_each = var.tenants`.
- **Fix:** One KMS key per environment or data class; per-tenant isolation via encryption context and IAM conditions; store ciphertext in DynamoDB/RDS. Hand off isolation design to `aws-security`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/secrets-manager/pricing/ ; https://aws.amazon.com/kms/pricing/
- **Last verified:** 2026-10-12

### COST-065 — Enable S3 Bucket Keys on SSE-KMS buckets
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Buckets using SSE-KMS set `bucket_key_enabled = true`.
- **Why:** Without a bucket key, every object PUT/GET calls KMS ($0.03 per 10,000). 300M object reads/month = $900/month in KMS requests; bucket keys cut that by up to 99%.
- **Detect:** `aws_s3_bucket_server_side_encryption_configuration` with `sse_algorithm = "aws:kms"` and no `bucket_key_enabled = true`; CDK `encryption: s3.BucketEncryption.KMS` with `bucketKeyEnabled` unset/false.
- **Fix:** `bucket_key_enabled = true` / `bucketKeyEnabled: true`. Existing objects keep per-object keys until copied; update key policies that condition on object ARN encryption context.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html ; https://aws.amazon.com/kms/pricing/
- **Last verified:** 2026-10-12

### COST-066 — Reuse data keys instead of calling KMS per item
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Code encrypting/decrypting many items uses envelope encryption with cached data keys (AWS Encryption SDK caching or a reused decrypted data key), not `kms:Encrypt`/`Decrypt` per record.
- **Why:** 100M records/month each calling KMS = 10,000 × $0.03 = $300/month, plus KMS request-rate throttling under load.
- **Detect:** TS `await kms.send(new DecryptCommand(` / `EncryptCommand(` inside a loop over records or in a per-message handler; Go `kmsClient.Decrypt(ctx, ...)` per message in a consumer loop.
- **Fix:** `GenerateDataKey` once, encrypt locally with AES-GCM, store the encrypted data key with the batch; or AWS Encryption SDK with a caching CMM (bounded by max age/messages).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/kms/pricing/ ; https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/data-key-caching.html
- **Last verified:** 2026-10-12

### COST-067 — Use AWS managed keys unless a CMK buys you something
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** A customer managed key is created when you need its key policy, cross-account use, or audit separation; otherwise the AWS managed/owned key is used.
- **Why:** Each CMK is $1/month plus $1 for each of the first two rotations; dozens of per-resource keys in every stage add up, and each adds request cost paths.
- **Detect:** `aws_kms_key` per bucket/table/queue/log group in every stage; CDK `new kms.Key(` inside constructs instantiated many times; `encryption: TableEncryptionV2.customerManagedKey(new kms.Key(...))` in dev.
- **Fix:** Share one CMK per environment/data class where a CMK is required; use AWS owned/managed encryption elsewhere. Hand off the security decision to `aws-security`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/kms/pricing/ ; https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html
- **Last verified:** 2026-10-12

### COST-068 — Long-poll SQS consumers
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Custom SQS consumers use long polling (20 s wait) and batch receives/deletes (up to 10 messages).
- **Why:** Short polling returns immediately, so idle consumers bill a request per empty receive: a loop calling `ReceiveMessage` 5×/s per worker is ~13M requests/month per worker with zero messages. Every 64 KB chunk is also one request, so batching small messages cuts requests further.
- **Detect:** Terraform `aws_sqs_queue` without `receive_wait_time_seconds` (default 0) used by custom pollers; CDK `receiveMessageWaitTime` unset; TS `ReceiveMessageCommand({ QueueUrl })` without `WaitTimeSeconds`/`MaxNumberOfMessages`; Go `sqs.ReceiveMessageInput{}` without `WaitTimeSeconds: 20`; `DeleteMessage` per message instead of `DeleteMessageBatch`.
- **Fix:** `receive_wait_time_seconds = 20`; `WaitTimeSeconds: 20, MaxNumberOfMessages: 10`; `DeleteMessageBatch`. Lambda event source mappings already long-poll. Hand off consumer semantics to `aws-messaging`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html ; https://aws.amazon.com/sqs/pricing/
- **Last verified:** 2026-10-12

### COST-069 — Enable API Gateway caching only where hit rate pays for the cluster
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** REST API stage caches are enabled per stage with a measured hit rate; never on dev stages by copy-paste.
- **Why:** The cache bills hourly for its size even at zero hits (e.g. 1.6 GB at $0.038/h × 730 ≈ $27.74/month per stage; sizes are 0.5, 1.6, 6.1, 13.5, 28.4, 58.2, 118 and 237 GB); it pays off only if it avoids more backend cost than that.
- **Detect:** `aws_api_gateway_stage` `cache_cluster_enabled = true` with large `cache_cluster_size` in non-prod; CDK `deployOptions: { cachingEnabled: true, cacheClusterEnabled: true }` in all stages.
- **Fix:** Enable only on production stages with cacheable GETs; size from measured hit rate; or cache in CloudFront instead.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/api-gateway/pricing/ ; https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html
- **Last verified:** 2026-10-12

### COST-079 — Do not run tiny Kinesis streams in on-demand mode
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Low, steady-throughput streams (well under 1 MB/s or 1,000 records/s per shard), especially in dev/preview stages, use provisioned mode with one or few shards; on-demand is for spiky or unknown traffic.
- **Why:** On-demand standard bills $0.04 per stream-hour before any data: $29.20/month per stream, versus $0.015 × 730 = $10.95/month for one provisioned shard (plus $0.014 per million PUT payload units). Ten dev streams on on-demand cost ~$182.50/month more in fixed charges alone.
- **Detect:** Terraform `aws_kinesis_stream` with `stream_mode_details { stream_mode = "ON_DEMAND" }` in non-prod or for streams whose producers are a single low-rate job; CDK `new kinesis.Stream(` with `streamMode: kinesis.StreamMode.ON_DEMAND` (CDK default is `PROVISIONED` with 1 shard).
- **Fix:** `stream_mode_details { stream_mode = "PROVISIONED" }` + `shard_count = 1` (CDK `streamMode: kinesis.StreamMode.PROVISIONED, shardCount: 1`) for small steady streams; keep on-demand where traffic is spiky and show the arithmetic both ways. Hand off stream semantics to `aws-messaging`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/kinesis/data-streams/pricing/ ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kinesis_stream ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kinesis.Stream.html
- **Last verified:** 2026-10-12
