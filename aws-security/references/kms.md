# KMS: keys, key policies and request cost

Customer managed keys (CMKs), key policies, SSE-KMS cost on S3, and KMS calls from code.
Prices: $1/month per CMK, +$1/month for each of the first two rotations (capped after the
second), $0.03 per 10,000 requests, 20,000 free requests/month; AWS managed keys have no
storage fee (requests are still charged). Confirm live on https://aws.amazon.com/kms/pricing/.

### KMS-001 — Enable automatic rotation on customer managed symmetric keys
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Set rotation on every symmetric `AWS_KMS`-origin CMK; pick a period (90–2560 days) only when policy demands something other than the 365-day default.
- **Why:** Rotation is off by default for CMKs in both Terraform (`enable_key_rotation` defaults to `false`) and CDK (`enableKeyRotation` defaults to `false`), so compliance scans fail (Security Hub KMS.4) and key material is never refreshed. Rotation is transparent: old ciphertext still decrypts.
- **Detect:** `resource "aws_kms_key"` without `enable_key_rotation = true` (symmetric, no `customer_master_key_spec` other than `SYMMETRIC_DEFAULT`); CDK `new kms.Key(` without `enableKeyRotation: true`.
- **Fix:** `enable_key_rotation = true` (optional `rotation_period_in_days = 180`); CDK `new kms.Key(this, 'Key', { enableKeyRotation: true })`. Asymmetric, HMAC and custom-key-store keys need manual rotation.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kms.KeyProps.html
- **Last verified:** 2026-10-12

### KMS-002 — Use an AWS managed key unless you need key-policy control
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Create a CMK only when you need a custom key policy, cross-account use, separate audit, imported material or a deletion lever; otherwise use the service's AWS managed key (`aws/s3`, `aws/secretsmanager`, `aws/lambda`, …) or the service default.
- **Why:** Each CMK costs $1/month, rising to $3/month after its second rotation. Example: 4 environments × 10 per-resource keys = 40 keys × $3 = $120/month for no added control, plus the operational risk of 40 key policies.
- **Detect:** Many `aws_kms_key` resources each used by a single resource, no custom `policy`, no cross-account principals; CDK `new kms.Key` per bucket/queue/table with default policy.
- **Fix:** Drop the key and rely on the AWS managed key, or share one CMK per data domain per environment.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/kms/pricing/ ; https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html
- **Last verified:** 2026-10-12

