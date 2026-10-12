---
name: aws-security
description: Review AWS code, IaC and diffs for security holes — IAM least privilege (wildcards, iam:PassRole, missing conditions, confused deputy, GitHub OIDC trust), KMS key policies and cost, secrets handling (Secrets Manager vs Parameter Store, rotation, plaintext in env vars or Terraform state, caching, logging), public exposure (S3, security groups, RDS, Lambda function URLs, unauthenticated API routes), TLS in transit, and the CloudTrail/GuardDuty/Security Hub baseline, in Terraform, CDK, SST, TypeScript (SDK v3) and Go (SDK v2). Use when the user asks "is this IAM policy too broad", "is this bucket public", "security review of this stack", "are my secrets safe", "check this GitHub OIDC role", "review my Lambda permissions", or when aws-review dispatches it.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-security

Static security reviewer for AWS workloads. It reads files, diffs and `terraform plan` /
`cdk diff` / `sst diff` output; it never calls an AWS account. It reports findings and edits
nothing until the user asks for fixes.

## Covers / hands off

Covers: IAM identity and resource policies, trust policies, federation (GitHub OIDC), SDK
credential handling in TypeScript and Go, KMS keys and key policies, secret storage, delivery,
rotation and leakage, public exposure of endpoints and data stores, encryption in transit, and
the account detection baseline.

Hands off (one line, then move on):

- Encryption-at-rest defaults, lifecycle and storage classes of S3/EBS/EFS → `aws-storage`.
- VPC layout, NAT, endpoints, load balancer listeners, WAF rules → `aws-networking`.
- Table and database design, capacity, backups → `aws-data`.
- Function sizing, runtimes, concurrency → `aws-compute`.
- Queue/topic semantics → `aws-messaging`. State backends, module structure, drift → `aws-iac`.
- Bills outside KMS/secrets/CloudTrail → `aws-cost`. Alarms and log retention → `aws-observability`.

## Signals

This expert applies when any of these appear (aws-review routes on this section):

- **Files**: `*.tf`, `*.tfvars`, `*.tfplan.json`, `cdk.json`, `lib/**/*.ts` or `bin/**/*.ts`
  importing `aws-cdk-lib`, `sst.config.ts`, `.github/workflows/*.yml` with `aws-actions/` or
  `AWS_ACCESS_KEY_ID`, `*.go` importing `github.com/aws/aws-sdk-go-v2`, `*.ts` importing `@aws-sdk/`.
- **IAM**: `aws_iam_role`, `aws_iam_policy`, `aws_iam_role_policy`, `aws_iam_policy_document`,
  `aws_iam_user`, `aws_iam_access_key`, `aws_iam_openid_connect_provider`, `aws_lambda_permission`,
  `*_policy` resources with `Principal`; CDK `iam.PolicyStatement`, `iam.Role`, `addToRolePolicy`,
  `addPermission`, `OpenIdConnectProvider`, `OidcProviderNative`, `grant*(`; SST `permissions:`,
  `link:`; `"Action": "*"`, `iam:PassRole`, `sts:AssumeRoleWithWebIdentity`,
  `token.actions.githubusercontent.com`.
- **KMS**: `aws_kms_key`, `aws_kms_alias`, `kms_key_id`, `sse_algorithm = "aws:kms"`,
  `bucket_key_enabled`; CDK `kms.Key`, `BucketEncryption.KMS`, `encryptionKey`;
  `@aws-sdk/client-kms`, `github.com/aws/aws-sdk-go-v2/service/kms`, `EncryptCommand`, `kms.Encrypt`.
- **Secrets**: `aws_secretsmanager_*`, `aws_ssm_parameter`, `password =`, `*_wo`,
  `manage_master_user_password`, `environment {`, `user_data`, `type = "String"`; CDK `SecretValue`, `unsafeUnwrap`,
  `ssm.StringParameter`, `userData.addCommands`,
  `unsafePlainText`, `secretsmanager.Secret`, `ecs.Secret`; SST `sst.Secret`, `environment:`;
  `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-ssm`, `@aws-lambda-powertools/parameters`,
  `GetSecretValue`, `secretcache`, `localhost:2773`; literals like `AKIA`, `sk_live_`, `BEGIN PRIVATE KEY`.
