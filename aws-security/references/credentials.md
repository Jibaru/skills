# Federation, IAM users and SDK credentials

How CI and code obtain AWS credentials: GitHub Actions OIDC, long-lived keys, and the credential
chain in the AWS SDK for JavaScript v3 and the AWS SDK for Go v2. IDs continue the IAM series
from [iam-policies.md](iam-policies.md).

### IAM-017 — Use GitHub Actions OIDC instead of stored access keys
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** CI pipelines must assume an IAM role through `sts:AssumeRoleWithWebIdentity` (GitHub OIDC), not use an IAM user's access key stored as a repository secret.
- **Why:** A stored key never expires; it leaks through fork PR logs, compromised actions or a laptop `.env`, and stays valid until someone rotates it. OIDC tokens are short-lived and scoped to the repo/branch in the trust policy.
- **Detect:** Workflows with `aws-access-key-id: ${{ secrets.` or `AWS_ACCESS_KEY_ID: ${{ secrets.`; Terraform `aws_iam_user` + `aws_iam_access_key` named like `ci`, `github`, `deploy`; CDK `new iam.User(...)` + `new iam.AccessKey(...)`. Missing `permissions: id-token: write` in a workflow that deploys.
- **Fix:** Create the provider and a role (see IAM-018), then in the workflow: `permissions: { id-token: write, contents: read }` and `aws-actions/configure-aws-credentials` with `role-to-assume: arn:aws:iam::<acct>:role/gha-deploy`. Delete the IAM user and its keys.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html#idp_oidc_Create_GitHub ; https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#bp-workloads-use-roles
- **Last verified:** 2026-10-12

### IAM-018 — Scope the GitHub OIDC trust to repo and branch or environment, and pin aud
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** The trust policy must check `token.actions.githubusercontent.com:aud = sts.amazonaws.com` and restrict `token.actions.githubusercontent.com:sub` to the exact repository and branch (`repo:org/repo:ref:refs/heads/main`) or GitHub environment (`repo:org/repo:environment:prod`).
- **Why:** IAM now rejects a missing or wildcard-only `sub`, but `repo:org/*` or `repo:org/repo:*` still lets any repo in the org, or any branch or pull-request workflow, assume the production deploy role. Without the `aud` check, tokens minted for other audiences are accepted.
- **Detect:** Trust policies with `token.actions.githubusercontent.com:sub` values ending in `/*`, `:*`, or using `StringLike` with `*` on a prod/deploy role; no `token.actions.githubusercontent.com:aud` condition; CDK `new iam.OpenIdConnectPrincipal(provider, { StringLike: { 'token.actions.githubusercontent.com:sub': 'repo:acme/*' } })` or `WebIdentityPrincipal` with the same.
- **Fix:**
  ```hcl
  data "aws_iam_policy_document" "gha_trust" {
    statement {
      actions = ["sts:AssumeRoleWithWebIdentity"]
      principals {
        type        = "Federated"
        identifiers = [aws_iam_openid_connect_provider.github.arn]
      }
      condition {
        test     = "StringEquals"
        variable = "token.actions.githubusercontent.com:aud"
        values   = ["sts.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "token.actions.githubusercontent.com:sub"
        values   = ["repo:acme/api:environment:prod"]
      }
    }
  }
  ```
  Add environment protection rules in GitHub for the `prod` environment.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html#idp_oidc_Create_GitHub
- **Last verified:** 2026-10-12

