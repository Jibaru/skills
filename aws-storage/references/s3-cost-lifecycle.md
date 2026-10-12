# S3: lifecycle, storage classes and request cost

What a bucket costs over months: forgotten versions and parts, storage-class minimums that cost
more than they save, KMS and request charges. Prices are US East (N. Virginia) on
https://aws.amazon.com/s3/pricing/ as of the Last verified date; confirm live before quoting
(rules marked Volatile). Cross-service cost roll-ups belong to `aws-cost`.

Reference prices used below (us-east-1): S3 Standard $0.023/GB-month (first 50 TB),
Standard-IA $0.0125, One Zone-IA $0.01, Glacier Instant Retrieval $0.004, Glacier Flexible
Retrieval $0.0036, Glacier Deep Archive $0.00099; PUT/COPY/POST/LIST $0.005 per 1,000; GET
$0.0004 per 1,000; Intelligent-Tiering monitoring $0.0025 per 1,000 objects/month; KMS $0.03
per 10,000 requests.

### S3-013 — Add an AbortIncompleteMultipartUpload lifecycle rule to every bucket
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every bucket that receives multipart uploads (anything written with `Upload`, the transfer manager, the CLI, or browser uploaders) has a rule that aborts incomplete uploads after a few days (7 is the AWS example).
- **Why:** Parts of uploads that were never completed or aborted are stored and billed indefinitely, and they do not show up in `ListObjectsV2`, so the bill grows with nothing visible in the bucket.
- **Detect:** Terraform `aws_s3_bucket_lifecycle_configuration` absent, or present without `abort_incomplete_multipart_upload { days_after_initiation = N }`. CDK `lifecycleRules` without `abortIncompleteMultipartUploadAfter`. SST `sst.aws.Bucket` has no native arg for it (`lifecycle` only supports expiration): look for `transform.lifecycle` or a separate `aws.s3.BucketLifecycleConfiguration`.
- **Fix:** Terraform:
  ```hcl
  rule {
    id     = "abort-mpu"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  ```
  CDK `lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(7) }]`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html
- **Last verified:** 2026-10-12

