# Secrets: storage, delivery, rotation and leakage

Where secrets live (Secrets Manager, Parameter Store SecureString, SST Secret), how they reach
code, how they rotate, and how they leak (env vars, templates, Terraform state, logs, outputs).
Prices: Secrets Manager $0.40 per secret/month and $0.05 per 10,000 API calls; Parameter Store
standard parameters and standard throughput are free, advanced parameters $0.05/month, higher
throughput $0.05 per 10,000 interactions. Confirm live on the pricing pages in the Sources.

### SEC-001 — Keep secret values out of Lambda and container environment variables
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Pass a secret's name or ARN in the environment and fetch the value at runtime; never put the value itself in `environment`.
- **Why:** Env var values are returned by `lambda:GetFunctionConfiguration` / `ecs:DescribeTaskDefinition` to anyone with read access, appear in the console, the CloudFormation template, the Terraform state and plan, and are never rotated with the secret. AWS recommends Secrets Manager over env vars for database credentials.
- **Detect:** Terraform `environment { variables = { DB_PASSWORD = ..., API_KEY = ... } }` fed by a variable, `random_password.*.result`, or `data.aws_secretsmanager_secret_version.*.secret_string`; CDK `environment: { X: secret.secretValue.unsafeUnwrap() }` or `secretValueFromJson('password').unsafeUnwrap()` or `StringParameter.valueForStringParameter` of a secret; SST `environment: { STRIPE_KEY: ... }` with a literal or `secret.value`; keys named `*PASSWORD*`, `*SECRET*`, `*TOKEN*`, `*API_KEY*`, `*PRIVATE_KEY*`.
- **Fix:** CDK:
  ```ts
  const fn = new lambda.Function(this, 'Fn', { /* ... */ environment: { DB_SECRET_ARN: dbSecret.secretArn } });
  dbSecret.grantRead(fn);
  ```
  then read it with the Parameters and Secrets extension or Powertools (SEC-007). SST: `link: [secret]` (SEC-015). ECS: `secrets` (SEC-014).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars-encryption.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/ecs-controls.html
- **Last verified:** 2026-10-12

### SEC-002 — Remove secret literals from source and IaC
- **Severity:** critical
- **Category:** security
- **Applies to:** TypeScript, Go, Terraform, CDK, SST
- **Rule:** No passwords, API keys, tokens, private keys or connection strings with credentials as literals in code, IaC, committed `.env`/`tfvars`, or test fixtures that hit real systems.
- **Why:** Git history is forever: a literal pushed once must be treated as compromised and rotated even after removal.
- **Detect:** Literals matching `sk_live_`, `xox[baprs]-`, `ghp_`, `-----BEGIN (RSA |EC )?PRIVATE KEY-----`, `postgres://[^:]+:[^@]+@`, `password\s*[:=]\s*["'][^"']+["']`; Terraform `password = "…"`, `default = "…"` on variables named `*password*`/`*secret*`, `*.tfvars` with secret values committed.
- **Fix:** Rotate the exposed credential, store it in Secrets Manager (or `sst secret set`), and reference it by ARN/name; add a secret scanner to CI.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html
- **Last verified:** 2026-10-12

### SEC-003 — Keep secrets out of Terraform state and plans
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform
- **Rule:** Use write-only arguments (`password_wo`, `secret_string_wo`, `value_wo`, `auth_token_wo` with their `*_wo_version`), ephemeral resources, or service-managed passwords instead of arguments and data sources that persist values in state.
- **Why:** `sensitive = true` only hides values in CLI output; the state file (and saved plan) still holds them in plaintext, readable by anyone with access to the state bucket. Write-only arguments need Terraform 1.11+.
- **Detect:** `aws_db_instance`/`aws_rds_cluster` with `password =` / `master_password =`; `aws_secretsmanager_secret_version` with `secret_string =`; `aws_ssm_parameter` `type = "SecureString"` with `value =`; `data "aws_secretsmanager_secret_version"` used to read a secret into another resource; `random_password` feeding any of these; `aws_elasticache_replication_group` `auth_token =`.
- **Fix:**
  ```hcl
  ephemeral "random_password" "db" { length = 32 }
  resource "aws_secretsmanager_secret_version" "db" {
    secret_id                = aws_secretsmanager_secret.db.id
    secret_string_wo         = ephemeral.random_password.db.result
    secret_string_wo_version = 1
  }
  ```
  For RDS prefer `manage_master_user_password = true` (SEC-005).