### KMS-003 — Enable S3 Bucket Keys on SSE-KMS buckets
- **Severity:** medium (high when the bucket serves millions of requests a month)
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every bucket whose default encryption is `aws:kms` should set `bucket_key_enabled = true` / `bucketKeyEnabled: true`.
- **Why:** Without a Bucket Key, S3 calls KMS for every object PUT and GET. 100 M GETs/month → 100,000,000 / 10,000 × $0.03 = $300/month in KMS requests (plus throttling risk on the KMS request quota). Bucket Keys cut that by up to 99%. Caveat: they change the encryption context to the bucket ARN, so policies keyed on object ARN in `kms:EncryptionContext` must be updated; existing objects only benefit after `CopyObject`.
- **Detect:** Terraform `aws_s3_bucket_server_side_encryption_configuration` with `sse_algorithm = "aws:kms"` and no `bucket_key_enabled = true`; CDK `encryption: s3.BucketEncryption.KMS` (or `encryptionKey`) without `bucketKeyEnabled: true`; SST `sst.aws.Bucket` with a KMS `transform.bucket` lacking the flag; TS `PutObjectCommand({ ServerSideEncryption: 'aws:kms' })` without `BucketKeyEnabled: true` overriding the bucket.
- **Fix:**
  ```hcl
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html ; https://aws.amazon.com/kms/pricing/
- **Last verified:** 2026-10-12

### KMS-004 — Never grant key use to Principal "*" or to whole foreign accounts without conditions
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Key policy statements must name principals (roles or your account root for IAM delegation); `"Principal": "*"` requires a fixed `kms:CallerAccount`/`aws:PrincipalOrgID` condition, and foreign accounts get only the crypto actions they need.
- **Why:** A key usable by anyone makes every ciphertext it protects readable by anyone who can obtain the data (public snapshot, leaked backup). Security Hub KMS.5.
- **Detect:** `aws_kms_key.policy` / `aws_kms_key_policy` JSON with `"Principal": "*"` or `{"AWS": "*"}`; `"kms:*"` granted to an external account; CDK `key.addToResourcePolicy(new iam.PolicyStatement({ principals: [new iam.AnyPrincipal()] ... }))`, `key.grantDecrypt(new iam.AccountPrincipal(other))` on a key that guards sensitive data.
- **Fix:** Limit to `kms:Decrypt`/`kms:GenerateDataKey*` for a named role ARN; add `kms:ViaService` (KMS-007).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-default.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/kms-controls.html
- **Last verified:** 2026-10-12

### KMS-005 — Keep the account statement in key policies and never bypass the lockout check
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** A custom key policy must keep a statement that lets the account (`arn:aws:iam::<acct>:root`) or a durable admin role manage the key; do not set `bypass_policy_lockout_safety_check = true`.
- **Why:** If the only principal in the key policy is deleted, the key becomes unmanageable and only AWS Support can recover it; data encrypted under it is stranded until then. Without the account statement, IAM policies that grant key access silently do nothing.
- **Detect:** `aws_kms_key` / `aws_kms_key_policy` with a `policy` lacking `:root` (or an admin role) on `kms:*`/`kms:Put*`; `bypass_policy_lockout_safety_check = true`; CDK `new kms.Key(this, 'K', { policy: new iam.PolicyDocument({ ... }) })` whose document has no `AccountRootPrincipal` and no `admins` — with the `@aws-cdk/aws-kms:defaultKeyPolicies` flag (default for new apps) a custom `policy` replaces the default instead of appending.
- **Fix:** Add `{"Sid":"EnableIAM","Effect":"Allow","Principal":{"AWS":"arn:aws:iam::<acct>:root"},"Action":"kms:*","Resource":"*"}` or set CDK `admins: [adminRole]`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-default.html#key-policy-default-allow-root-enable-iam ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kms.KeyProps.html
- **Last verified:** 2026-10-12

### KMS-006 — Separate key administrators from key users
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Principals that administer a key (`kms:Put*`, `kms:Create*`, `kms:ScheduleKeyDeletion`, tag/alias management) should not be the same workload roles that encrypt and decrypt with it.
- **Why:** Key administrators can rewrite the key policy and create grants, so a workload role with admin rights can give itself or anyone else decrypt access, and can schedule deletion of the key.
- **Detect:** One statement granting both admin actions and `kms:Decrypt`/`kms:Encrypt`/`kms:GenerateDataKey*` to an application role; CDK `key.grantAdmin(fnRole)`.
- **Fix:** Admins: the deploy/security role. Users: `key.grantEncryptDecrypt(fn)` (or the resource's grant method).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-default.html#key-policy-default-allow-administrators
- **Last verified:** 2026-10-12

### KMS-007 — Restrict key use to the integrating service with kms:ViaService
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** When a CMK exists to protect one service's data (Secrets Manager, S3, RDS, SQS), constrain user statements with `kms:ViaService = <service>.<region>.amazonaws.com` and, where useful, an encryption-context condition.
- **Why:** Without it, a principal allowed to decrypt "for Secrets Manager" can call `kms:Decrypt` directly on any ciphertext under that key it obtains elsewhere.
- **Detect:** CMKs used by a single service whose key policy user statements have no `kms:ViaService` condition; IAM policies granting `kms:Decrypt` on that key without the condition.
- **Fix:**
  ```hcl
  condition {
    test     = "StringEquals"
    variable = "kms:ViaService"
    values   = ["secretsmanager.${var.region}.amazonaws.com"]
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/kms/latest/developerguide/conditions-kms.html ; https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html
- **Last verified:** 2026-10-12

### KMS-008 — Do not allow kms:Decrypt on all keys in IAM policies
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** IAM policies must name key ARNs for `kms:Decrypt`, `kms:ReEncryptFrom` and `kms:GenerateDataKey*`, not `Resource: "*"`.
- **Why:** Combined with the default "enable IAM policies" key statement, `kms:Decrypt` on `*` decrypts data under every CMK in the account that delegates to IAM. Security Hub KMS.1 (customer managed policies) and KMS.2 (inline policies).
- **Detect:** `kms:Decrypt` / `kms:*` with `resources = ["*"]`; CDK `actions: ['kms:Decrypt'], resources: ['*']`; SST `permissions: [{ actions: ["kms:Decrypt"], resources: ["*"] }]`.
- **Fix:** `resources = [aws_kms_key.data.arn]`, or use the resource grant (`secret.grantRead(fn)` adds decrypt on the secret's key).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/kms-controls.html
- **Last verified:** 2026-10-12

### KMS-009 — Protect keys from accidental deletion
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Keys that protect persistent data keep the maximum 30-day deletion window, `RemovalPolicy.RETAIN` in CDK, and Terraform `prevent_destroy`; alarm on `ScheduleKeyDeletion` / `DisableKey` events.
- **Why:** Once the window ends, deletion is irreversible and every object, snapshot and secret encrypted under the key is lost. A 7-day window on a Friday change can expire before anyone notices. Security Hub KMS.3.
- **Detect:** `deletion_window_in_days = 7` (or < 30) on data keys; CDK `removalPolicy: RemovalPolicy.DESTROY` or `pendingWindow: Duration.days(7)` on `kms.Key` used by tables/buckets/databases; no `lifecycle { prevent_destroy = true }`.
- **Fix:** `deletion_window_in_days = 30` + `lifecycle { prevent_destroy = true }`; CDK keep the default `RETAIN` and `pendingWindow` of 30 days.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key ; https://docs.aws.amazon.com/securityhub/latest/userguide/kms-controls.html
- **Last verified:** 2026-10-12

### KMS-010 — Pass an explicit key instead of letting CDK create one per resource
- **Severity:** medium
- **Category:** cost
- **Applies to:** CDK
- **Rule:** When choosing `BucketEncryption.KMS` (or `QueueEncryption.KMS`, `TableEncryption.CUSTOMER_MANAGED` patterns) pass a shared `encryptionKey`, or use `KMS_MANAGED`/`S3_MANAGED` when no key control is needed.
- **Why:** `encryption: BucketEncryption.KMS` without `encryptionKey` makes CDK create a new CMK for that bucket (and `QueueEncryption.KMS` does the same per queue, with rotation off); repeated across constructs it multiplies key cost (KMS-002, $1–3/month each) and the key policies to review.
- **Detect:** `encryption: s3.BucketEncryption.KMS` with no `encryptionKey`; `encryption: sqs.QueueEncryption.KMS` with no `encryptionMasterKey`.
- **Fix:** `new s3.Bucket(this, 'Data', { encryption: s3.BucketEncryption.KMS, encryptionKey: dataKey, bucketKeyEnabled: true })`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.BucketProps.html ; https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-sqs/lib/queue.ts
- **Last verified:** 2026-10-12

### KMS-011 — Use a customer managed key for anything shared across accounts
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** Secrets, buckets, snapshots or queues that another account must read need a CMK whose key policy grants that account; AWS managed keys cannot be shared.
- **Why:** AWS managed keys have key policies you cannot edit; Secrets Manager states you can't use `aws/secretsmanager` for cross-account access. With `aws/secretsmanager` or `aws/s3`, the cross-account reader gets `AccessDenied` from KMS even though the resource policy allows it, which surfaces as a production incident on first use.
- **Detect:** Resource policies granting another account access to a secret/bucket/queue encrypted with the default AWS managed key (no `kms_key_id` / `encryptionKey`).
- **Fix:** Create a CMK, grant the foreign role `kms:Decrypt` with `kms:ViaService`, and set it as the resource's key.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access_examples_cross.html ; https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html
- **Last verified:** 2026-10-12

### KMS-012 — Use envelope encryption for payloads over 4 KB
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Call KMS `Encrypt` only for small secrets (≤ 4,096 bytes with symmetric keys); for files, documents or record batches use `GenerateDataKey` and encrypt locally, ideally through the AWS Encryption SDK.
- **Why:** `Encrypt` rejects plaintext over 4,096 bytes, so code that works for small test payloads fails in production; per-record `Encrypt` calls also add a KMS request (and its latency and cost) per item.
- **Detect:** TS `new EncryptCommand({ Plaintext: ` with file buffers, `JSON.stringify(` of whole objects or loops over records; Go `kmsClient.Encrypt(ctx, &kms.EncryptInput{Plaintext: ` inside loops or with `os.ReadFile` data.
- **Fix:** `GenerateDataKeyCommand({ KeyId, KeySpec: 'AES_256' })`, encrypt with the plaintext data key (AES-GCM), store the encrypted data key alongside, discard the plaintext key; or `@aws-crypto/client-node` / the Encryption SDK for Go-compatible formats.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/kms/latest/APIReference/API_Encrypt.html ; https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/introduction.html
- **Last verified:** 2026-10-12

### KMS-013 — Bind ciphertext to its context with EncryptionContext
- **Severity:** low
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** Pass a non-secret `EncryptionContext` (tenant ID, record type) on `Encrypt`/`GenerateDataKey` and the same map on `Decrypt`; never put secrets in it.
- **Why:** Without context, a ciphertext from tenant A can be swapped into tenant B's record and still decrypt. The context is logged in CloudTrail in plaintext, which also makes decrypt audits meaningful.
- **Detect:** `EncryptCommand`/`DecryptCommand`/`GenerateDataKeyCommand` (TS) or `kms.EncryptInput`/`kms.DecryptInput` (Go) without `EncryptionContext` in multi-tenant code paths; context values holding passwords or tokens.
- **Fix:** `new EncryptCommand({ KeyId, Plaintext, EncryptionContext: { tenantId } })` and the same `EncryptionContext` on decrypt.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html ; https://docs.aws.amazon.com/kms/latest/APIReference/API_Encrypt.html
- **Last verified:** 2026-10-12