### S3-014 — Expire noncurrent versions on versioned buckets
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** A versioned bucket has `NoncurrentVersionExpiration` (days, optionally `NewerNoncurrentVersions` to keep N) unless retention requirements say otherwise.
- **Why:** With versioning, every overwrite and every delete keeps the old bytes. A bucket overwriting a 50 MB file hourly keeps 24 × 30 × 50 MB ≈ 36 GB of hidden versions per month per object, billed at the full storage-class rate, forever.
- **Detect:** `aws_s3_bucket_versioning` with `status = "Enabled"` and no `noncurrent_version_expiration` block in the bucket's lifecycle configuration; CDK `versioned: true` without `noncurrentVersionExpiration` in `lifecycleRules`; SST `versioning: true` (no native noncurrent arg; check `transform.lifecycle`).
- **Fix:** Terraform:
  ```hcl
  noncurrent_version_expiration {
    noncurrent_days           = 30
    newer_noncurrent_versions = 5
  }
  ```
  CDK `{ noncurrentVersionExpiration: Duration.days(30), noncurrentVersionsToRetain: 5 }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-configuration-examples.html#lifecycle-config-conceptual-ex6
- **Last verified:** 2026-10-12

### S3-015 — Clean up expired object delete markers
- **Severity:** low
- **Category:** performance
- **Applies to:** Terraform, CDK
- **Rule:** When noncurrent versions expire but current versions have no `Expiration.Days`, add a rule with `ExpiredObjectDeleteMarker = true` (it cannot share a rule with `Days` or a tag filter).
- **Why:** Deleted keys leave delete markers that outlive their versions; millions of them slow `ListObjectVersions`/listing-based jobs and clutter inventory.
- **Detect:** Versioned bucket with `noncurrent_version_expiration` but no `expiration { expired_object_delete_marker = true }` and no `expiration { days = N }`; CDK without `expiredObjectDeleteMarker: true`.
- **Fix:** Separate rule: `expiration { expired_object_delete_marker = true }` (CDK `{ expiredObjectDeleteMarker: true }`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-configuration-examples.html#lifecycle-config-conceptual-ex7
- **Last verified:** 2026-10-12

### S3-016 — Keep small objects out of IA and Glacier Instant Retrieval
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Don't write or transition objects smaller than 128 KB to `STANDARD_IA`, `ONEZONE_IA` or `GLACIER_IR`.
- **Why:** These classes bill a 128 KB minimum per object. A 10 KB thumbnail in Standard-IA is billed as 128 KB: 128 × $0.0125 / 1,048,576 GB ≈ 1.5e-6 $/month vs 10 KB in Standard ≈ 2.2e-7 $/month, about 7× more, plus retrieval fees. Since September 2024 lifecycle won't transition objects < 128 KB by default, but explicit `StorageClass` on `PutObject` and `object_size_greater_than` filters bypass that guard.
- **Detect:** TS `StorageClass: "STANDARD_IA" | "ONEZONE_IA" | "GLACIER_IR"` on `PutObjectCommand` for thumbnails, JSON, events, logs; Go `StorageClass: types.StorageClassStandardIa`; Terraform `transition` with `object_size_greater_than` below 131072 or `transition_default_minimum_object_size = "varies_by_storage_class"`; CDK `transitionDefaultMinimumObjectSize: VARIES_BY_STORAGE_CLASS`.
- **Fix:** Keep small objects in Standard (or Intelligent-Tiering, which never charges them monitoring), aggregate them into larger objects, or filter transitions with `object_size_greater_than = 131072`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html#sc-compare ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### S3-017 — Don't put short-lived data in classes with minimum storage duration
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Objects deleted, overwritten or transitioned within 30 days don't belong in Standard-IA/One Zone-IA; within 90 days not in Glacier IR/Flexible; within 180 days not in Deep Archive.
- **Why:** Early removal is billed as if the object stayed the full minimum. Transitioning to Standard-IA at day 0 and expiring at day 7 pays 30 days of IA storage plus a transition request per object, more than leaving it in Standard for 7 days.
- **Detect:** Lifecycle rules where `transition { days = N, storage_class = "STANDARD_IA" }` and `expiration { days = M }` with M − N < 30 (90 for `GLACIER`/`GLACIER_IR`, 180 for `DEEP_ARCHIVE`); `PutObject` with `StorageClass: "STANDARD_IA"` on keys under `tmp/`, `cache/`, `sessions/`, or that the code overwrites regularly.
- **Fix:** Expire short-lived data from Standard; transition only data that will live past the minimum. CDK `transitions: [{ storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(30) }]` paired with `expiration` ≥ 60 days.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html#sc-compare ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html
- **Last verified:** 2026-10-12

### S3-018 — Use Intelligent-Tiering for unknown access patterns, not for tiny or short-lived objects
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Choose `INTELLIGENT_TIERING` for long-lived objects ≥ 128 KB with unpredictable access; for known patterns use lifecycle transitions/expiration instead.
- **Why:** Objects < 128 KB are never monitored or auto-tiered (always billed at Frequent Access, no monitoring fee), so tiering them buys nothing. For ≥ 128 KB objects the monitoring fee is $0.0025 per 1,000 objects/month: 100 M objects of 200 KB ≈ $250/month in fees on ~19 TB, which is fine when they cool down, wasted when they are deleted within weeks.
- **Detect:** `StorageClass: "INTELLIGENT_TIERING"` on writes of small JSON/events; lifecycle transitions to `INTELLIGENT_TIERING` at day 0 on prefixes that also expire in < 30 days; `aws_s3_bucket_intelligent_tiering_configuration` archive tiers enabled while the app reads objects synchronously (Archive/Deep Archive Access need `RestoreObject`).
- **Fix:** Keep Intelligent-Tiering for large, long-lived, unpredictable data; enable the optional archive tiers only when readers can wait for a restore.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html#sc-dynamic-data-access ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### S3-019 — Aggregate small objects before archiving to Glacier Flexible Retrieval or Deep Archive
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Don't transition millions of small objects to `GLACIER`/`DEEP_ARCHIVE`; bundle them (tar/Parquet) first, or filter by size.
- **Why:** Each archived object adds 40 KB of billed metadata (8 KB at Standard rate, 32 KB at the Glacier rate) and costs one transition request. Archiving 10 M log lines of 2 KB each: the overhead alone is 10 M × 8 KB ≈ 76 GB at Standard (≈ $1.75/month) + 10 M × 32 KB ≈ 305 GB at Deep Archive ($0.00099/GB → ≈ $0.30/month), versus ~19 GB of actual data (≈ $0.02/month in Deep Archive), plus 10 M transition requests. The overhead costs ~100× the data it protects.
- **Detect:** Lifecycle `transition { storage_class = "GLACIER" | "DEEP_ARCHIVE" }` on prefixes like `events/`, `logs/`, `json/`, or with `transition_default_minimum_object_size = "varies_by_storage_class"` (allows < 128 KB objects to archive).
- **Fix:** Compact small objects into large ones before archive; add `filter { object_size_greater_than = 131072 }` to archive rules.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html#glacier-pricing-considerations ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### S3-020 — Manage a bucket's lifecycle in one Terraform resource, with `filter` instead of `rule.prefix`
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** Keep a single `aws_s3_bucket_lifecycle_configuration` per bucket, never combined with the deprecated `lifecycle_rule` block on `aws_s3_bucket`; scope rules with `filter { prefix = ... }` (or `filter {}` for the whole bucket), not the deprecated `rule.prefix` argument.
- **Why:** `PutBucketLifecycleConfiguration` replaces the whole rule set, so two sources of lifecycle config overwrite each other on every apply and the abort-MPU or noncurrent rule silently disappears. `rule.prefix` is deprecated by S3 and slated for removal in the next major provider version; a rule can't later be moved from `filter` to `prefix`. (In provider v6 a rule with neither `filter` nor `prefix` applies to the whole bucket, so a missing `filter` alone is not a bug.)
- **Detect:** `aws_s3_bucket` with `lifecycle_rule {` plus a separate `aws_s3_bucket_lifecycle_configuration` for the same bucket; two `aws_s3_bucket_lifecycle_configuration` resources (or Terraform plus CDK/SST) for the same bucket; `rule { prefix = "..." }` directly on the rule.
- **Fix:** One `aws_s3_bucket_lifecycle_configuration` per bucket holding all rules, each with `filter {}` or `filter { prefix = "..." }`.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket
- **Last verified:** 2026-10-12

### S3-021 — Enable S3 Bucket Keys with SSE-KMS
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** When default encryption is `aws:kms`, set `bucket_key_enabled = true`.
- **Why:** Without a bucket key S3 calls KMS for every object read and write. 500 M requests/month ≈ 500 M KMS calls × $0.03/10,000 = $1,500/month, and hot paths hit KMS request-rate quotas (throttling). Bucket Keys cut KMS requests by up to 99%.
- **Detect:** `aws_s3_bucket_server_side_encryption_configuration` with `sse_algorithm = "aws:kms"` and no `bucket_key_enabled = true`; CDK `encryption: s3.BucketEncryption.KMS` (or `encryptionKey`) without `bucketKeyEnabled: true` (CDK default `false`).
- **Fix:** Terraform `rule { apply_server_side_encryption_by_default { sse_algorithm = "aws:kms", kms_master_key_id = aws_kms_key.k.arn } bucket_key_enabled = true }`; CDK `bucketKeyEnabled: true`. Update any key policy that uses the object ARN as encryption context to the bucket ARN.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html ; https://aws.amazon.com/kms/pricing/
- **Last verified:** 2026-10-12

### S3-022 — Expire temporary prefixes
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Prefixes for scratch data (`tmp/`, `staging/`, `exports/`, raw uploads already processed) get an `Expiration` rule.
- **Why:** Without one, every export or intermediate file stays forever at Standard rates; a nightly 5 GB export becomes 1.8 TB (~$42/month and growing) after a year.
- **Detect:** Code writing to keys with `tmp/`, `temp/`, `exports/`, `staging/`, `processed/` prefixes (`PutObjectCommand`, `Upload`, Go `PutObject`) and no matching lifecycle `expiration` in Terraform/CDK/SST (`lifecycle: [{ prefix, expiresIn }]`).
- **Fix:** SST `lifecycle: [{ prefix: "tmp/", expiresIn: "7 days" }]`; CDK `{ prefix: "tmp/", expiration: Duration.days(7) }`; Terraform `filter { prefix = "tmp/" }` + `expiration { days = 7 }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-configuration-examples.html ; https://sst.dev/docs/component/aws/bucket/
- **Last verified:** 2026-10-12

### S3-023 — Don't poll S3 with LIST or HEAD; react to events
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Replace scheduled `ListObjectsV2` scans and `HeadObject` existence checks used as a work queue with S3 Event Notifications/EventBridge, or keep an index elsewhere.
- **Why:** LIST is billed like PUT ($0.005 per 1,000). A job listing a 2 M-object prefix every minute = 2,000 LIST pages × 1,440 runs/day × 30 ≈ 86 M requests ≈ $432/month to find a handful of new files.
- **Detect:** `paginateListObjectsV2`/`ListObjectsV2Command`/`s3.NewListObjectsV2Paginator` inside a cron/scheduled handler (`schedule`, `cron(`, `rate(`, `sst.aws.Cron`); loops calling `HeadObjectCommand` before each `GetObject`.
- **Fix:** `bucket.notify({ notifications: [{ name: "New", function: "src/new.handler", events: ["s3:ObjectCreated:*"], filterPrefix: "incoming/" }] })` (SST) or EventBridge; for "does it exist?", just `GetObject` and handle `NoSuchKey`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/s3/pricing/ ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html
- **Last verified:** 2026-10-12

### S3-024 — Retain buckets that hold real data when the stack is destroyed
- **Severity:** high
- **Category:** reliability
- **Applies to:** CDK, Terraform, SST
- **Rule:** Production data buckets keep `RemovalPolicy.RETAIN` (no `autoDeleteObjects`), Terraform `force_destroy = false` and `lifecycle { prevent_destroy = true }`; SST stages use `removal: "retain"` for production.
- **Why:** `autoDeleteObjects: true` installs a custom resource that empties the bucket on stack delete or on bucket replacement (e.g., a rename), wiping user data with no undelete. `force_destroy = true` does the same on `terraform destroy` or replacement.
- **Detect:** CDK `removalPolicy: RemovalPolicy.DESTROY` with `autoDeleteObjects: true` on buckets not obviously ephemeral; Terraform `force_destroy = true`; `sst.config.ts` `removal: "remove"` for the production stage. Hand off general IaC removal policy to `aws-iac`.
- **Fix:** Gate destroy behavior by stage: `removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY, autoDeleteObjects: !isProd`; SST `removal: input?.stage === "production" ? "retain" : "remove"`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.Bucket.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket
- **Last verified:** 2026-10-12

### S3-041 — Don't archive objects the application still reads with GetObject
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Transition to `GLACIER`/`DEEP_ARCHIVE`, or enable the Intelligent-Tiering Archive Access/Deep Archive Access tiers, only on prefixes that no synchronous code path reads; if a reader must reach archived data, it calls `RestoreObject` and waits for `s3:ObjectRestore:Completed` (or polls `HeadObject` `Restore`).
- **Why:** Objects in Glacier Flexible Retrieval, Glacier Deep Archive and the two Intelligent-Tiering archive tiers are not accessible in real time: `GetObject` returns `InvalidObjectState` until a restore finishes (minutes to hours). A lifecycle rule that archives `uploads/` after 90 days turns every "download my old file" request, presigned GET and CloudFront fetch into an error, while the bucket still looks healthy. (Glacier Instant Retrieval keeps millisecond reads.)
- **Detect:** Terraform `transition { storage_class = "GLACIER" | "DEEP_ARCHIVE" }` or `aws_s3_bucket_intelligent_tiering_configuration` with `tiering { access_tier = "ARCHIVE_ACCESS" | "DEEP_ARCHIVE_ACCESS" }`, CDK `transitions: [{ storageClass: s3.StorageClass.GLACIER | DEEP_ARCHIVE }]` or `intelligentTieringConfigurations` with `archiveAccessTierTime`, on a prefix that application code reads with `GetObjectCommand`/`client.GetObject`/`getSignedUrl(..., new GetObjectCommand(...))` or that sits behind a CloudFront origin; no `RestoreObjectCommand` and no handling of `InvalidObjectState` in that code.
- **Fix:** Use `GLACIER_IR` (or Standard-IA) for data users may open on demand; keep Flexible/Deep Archive for compliance copies read only through a restore workflow:
  ```ts
  await s3.send(new RestoreObjectCommand({ Bucket, Key, RestoreRequest: { Days: 2, GlacierJobParameters: { Tier: "Standard" } } }));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects.html ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html#sc-dynamic-data-access
- **Last verified:** 2026-10-12
