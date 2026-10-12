# IAM policies: identity, resource and trust

Least privilege for workload roles, resource policies and trust policies. Federation, IAM users
and SDK credentials live in [credentials.md](credentials.md).

### IAM-001 — Remove full-admin statements from workload roles
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** A role used by a function, task, instance or pipeline must not carry `"Action": "*"` with `"Resource": "*"`, nor the `AdministratorAccess` managed policy.
- **Why:** Any code-execution bug (SSRF, dependency compromise, injected command) in that workload becomes full account takeover: create users, read every secret, delete backups. Security Hub flags it as IAM.1.
- **Detect:** Terraform `actions = ["*"]` / `"Action": "*"` in `aws_iam_policy`, `aws_iam_role_policy`, `data "aws_iam_policy_document"`; `policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"` in `aws_iam_role_policy_attachment`. CDK `new iam.PolicyStatement({ actions: ['*'], resources: ['*'] })`, `ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')`. SST `permissions: [{ actions: ["*"], resources: ["*"] }]`, `transform.role` adding admin.
- **Fix:** List the exact actions on the exact ARNs the code calls. CDK: `table.grantReadWriteData(fn)`; SST: `link: [table]`; Terraform:
  ```hcl
  data "aws_iam_policy_document" "fn" {
    statement {
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
      resources = [aws_dynamodb_table.orders.arn]
    }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege ; https://docs.aws.amazon.com/securityhub/latest/userguide/iam-controls.html
- **Last verified:** 2026-10-12

### IAM-002 — Replace service-wide wildcards with named actions
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Do not grant `<service>:*` (`s3:*`, `dynamodb:*`, `sqs:*`, `lambda:*`, `secretsmanager:*`) in customer policies; name the actions the code uses.
- **Why:** `s3:*` on a data bucket includes `s3:PutBucketPolicy`, `s3:DeleteBucket` and `s3:PutBucketPublicAccessBlock`, so a read-path bug can make the bucket public or delete it. Security Hub control IAM.21.
- **Detect:** Strings matching `"[a-z0-9-]+:\*"` in `actions`/`Action`; CDK `actions: ['dynamodb:*']`; SST `permissions: [{ actions: ["s3:*"] ... }]`. Prefix wildcards such as `s3:Get*` are acceptable only on a scoped resource.
- **Fix:** Enumerate the API calls (grep the code for `new *Command(` in TS or `client.*(ctx,` in Go) and grant those, e.g. `["s3:GetObject", "s3:PutObject"]` on `"${aws_s3_bucket.uploads.arn}/*"`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/iam-controls.html ; https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- **Last verified:** 2026-10-12

### IAM-003 — Scope Resource to ARNs, not "*"
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Data-plane actions (read/write items, objects, messages, secrets) must target specific ARNs; keep `Resource: "*"` only for actions that do not support resource-level permissions (for example `xray:PutTraceSegments`, `ec2:Describe*`).
- **Why:** `secretsmanager:GetSecretValue` on `*` lets one function read every secret in the account, including other teams' database passwords.
- **Detect:** `resources = ["*"]` / `"Resource": "*"` together with actions such as `GetSecretValue`, `GetObject`, `PutObject`, `GetItem`, `Query`, `SendMessage`, `Publish`, `Decrypt`, `GetParameter`. CDK `resources: ['*']`. SST `resources: ["*"]`.
- **Fix:** Use the resource's ARN attribute (`aws_secretsmanager_secret.db.arn`, `bucket.arnForObjects('uploads/*')`, `table.tableArn` plus `${table.tableArn}/index/*` when querying indexes).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege
- **Last verified:** 2026-10-12

### IAM-004 — Use grant methods and SST link instead of hand-written statements
- **Severity:** medium
- **Category:** simplicity
- **Applies to:** CDK, SST
- **Rule:** When a CDK construct offers `grant*()` or SST offers `link`, use it instead of building `PolicyStatement`s and passing names through env vars by hand.
- **Why:** Hand-written statements drift from the resources they describe (a renamed table, a forgotten `/index/*`, a missing `kms:Decrypt` for an encrypted queue) and tend to widen to `*` when they break. Grants and links track the resource ARN and add the KMS permissions the resource needs.
- **Detect:** CDK `fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:...'], resources: [table.tableArn] }))` next to `environment: { TABLE_NAME: table.tableName }`. SST `permissions: [{ actions: ["s3:GetObject"], resources: [bucket.arn] }]` plus `environment: { BUCKET: bucket.name }`.
- **Fix:** CDK `table.grantReadData(fn)`, `bucket.grantRead(fn, 'uploads/*')`, `queue.grantSendMessages(fn)`. SST:
  ```ts
  new sst.aws.Function("Api", { handler: "src/api.handler", link: [bucket, table] });
  // in code: import { Resource } from "sst"; Resource.MyBucket.name
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/permissions.html ; https://sst.dev/docs/linking/
- **Last verified:** 2026-10-12

### IAM-005 — Restrict iam:PassRole to named roles and the target service
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** `iam:PassRole` must name specific role ARNs (or a tight name prefix) and should carry `iam:PassedToService`.
- **Why:** With `iam:PassRole` on `*` plus `lambda:CreateFunction`, `ecs:RunTask` or `ec2:RunInstances`, a principal can attach the most privileged role in the account to compute it controls and act as that role: classic privilege escalation.
- **Detect:** `iam:PassRole` (or `iam:*`) with `resources = ["*"]` / `Resource: "*"`; CI/deployer policies that pair `iam:PassRole` with `lambda:CreateFunction`, `lambda:UpdateFunctionConfiguration`, `ecs:RegisterTaskDefinition`, `states:CreateStateMachine`, `ec2:RunInstances`.
- **Fix:**
  ```hcl
  statement {
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/app-lambda-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html
- **Last verified:** 2026-10-12

### IAM-006 — Keep IAM-write actions away from workload roles
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Application roles must not hold `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion`, `iam:AttachRolePolicy`, `iam:PutRolePolicy`, `iam:UpdateAssumeRolePolicy`, `iam:CreateAccessKey`, `iam:CreateUser` or `iam:*`; deployer roles that need them must be bounded (IAM-007).
- **Why:** Each of those lets the holder grant itself more permissions, so a least-privilege role with any of them is effectively admin.
- **Detect:** Any of the listed actions, or `iam:*`, in a policy attached to a Lambda/ECS/EC2 role or a GitHub OIDC role without `permissions_boundary`.
- **Fix:** Move IAM changes to the deploy pipeline (Terraform/CDK) and remove them from runtime roles. When a pipeline role must create roles, require a boundary with the `iam:PermissionsBoundary` condition.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html#access_policies_boundaries-delegate ; https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- **Last verified:** 2026-10-12

### IAM-007 — Require a permissions boundary when a principal can create roles
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** A principal allowed `iam:CreateRole`/`iam:PutRolePolicy`/`iam:AttachRolePolicy` must only be able to do so with `iam:PermissionsBoundary` set to an approved policy, and must be denied `iam:DeleteRolePermissionsBoundary` and edits to the boundary policy.
- **Why:** Without the condition, a CI role that "only deploys Lambdas" can create a new admin role and assume it.
- **Detect:** `iam:CreateRole` without a `condition` on `iam:PermissionsBoundary`; `aws_iam_role` created by app modules without `permissions_boundary`; CDK apps creating roles with no `iam.PermissionsBoundary.of(stack).apply(...)` and no bootstrap `--custom-permissions-boundary`.
- **Fix:**
  ```hcl
  statement {
    actions   = ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy"]
    resources = ["arn:aws:iam::${local.account_id}:role/app-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.app_boundary.arn]
    }
  }
  ```
  CDK: `iam.PermissionsBoundary.of(this).apply(boundaryPolicy);`
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html
- **Last verified:** 2026-10-12

### IAM-008 — Add aws:SourceArn / aws:SourceAccount when trusting a service principal
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every resource policy or Lambda permission that allows a service principal (`s3.amazonaws.com`, `sns.amazonaws.com`, `events.amazonaws.com`, `cloudtrail.amazonaws.com`, …) must pin the calling resource with `aws:SourceArn` and/or the account with `aws:SourceAccount`. For S3 sources use both, because bucket ARNs carry no account ID.
- **Why:** Cross-service confused deputy: without the condition, another account's bucket, topic or trail (or a bucket re-created with your deleted bucket's name) can make the service invoke your function or write to your bucket.
- **Detect:** Terraform `aws_lambda_permission` with `principal = "s3.amazonaws.com"` and no `source_account`, or any service principal without `source_arn`; policy documents with `principals { type = "Service" }` and no `aws:SourceArn`/`aws:SourceAccount`/`aws:SourceOrgID` condition. CDK `fn.addPermission('x', { principal: new iam.ServicePrincipal('s3.amazonaws.com') })` without `sourceAccount`/`sourceArn`; `new iam.ServicePrincipal(...)` in a bucket/queue/topic policy without `conditions`.
- **Fix:**
  ```hcl
  resource "aws_lambda_permission" "s3" {
    statement_id   = "AllowS3Invoke"
    action         = "lambda:InvokeFunction"
    function_name  = aws_lambda_function.ingest.function_name
    principal      = "s3.amazonaws.com"
    source_arn     = aws_s3_bucket.uploads.arn
    source_account = data.aws_caller_identity.current.account_id
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html ; https://docs.aws.amazon.com/lambda/latest/dg/permissions-function-services.html
- **Last verified:** 2026-10-12

### IAM-009 — Never allow Principal "*" in a resource policy without a restricting condition
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Bucket, queue, topic, secret, key, function and API resource policies with `"Principal": "*"` (or `{"AWS": "*"}`) must also carry a fixed-value condition such as `aws:PrincipalOrgID`, `aws:SourceVpce`, `aws:SourceAccount` or `aws:SourceArn`.
- **Why:** An unconditioned `*` principal grants every AWS account and, for S3 or Lambda, anonymous internet callers. Wildcards inside the condition value (`"vpc-*"`) still count as public.
- **Detect:** `principals { type = "*" identifiers = ["*"] }` or `type = "AWS" identifiers = ["*"]` in `aws_s3_bucket_policy`, `aws_sqs_queue_policy`, `aws_sns_topic_policy`, `aws_secretsmanager_secret_policy`, `aws_kms_key.policy`, `aws_lambda_permission principal = "*"`; CDK `new iam.AnyPrincipal()`, `new iam.StarPrincipal()`, `new iam.ArnPrincipal('*')`.
- **Fix:** Name the principals, or keep `*` and add `condition { test = "StringEquals" variable = "aws:PrincipalOrgID" values = [var.org_id] }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html#access-control-block-public-access-policy-status ; https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html
- **Last verified:** 2026-10-12

### IAM-010 — Require sts:ExternalId on roles assumed by third parties
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** A trust policy that lets another company's AWS account assume a role must require the `sts:ExternalId` value that vendor issued for you.
- **Why:** Without it, any other customer of the same vendor who learns your role ARN can ask the vendor to act on your account (cross-account confused deputy).
- **Detect:** `aws_iam_role.assume_role_policy` with `"AWS": "arn:aws:iam::<other-account>:root"` (or a role in another account) and no `sts:ExternalId` condition; CDK `new iam.AccountPrincipal('<other>')` without `externalIds` on the `Role`.
- **Fix:** CDK `new iam.Role(this, 'Vendor', { assumedBy: new iam.AccountPrincipal(vendorAccount), externalIds: [vendorExternalId] })`; Terraform condition `StringEquals sts:ExternalId`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html#mitigate-confused-deputy
- **Last verified:** 2026-10-12

### IAM-011 — Trust a specific role, not a whole account, in internal trust policies
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** When one of your roles must assume another, trust that role's ARN (or check `aws:PrincipalArn`), not `arn:aws:iam::<account>:root`, unless you intend any principal with `sts:AssumeRole` in that account to get in.
- **Why:** Trusting `:root` delegates the decision to every identity policy in the source account; a developer role with `sts:AssumeRole` on `*` can then assume your production role.
- **Detect:** `assume_role_policy` with `identifiers = ["arn:aws:iam::<id>:root"]`; CDK `new iam.AccountRootPrincipal()` or `new iam.AccountPrincipal(id)` as `assumedBy` on roles that guard data or deploys.
- **Fix:** `principals { type = "AWS" identifiers = [aws_iam_role.deployer.arn] }`, or keep the account principal and add `ArnEquals aws:PrincipalArn` with the allowed role ARNs.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html ; https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege
- **Last verified:** 2026-10-12

### IAM-012 — Avoid NotAction / NotResource with Allow
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Do not write `"Effect": "Allow"` with `NotAction` or `NotResource`; express the allow positively. Keep `NotAction` for `Deny` guardrails.
- **Why:** `Allow` + `NotAction: "iam:*"` + `Resource: "*"` grants every action of every other service, including services AWS launches later.
- **Detect:** Terraform `not_actions` / `not_resources` in a statement with `effect = "Allow"` (or no effect, default Allow); JSON `"NotAction"` with `"Allow"`; CDK `notActions: [...]` / `notResources` in an allow `PolicyStatement`.
- **Fix:** Replace with an explicit `actions` list on scoped resources; if the intent is "everything except IAM", attach the specific managed or customer policies the workload needs.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_notaction.html
- **Last verified:** 2026-10-12

### IAM-013 — Pair ForAllValues with a Null check, and never use set operators on single-valued keys
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** An `Allow` with `ForAllValues:*` must also carry `"Null": {"<key>": "false"}`; `ForAllValues`/`ForAnyValue` must only be used with multivalued keys (`aws:TagKeys`, `aws:PrincipalServiceNamesList`).
- **Why:** `ForAllValues` evaluates to true when the key is absent, so a tag-restricted allow becomes unrestricted for requests that send no tags. Set operators on single-valued keys (`aws:SourceVpce`, `aws:ResourceTag/x`) produce overly permissive policies.
- **Detect:** `test = "ForAllValues:StringEquals"` / `"ForAllValues:StringLike"` without a sibling `test = "Null"` on the same variable; `ForAnyValue:`/`ForAllValues:` with `aws:SourceVpce`, `aws:SourceIp`, `aws:PrincipalArn`, `aws:ResourceTag/...`, `aws:RequestTag/...`.
- **Fix:**
  ```hcl
  condition { test = "ForAllValues:StringEquals" variable = "aws:TagKeys" values = ["env", "team"] }
  condition { test = "Null"                      variable = "aws:TagKeys" values = ["false"] }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-single-vs-multi-valued-context-keys.html
- **Last verified:** 2026-10-12

### IAM-014 — Give each function its own execution role
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Do not share one execution role across Lambda functions (or ECS task roles across services) that touch different resources.
- **Why:** A shared role is the union of every function's needs, so the public webhook handler ends up able to read the billing table. The Serverless Lens calls sharing a role across functions a likely least-privilege violation.
- **Detect:** Terraform: several `aws_lambda_function` with the same `role = aws_iam_role.lambda.arn`; CDK: one `iam.Role` passed as `role:` to multiple `lambda.Function`s; SST: shared `role:` arg on several `sst.aws.Function`.
- **Fix:** One role per function (the CDK and SST default when `role` is omitted), with grants or `link` per function.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/identity-and-access-management.html
- **Last verified:** 2026-10-12

### IAM-015 — Replace broad AWS managed policies on workload roles
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Workload roles should not attach broad AWS managed policies such as `AmazonS3FullAccess`, `AmazonDynamoDBFullAccess`, `AmazonSQSFullAccess`, `SecretsManagerReadWrite`, `PowerUserAccess`, `IAMFullAccess`.
- **Why:** They grant every action on every resource of the service in the account; AWS documents that managed policies are a starting point and usually not least privilege for your use case.
- **Detect:** `policy_arn = "arn:aws:iam::aws:policy/<name>"` in `aws_iam_role_policy_attachment` / `managed_policy_arns`; CDK `ManagedPolicy.fromAwsManagedPolicyName('<name>')`; SST `transform: { role: { managedPolicyArns: [...] } }`. Service-execution policies such as `service-role/AWSLambdaBasicExecutionRole` are fine.
- **Fix:** Swap for a customer policy (or grants) limited to the resources in this stack.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#bp-use-aws-defined-policies
- **Last verified:** 2026-10-12

### IAM-016 — Validate policies in CI with IAM Access Analyzer
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Pipelines that change IAM should run Access Analyzer policy validation and, for sensitive roles, `check-no-new-access` / `check-no-public-access` against the plan or synthesized template.
- **Why:** Reviewers miss subtle grants (a `NotAction`, a wildcard principal hidden in a module). Policy validation is free; custom policy checks cost $0.0020 per call, so scope them to IAM-touching changes (100 checks per PR × 200 PRs/month = $40/month).
- **Detect:** Repos with `.github/workflows/*` running `terraform apply` or `cdk deploy` and many IAM resources but no `aws accessanalyzer validate-policy` / `check-no-new-access` step. Report only when the PR adds or widens IAM.
- **Fix:** Add a CI step that runs `aws accessanalyzer validate-policy --policy-type IDENTITY_POLICY --policy-document file://policy.json` for each changed policy, failing on `SECURITY_WARNING`/`ERROR`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html ; https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-custom-policy-checks.html ; https://aws.amazon.com/iam/access-analyzer/pricing/
- **Last verified:** 2026-10-12