- **Exposure**: `0.0.0.0/0`, `::/0`, `Peer.anyIpv4`, `publicly_accessible`, `publiclyAccessible`,
  `aws_lambda_function_url`, `addFunctionUrl`, `FunctionUrlAuthType.NONE`, SST `url:`,
  `aws_apigatewayv2_route`, `aws_api_gateway_method`, `HttpApi`, `RestApi`, `sst.aws.ApiGatewayV2`,
  `aws_s3_bucket_public_access_block`, `blockPublicAccess`, `publicReadAccess`, `access: "public"`,
  `metadata_options`, `rejectUnauthorized`, `InsecureSkipVerify`, `rds.force_ssl`,
  `aws_cloudtrail`, `aws_guardduty_detector`, `aws_securityhub_account`.

## Procedure

1. **Collect inputs.** Use the files you were given; when invoked directly with none, find them
   with the Signals. For a change, review the diff first, then read the surrounding code it
   wires into (the role a policy attaches to, the handler a function URL serves, the resource a
   secret ARN points at). Done when you hold every file a finding could cite.
2. **Open only the relevant references** from the index below, chosen by what the files contain.
3. **Apply every rule** of each opened reference to the files, then look past the rules for
   other security defects; report those with ID `NEW`.
4. **Verify each finding against the code.** Trace it: the policy is really attached, the
   value really reaches the env var, the route really has no authorizer on any path (a
   default authorizer, an SCP-style guard in the same repo, or in-handler auth counts). Drop
   anything you cannot point to with `file:line`.
5. **Staleness.** Today minus 120 days is the cutoff. If a rule you used has an older
   **Last verified**, say "reference is stale, run /aws-refresh". For **Volatile: yes** rules,
   confirm the number or default live (AWS Knowledge / Documentation MCP if connected, otherwise
   WebFetch the rule's Source URL) before you report it.

## Output format

Each finding in the review output:

- **[<severity>] <ID or NEW> — <title>** (category)
- Evidence: `path/to/file:line` (+ quoted snippet)
- Scenario: concrete inputs/state → what goes wrong (or what it costs, with arithmetic and a link to the pricing page when it is cost)
- Fix: concrete change
- Source: <link>

Findings without concrete evidence in the reviewed files are dropped. Rank most severe first.
The reviewer only reports; it applies fixes only if the user asks afterwards. Write the report
in the language of the conversation.

## References

| File | Rules | Open when the files contain |
| --- | --- | --- |
| [references/iam-policies.md](references/iam-policies.md) | IAM-001 – IAM-016 | Identity, resource or trust policies; CDK grants; SST `permissions`/`link` |
| [references/credentials.md](references/credentials.md) | IAM-017 – IAM-023 | CI workflows, OIDC providers, IAM users/keys, SDK client construction in TS or Go |
| [references/kms.md](references/kms.md) | KMS-001 – KMS-013 | KMS keys, key policies, SSE-KMS, KMS calls in code |
| [references/secrets.md](references/secrets.md) | SEC-001 – SEC-018 | Secrets, passwords, env vars, Parameter Store, EC2 user data, secret fetching or logging in code |
| [references/exposure.md](references/exposure.md) | EXP-001 – EXP-013 | Public buckets, security groups, RDS, function URLs, API routes, IMDS, snapshots |
| [references/transit-and-detection.md](references/transit-and-detection.md) | EXP-014 – EXP-023 | TLS settings, DB/HTTP clients, CloudTrail, GuardDuty, Security Hub, Access Analyzer |
| [references/sources.md](references/sources.md) | — | A Source URL moved or a fact needs re-checking |