- **Volatile:** yes
- **Source:** https://developer.hashicorp.com/terraform/language/manage-sensitive-data/write-only ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret_version ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/ephemeral-resources/secretsmanager_secret_version
- **Last verified:** 2026-10-12

### SEC-004 — Do not use SecretValue.unsafePlainText or unwrap secrets into plain props in CDK
- **Severity:** high
- **Category:** security
- **Applies to:** CDK
- **Rule:** Use `SecretValue.secretsManager()`/`ssmSecure()` or construct-level secrets (`Credentials.fromGeneratedSecret`); call `unsafeUnwrap()` only when the receiving prop is itself a secret-aware CloudFormation field.
- **Why:** `unsafePlainText` writes the value into the synthesized template, visible to anyone with CloudFormation read access and in `cdk.out`. `unsafeUnwrap()` into an env var, tag, output or `CfnParameter` default leaks the resolved value into the deployed resource.
- **Detect:** `SecretValue.unsafePlainText(`; `.unsafeUnwrap()` in `environment`, `tags`, `CfnOutput`, `description`, `userData`, `containerDefinitions.environment`; `rds.Credentials.fromPassword('admin', SecretValue.unsafePlainText(`.
- **Fix:** `rds.Credentials.fromGeneratedSecret('app_admin')`; pass `secret.secretArn` and `secret.grantRead(fn)`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.SecretValue.html
- **Last verified:** 2026-10-12

### SEC-005 — Let RDS manage the master password in Secrets Manager
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** RDS and Aurora master credentials should be generated and stored by the service (`manage_master_user_password = true`) or by CDK's generated secret, never passed as a variable.
- **Why:** A variable password lives in tfvars, CI secrets and state, and is rarely rotated. With the managed option, Secrets Manager holds and rotates it (every 7 days by default).
- **Detect:** Terraform `aws_db_instance` / `aws_rds_cluster` with `password`/`master_password` and without `manage_master_user_password = true`; CDK `credentials: rds.Credentials.fromPassword(` or `fromUsername(..., { password: ... })`.
- **Fix:** Terraform `manage_master_user_password = true` (remove `password`); CDK default `credentials` (generated secret) or `rds.Credentials.fromGeneratedSecret('app_admin')`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html
- **Last verified:** 2026-10-12

### SEC-006 — Turn on rotation for secrets that hold credentials
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Database passwords and AWS-rotatable credentials in Secrets Manager need a rotation schedule; third-party API keys need a documented rotation runbook if they cannot rotate automatically.
- **Why:** Long-lived secrets are more likely to be compromised and their exposure window is unbounded. Security Hub SecretsManager.1 and .4. Rotation can run as often as every four hours.
- **Detect:** `aws_secretsmanager_secret` for DB credentials without `aws_secretsmanager_secret_rotation`; CDK `new secretsmanager.Secret` / `DatabaseInstance` without `addRotationSchedule`, `addRotationSingleUser()` or `addRotationMultiUser()`.
- **Fix:** CDK `db.addRotationSingleUser()`; Terraform `aws_secretsmanager_secret_rotation` with `rotation_rules { automatically_after_days = 30 }`. Pair with SEC-011 so cached readers survive rotation.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html ; https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html ; https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_schedule.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/secretsmanager-controls.html
- **Last verified:** 2026-10-12