### IAM-019 — Drop hardcoded thumbprints and use the native OIDC provider construct
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK
- **Rule:** For GitHub's OIDC provider, omit `thumbprint_list` (AWS validates GitHub's JWKS endpoint against its trusted CA library) and, in CDK, use `iam.OidcProviderNative` instead of the custom-resource-backed `iam.OpenIdConnectProvider`.
- **Why:** For GitHub, IAM validates against its own trusted root CA library and ignores any configured thumbprint, so copy-pasted thumbprints add noise and imply they protect something. The CDK README recommends `OidcProviderNative` (native `AWS::IAM::OIDCProvider`) for new stacks over `OpenIdConnectProvider`, which is backed by a custom-resource Lambda.
- **Detect:** `aws_iam_openid_connect_provider` for `token.actions.githubusercontent.com` with `thumbprint_list = [...]`; CDK `new iam.OpenIdConnectProvider(` for GitHub in a stack being added; leave an already-deployed provider alone unless a migration is planned.
- **Fix:**
  ```ts
  const github = new iam.OidcProviderNative(this, 'GitHub', {
    url: 'https://token.actions.githubusercontent.com',
    clientIds: ['sts.amazonaws.com'],
  });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_openid_connect_provider ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.OidcProviderNative.html ; https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-iam/README.md
- **Last verified:** 2026-10-12

### IAM-020 — Never hardcode AWS access keys in code or config
- **Severity:** critical
- **Category:** security
- **Applies to:** TypeScript, Go, Terraform, CDK, SST
- **Rule:** No access key ID or secret access key literals in source, IaC, `.env` files committed to git, or Terraform `provider "aws"` blocks.
- **Why:** Keys in git are harvested by scanners within minutes of a push and remain in history after deletion; the result is typically crypto-mining on your bill or data theft. The Go SDK docs warn against embedding credentials in an application.
- **Detect:** Regex `AKIA[0-9A-Z]{16}` or `ASIA[0-9A-Z]{16}`; TS `credentials: { accessKeyId: '`, `new S3Client({ credentials: {` with literals; Go `credentials.NewStaticCredentialsProvider("` with literal arguments; Terraform `provider "aws" { access_key = "` / `secret_key = "`.
- **Fix:** Remove the literal, rotate (deactivate and delete) the key immediately, and let the default chain resolve credentials:
  ```go
  cfg, err := config.LoadDefaultConfig(ctx)
  ```
  ```ts
  const s3 = new S3Client({}); // role credentials from the Lambda/ECS/EC2 environment
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-gosdk.html#static-credentials ; https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#bp-workloads-use-roles
- **Last verified:** 2026-10-12

### IAM-021 — Let the default credential chain resolve credentials in deployed code
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** In Lambda, ECS and EC2 code, construct clients without explicit credentials; do not wire `process.env.AWS_ACCESS_KEY_ID`/`os.Getenv("AWS_SECRET_ACCESS_KEY")` by hand, `fromIni()`/profile names, or custom env var names into clients.
- **Why:** Hand-wired env credentials skip refresh and break where Lambda does not set them (SnapStart restores read credentials from a container endpoint); `fromIni`/profiles work on a laptop and fail in the function; custom names like `MY_AWS_KEY` imply a long-lived key somewhere.
- **Detect:** TS `credentials: { accessKeyId: process.env.`, `fromIni(` / `fromSSO(` in handler code, `new SomeClient({ profile: '...' })`; Go `credentials.NewStaticCredentialsProvider(os.Getenv(`, `config.WithSharedConfigProfile(` in Lambda/ECS entrypoints.
- **Fix:** `new DynamoDBClient({})` in TS; `config.LoadDefaultConfig(ctx)` in Go. Keep profiles for local scripts only (behind a flag or `AWS_PROFILE`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html ; https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-gosdk.html ; https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html
- **Last verified:** 2026-10-12

### IAM-022 — Wrap custom Go credential providers in aws.NewCredentialsCache
- **Severity:** medium
- **Category:** performance
- **Applies to:** Go
- **Rule:** When building `aws.Config` by hand (not through `config.LoadDefaultConfig`) or setting `cfg.Credentials` directly, wrap the provider with `aws.NewCredentialsCache`.
- **Why:** `LoadDefaultConfig` caches automatically; a raw provider set on `aws.Config` is called for every request, so an `stscreds.AssumeRoleProvider` issues an STS call per API call, adding latency and hitting STS throttling under load.
- **Detect:** Go `cfg.Credentials = stscreds.NewAssumeRoleProvider(` or `aws.Config{ Credentials: <provider> }` without `aws.NewCredentialsCache(`.
- **Fix:**
  ```go
  cfg.Credentials = aws.NewCredentialsCache(stscreds.NewAssumeRoleProvider(sts.NewFromConfig(cfg), roleARN))
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-gosdk.html#specify-credentials-programmatically
- **Last verified:** 2026-10-12

### IAM-023 — Replace IAM users with attached policies by roles
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Workloads and humans should not authenticate as IAM users with policies and access keys; use roles (compute roles, IAM Identity Center, IAM Roles Anywhere for servers outside AWS). Keep IAM users only for the documented exceptions (third-party tools that cannot assume roles) and rotate their keys.
- **Why:** User keys are long-term credentials with no expiry; Security Hub flags policies attached to users (IAM.2) and keys older than 90 days (IAM.3).
- **Detect:** Terraform `aws_iam_user` with `aws_iam_user_policy`, `aws_iam_user_policy_attachment` or `aws_iam_access_key`; CDK `new iam.User(` with `addToPolicy`/`attachInlinePolicy` or `new iam.AccessKey(`; `aws_iam_access_key` outputs written to state or outputs.
- **Fix:** Role assumed by the workload (`assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')`), IAM Roles Anywhere for on-prem, Identity Center for humans.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#update-access-keys ; https://docs.aws.amazon.com/rolesanywhere/latest/userguide/introduction.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/iam-controls.html
- **Last verified:** 2026-10-12