### SEC-007 — Cache secrets instead of calling GetSecretValue on every request
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Fetch secrets through a cache: the AWS Parameters and Secrets Lambda Extension, Powertools Parameters (`getSecret`), or `aws-secretsmanager-caching-go`; create SDK clients once, outside the handler.
- **Why:** One `GetSecretValue` per invocation adds a network round trip to every request and costs $0.05 per 10,000 calls: 10 M invocations/month × 1 secret = 10,000,000 / 10,000 × $0.05 = $50/month per secret, multiplied by every secret and environment, and it couples availability to Secrets Manager throttling.
- **Detect:** TS `new GetSecretValueCommand(` or `new GetParameterCommand({ WithDecryption: true` executed inside `export const handler` (or a function it calls per request) with no module-level cache; `new SecretsManagerClient(` inside the handler. Go `client.GetSecretValue(ctx,` inside the handler func without `secretcache`.
- **Fix:** TS:
  ```ts
  import { getSecret } from '@aws-lambda-powertools/parameters/secrets';
  export const handler = async () => {
    const apiKey = await getSecret(process.env.API_KEY_SECRET!, { maxAge: 300 });
  };
  ```
  Go:
  ```go
  var cache, _ = secretcache.New() // package level
  func handle(ctx context.Context) error { v, err := cache.GetSecretStringWithContext(ctx, secretID); _ = v; return err }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html ; https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_cache-go.html ; https://aws.amazon.com/secrets-manager/pricing/
- **Last verified:** 2026-10-12

### SEC-008 — Raise the Powertools cache TTL above its 5-second default
- **Severity:** low
- **Category:** performance
- **Applies to:** TypeScript
- **Rule:** Set `maxAge` (or `POWERTOOLS_PARAMETERS_MAX_AGE`) to minutes for secrets and parameters that change rarely.
- **Why:** The default TTL is 5 seconds, so a busy function still calls Secrets Manager or SSM roughly every 5 seconds per execution environment, keeping most of the latency and cost SEC-007 meant to remove.
- **Detect:** `getSecret(`, `getParameter(`, `getParameters(` from `@aws-lambda-powertools/parameters/*` without `maxAge` and with no `POWERTOOLS_PARAMETERS_MAX_AGE` in the function's environment.
- **Fix:** `await getSecret(name, { maxAge: 300 })`, or set `POWERTOOLS_PARAMETERS_MAX_AGE=300` on the function.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/powertools/typescript/latest/features/parameters/
- **Last verified:** 2026-10-12

### SEC-009 — Use Parameter Store SecureString for static secrets that never rotate
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Choose Secrets Manager for secrets that need rotation, cross-account sharing, replication or resource policies; static config-like secrets (a webhook signing key changed by hand once a year) can live in Parameter Store `SecureString` (standard tier).
- **Why:** Secrets Manager charges $0.40 per secret per month: 50 static values × 4 environments = 200 secrets × $0.40 = $80/month, versus no storage charge for standard parameters. Standard parameters cap values at 4 KB and 10,000 per Region; above standard throughput, interactions cost $0.05 per 10,000.
- **Detect:** Many `aws_secretsmanager_secret` / `new secretsmanager.Secret` with no rotation, no resource policy, no replica, holding single short strings; one secret per config key.
- **Fix:** Either group related values into one JSON secret, or move static ones to `aws_ssm_parameter { type = "SecureString" }` (with `value_wo`, see SEC-003). Keep database credentials in Secrets Manager.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/secrets-manager/pricing/ ; https://aws.amazon.com/systems-manager/pricing/ ; https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html
- **Last verified:** 2026-10-12

### SEC-010 — Call the Parameters and Secrets extension correctly
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Requests to `http://localhost:2773` must send `X-Aws-Parameters-Secrets-Token` with the session token resolved from the SDK credential chain inside the handler, URL-encode parameter names, and pass `withDecryption=true` for SecureString.
- **Why:** Reading only `process.env.AWS_SESSION_TOKEN` fails where Lambda does not set it (SnapStart), returning errors on cold paths; unencoded `/a/b/c` names hit the wrong path; missing `withDecryption` returns ciphertext that then fails as a password.
- **Detect:** `fetch('http://localhost:2773/` / `http.Get("http://localhost:2773/` with header from `process.env.AWS_SESSION_TOKEN` / `os.Getenv("AWS_SESSION_TOKEN")`, token read at module init, `name=/` unencoded, SecureString fetched without `withDecryption=true`.
- **Fix:**
  ```ts
  import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
  const { sessionToken } = await fromNodeProviderChain()(); // inside the handler
  await fetch(`http://localhost:2773/systemsmanager/parameters/get?name=${encodeURIComponent(name)}&withDecryption=true`,
    { headers: { 'X-Aws-Parameters-Secrets-Token': sessionToken! } });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html ; https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html
- **Last verified:** 2026-10-12

### SEC-011 — Make cached secret readers survive rotation
- **Severity:** medium
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** When a secret rotates, code that caches it must refetch (bypassing the cache) on an authentication failure, or use a TTL shorter than the rotation's overlap window.
- **Why:** The extension caches up to 300 s by default and the Go cache refreshes hourly; after single-user rotation the old password stops working immediately, so every warm environment fails logins until its cache expires.
- **Detect:** DB connection code using a cached secret (`secretcache`, `getSecret`, extension) with no retry path on auth errors (`28P01` in Postgres, `ER_ACCESS_DENIED_ERROR` in MySQL); rotation enabled (SEC-006) on the same secret.
- **Fix:** On auth failure, refetch once and reconnect: Powertools `getSecret(id, { forceFetch: true })`, Go `cache.RefreshNowWithContext(ctx, id)` then `GetSecretStringWithContext`, extension request with `versionStage=AWSCURRENT` and a low `SECRETS_MANAGER_TTL`. Prefer alternating-users rotation for databases.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html#lambda-secrets-manager-rotation ; https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_cache-go.html ; https://github.com/aws/aws-secretsmanager-caching-go/blob/master/secretcache/cache.go ; https://docs.aws.amazon.com/powertools/typescript/latest/features/parameters/
- **Last verified:** 2026-10-12

### SEC-012 — Never log secrets, credentials or whole request objects
- **Severity:** high
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** Do not log secret values, SDK credential objects, config structs that hold secrets, or entire events/headers that carry `Authorization`, cookies or tokens; redact first.
- **Why:** CloudWatch Logs are readable by far more principals than the secret, are retained for months, and are exported to third-party tools. A single `console.log(event)` on an API route logs every caller's bearer token.
- **Detect:** TS `console.log(secret`, `console.log({ ...config`, `logger.info('...', { apiKey`, `console.log(event)` / `logger.info(event)` on API Gateway or function URL handlers, `console.log(response)` after `GetSecretValueCommand`; Go `log.Printf("%+v", cfg)` where `cfg` holds secrets, `fmt.Println(secret`, logging `aws.Credentials`.
- **Fix:** Log identifiers, not values (`logger.info('loaded secret', { secretId })`); strip headers before logging events; as a safety net attach a CloudWatch Logs data protection policy (credential identifiers such as AWS secret keys and private keys are masked at ingestion; `logs:Unmask` required to see them).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html ; https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html
- **Last verified:** 2026-10-12

### SEC-013 — Do not expose secrets as stack outputs
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Outputs carry ARNs and names, never secret values, generated passwords or access key secrets.
- **Why:** CloudFormation outputs are visible to anyone with `cloudformation:DescribeStacks`; Terraform outputs land in state and often in CI logs; SST outputs print to the terminal and CI.
- **Detect:** Terraform `output` whose value is `*.password`, `random_password.*.result`, `aws_iam_access_key.*.secret`, `*.secret_string` (with or without `sensitive = true` when consumed by CI); CDK `new CfnOutput(this, 'X', { value: secret.secretValue.unsafeUnwrap() })`; SST `return { dbPassword: ... }` in `run()`.
- **Fix:** Output `aws_secretsmanager_secret.db.arn` and let consumers read the secret with their own permissions.
- **Volatile:** no
- **Source:** https://developer.hashicorp.com/terraform/language/manage-sensitive-data/write-only ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.SecretValue.html
- **Last verified:** 2026-10-12

### SEC-014 — Inject ECS secrets with `secrets`/valueFrom, not `environment`
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Container definitions reference Secrets Manager or SSM ARNs through `secrets` (`valueFrom`); the task execution role gets read access to those ARNs only.
- **Why:** Values in `environment` are stored in the task definition in plaintext and returned by `DescribeTaskDefinition`. Security Hub ECS.8.
- **Detect:** Terraform `container_definitions = jsonencode([{ environment = [{ name = "DB_PASSWORD", value = ... }] }])`; CDK `environment: { DB_PASSWORD: ... }` in `addContainer` instead of `secrets: { DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password') }`.
- **Fix:** CDK `secrets: { DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password') }`; Terraform `secrets = [{ name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.db.arn}:password::" }]`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data-secrets.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/ecs-controls.html
- **Last verified:** 2026-10-12

### SEC-015 — In SST, use sst.Secret with link instead of environment strings
- **Severity:** medium
- **Category:** simplicity
- **Applies to:** SST
- **Rule:** Declare secrets with `new sst.Secret("Name")`, set them with `sst secret set`, and `link` them to the functions that need them; read `Resource.Name.value` in code.
- **Why:** Linked secrets are encrypted in the function bundle and decrypted at start-up by the SST SDK, need no IAM wiring and no SDK calls; `environment: { KEY: process.env.KEY }` or `environment: { KEY: secret.value }` puts the plaintext in the function configuration and the state.
- **Detect:** `sst.config.ts` with `environment: {` values from `process.env.`, string literals, or `<secret>.value`; secrets read in code via `process.env.*_KEY` while an `sst.Secret` exists.
- **Fix:**
  ```ts
  const stripeKey = new sst.Secret("StripeKey");
  new sst.aws.Function("Checkout", { handler: "src/checkout.handler", link: [stripeKey] });
  // src/checkout.ts: import { Resource } from "sst"; Resource.StripeKey.value
  ```
  For frontends, linked values arrive server-side as `SST_RESOURCE_*` env vars; never forward them to client bundles.
- **Volatile:** no
- **Source:** https://sst.dev/docs/component/secret/ ; https://sst.dev/docs/linking/
- **Last verified:** 2026-10-12

### SEC-016 — Block broad resource policies on secrets
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Secret resource policies must not grant `*` or unrelated accounts; Terraform `aws_secretsmanager_secret_policy` sets `block_public_policy = true`, and identity policies allowing `secretsmanager:PutResourcePolicy` require `secretsmanager:BlockPublicPolicy`.
- **Why:** A broad secret policy lets other accounts read credentials directly, bypassing your IAM. The block-public check uses automated reasoning to reject such policies at write time.
- **Detect:** `aws_secretsmanager_secret_policy` without `block_public_policy = true` or with `Principal "*"`; CDK `secret.addToResourcePolicy(` with `AnyPrincipal`/`AccountPrincipal` of a foreign account without conditions.
- **Fix:** `block_public_policy = true`; grant named role ARNs and, for cross-account, a CMK (KMS-011).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret_policy
- **Last verified:** 2026-10-12

### SEC-017 — Store secret parameters as SecureString, never String
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Parameter Store entries that hold passwords, tokens or keys use `SecureString`; `String`/`StringList` are for non-sensitive config only. In CDK, which cannot create a `SecureString` (CloudFormation does not support it), create the value out of band or use Secrets Manager instead of `ssm.StringParameter`.
- **Why:** `String` values are stored and returned unencrypted to anyone with `ssm:GetParameter` and appear in plaintext in the console, CloudFormation templates and Terraform plans; AWS says not to store sensitive data in a `String` or `StringList` parameter.
- **Detect:** Terraform `aws_ssm_parameter` with `type = "String"` (or `"StringList"`, or `insecure_value =`) and a name or value that looks secret (`*password*`, `*secret*`, `*token*`, `*api_key*`, `random_password.*.result`); CDK `new ssm.StringParameter(this, 'DbPassword', { stringValue: ... })`; TS `new PutParameterCommand({ Type: 'String', Name: '/app/db-password' ... })`; Go `ssm.PutParameterInput{Type: types.ParameterTypeString, ...}` for secrets.
- **Fix:** Terraform `type = "SecureString"` with `value_wo` + `value_wo_version` (SEC-003); CDK `new secretsmanager.Secret(...)` or reference a `SecureString` created outside CloudFormation with `ssm.StringParameter.fromSecureStringParameterAttributes(...)`; SDK `Type: 'SecureString'` (optionally `KeyId`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/systems-manager/latest/userguide/what-is-a-parameter.html ; https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ssm-parameter.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter
- **Last verified:** 2026-10-12

### SEC-018 — Keep secrets out of EC2 user data and launch templates
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** `user_data` / `userData` must not embed passwords, tokens, private keys or access keys; the boot script fetches them at runtime with the instance role (Secrets Manager, Parameter Store `SecureString`).
- **Why:** User data is not protected by authentication or encryption: any process on the instance can read it from IMDS, and principals with `ec2:DescribeInstanceAttribute` or `ec2:DescribeLaunchTemplateVersions` can read it through the API. It also lands in Terraform state and the CloudFormation template. AWS says not to store passwords or long-lived keys as user data.
- **Detect:** Terraform `aws_instance.user_data`, `aws_launch_template.user_data` (`base64encode(templatefile(...))`) interpolating `var.*password*`, `random_password.*.result`, `data.aws_secretsmanager_secret_version.*.secret_string` or literal `export DB_PASSWORD=`; CDK `userData.addCommands(` with `secret.secretValue.unsafeUnwrap()` or literals; `AKIA` or `BEGIN PRIVATE KEY` in user data.
- **Fix:** Pass only the secret ARN and fetch it on boot: `aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text`, with `secretsmanager:GetSecretValue` on that ARN in the instance role (CDK `secret.grantRead(instance)`). Rotate anything already exposed.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html ; https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html
- **Last verified:** 2026-10-12
