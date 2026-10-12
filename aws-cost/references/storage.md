# Storage

Prices below are us-east-1 as verified on 2026-10-12. Confirm them live before quoting.
Reference prices: S3 Standard $0.023/GB-month (first 50 TB); PUT/COPY/POST/LIST $0.005 per
1,000; GET $0.0004 per 1,000; gp3 is 20% cheaper per GiB than gp2 with 3,000 IOPS and
125 MiB/s included; EBS snapshot archive tier $0.0125/GB-month with a 90-day minimum. The S3
pricing page renders its storage-class and Intelligent-Tiering monitoring tables dynamically:
read the live page for Standard-IA, Glacier and monitoring prices before quoting them.

Hand off S3 behaviour, durability and CloudFront configuration to `aws-storage`.

### COST-050 — Give buckets that accumulate data a lifecycle
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Buckets holding logs, uploads in progress, exports, build artifacts, backups or temp files have lifecycle rules that expire or transition objects.
- **Why:** Without expiry, storage grows linearly forever: a log bucket receiving 500 GB/month costs $11.50 more every month; after two years it is 12 TB and $276/month for data nobody reads.
- **Detect:** `aws_s3_bucket` named/used for `logs`, `tmp`, `uploads`, `artifacts`, `exports`, `backups`, ALB/CloudFront access logs, CloudTrail with no `aws_s3_bucket_lifecycle_configuration`; CDK `new s3.Bucket(` without `lifecycleRules`; SST `sst.aws.Bucket` without a `transform.bucket` lifecycle.
- **Fix:**
  ```ts
  new s3.Bucket(this, "Logs", {
    lifecycleRules: [{ expiration: Duration.days(90), transitions: [{ storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(30) }] }],
  });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### COST-051 — Abort incomplete multipart uploads
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Every bucket that receives multipart uploads (SDK `Upload`, `CreateMultipartUpload`, browser direct uploads) has an `AbortIncompleteMultipartUpload` rule.
- **Why:** Parts of abandoned uploads are billed as storage but are invisible in normal listings; they accumulate silently on upload buckets.
- **Detect:** Code using `@aws-sdk/lib-storage` `new Upload(`, `CreateMultipartUploadCommand`, Go `manager.NewUploader(` / `feature/s3/manager`, and the target bucket lacks `abort_incomplete_multipart_upload { days_after_initiation = N }` / CDK `abortIncompleteMultipartUploadAfter`.
- **Fix:** `abort_incomplete_multipart_upload { days_after_initiation = 7 }` / `abortIncompleteMultipartUploadAfter: Duration.days(7)`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration
- **Last verified:** 2026-10-12

### COST-052 — Expire noncurrent versions on versioned buckets
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Versioned buckets expire noncurrent versions (and clean expired delete markers) after the recovery window.
- **Why:** With versioning, every overwrite and delete keeps the old bytes billed. A bucket overwriting a 50 GB dataset daily accumulates ~1.5 TB of noncurrent versions per month.
- **Detect:** `aws_s3_bucket_versioning` `status = "Enabled"` with no `noncurrent_version_expiration` in the lifecycle; CDK `versioned: true` without `noncurrentVersionExpiration`.
- **Fix:** `noncurrent_version_expiration { noncurrent_days = 30 newer_noncurrent_versions = 3 }` / CDK `noncurrentVersionExpiration: Duration.days(30), noncurrentVersionsToRetain: 3`; add `expired_object_delete_marker = true` in an expiration rule.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration
- **Last verified:** 2026-10-12

### COST-053 — Use Intelligent-Tiering for large objects with unknown access patterns
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Long-lived data sets of objects ≥128 KB with unpredictable access use S3 Intelligent-Tiering (via lifecycle or `StorageClass` on upload); small or short-lived objects stay in Standard.
- **Why:** Intelligent-Tiering moves objects to cheaper tiers after 30 and 90 days without access, with no retrieval fees, for a per-object monitoring fee. Objects under 128 KB are never tiered (they stay in the Frequent tier), so they gain nothing.
- **Detect:** Data lakes / media buckets in Standard with no transitions; conversely `StorageClass: "INTELLIGENT_TIERING"` on uploads of small JSON/thumbnail objects (`PutObjectCommand({ StorageClass: "INTELLIGENT_TIERING" })`, Go `types.StorageClassIntelligentTiering`) or objects deleted within days.
- **Fix:** `transition { days = 0 storage_class = "INTELLIGENT_TIERING" }`, keeping the default 128 KB transition floor (`transition_default_minimum_object_size = "all_storage_classes_128K"`) so small objects stay in Standard; enable archive tiers (`aws_s3_bucket_intelligent_tiering_configuration`) only if asynchronous retrieval is acceptable.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### COST-054 — Respect minimum durations and per-object overhead when transitioning
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Lifecycle transitions keep objects ≥128 KB and keep them in the target class past its minimum duration; small objects are aggregated before archiving.
- **Why:** Each transition is a billed request per object; Glacier Flexible/Deep Archive add 40 KB of metadata per object (8 KB at Standard rates) and bill 90/180-day minimums on early delete. Archiving 100M × 10 KB objects pays 100M transition requests and stores 4 TB of overhead for 1 TB of data.
- **Detect:** `aws_s3_bucket_lifecycle_configuration` with `transition_default_minimum_object_size = "varies_by_storage_class"` or `filter { object_size_greater_than = 1 }`; transitions to `GLACIER`/`DEEP_ARCHIVE` followed by `expiration` sooner than 90/180 days; transitions to `STANDARD_IA`/`ONEZONE_IA` followed by `expiration` less than 30 days later (the 30-day minimum is billed anyway).
- **Fix:** Keep the default 128 KB floor (`all_storage_classes_128K`), batch small files into archives (tar/Parquet) before transitioning, and make expiration ≥ the class minimum.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### COST-055 — Use gp3, not gp2, for EBS volumes
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** New EBS volumes, launch templates and root devices declare `gp3`.
- **Why:** gp3 is 20% cheaper per GiB than gp2 and includes 3,000 IOPS/125 MiB/s regardless of size. Terraform `aws_ebs_volume` and CDK `ec2.Volume` both still default to gp2, so omitting the type picks the dearer one.
- **Detect:** `aws_ebs_volume` without `type` or `type = "gp2"`; `root_block_device` / `ebs_block_device` / `block_device_mappings { ebs { volume_type = "gp2" } }` or no `volume_type`; CDK `new ec2.Volume(` without `volumeType`, `ec2.BlockDeviceVolume.ebs(size)` without `volumeType: EbsDeviceVolumeType.GP3`.
- **Fix:** `type = "gp3"` / `volumeType: ec2.EbsDeviceVolumeType.GP3`; existing volumes migrate online with Elastic Volumes.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/ebs/latest/userguide/general-purpose.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ebs_volume ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Volume.html
- **Last verified:** 2026-10-12

### COST-056 — Do not leave orphaned volumes and unbounded snapshots
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Volumes are deleted with their instance unless retained on purpose, and snapshots have a retention policy (DLM / AWS Backup) or move to the archive tier when kept long term.
- **Why:** An unattached volume bills full price forever; daily snapshots with no retention grow without bound. Archive tier is $0.0125/GB-month but has a 90-day minimum and a restore fee, so it suits only rarely restored snapshots.
- **Detect:** `ebs_block_device { delete_on_termination = false }` without reason; `aws_ebs_volume` + `aws_volume_attachment` with `skip_destroy`; code calling `CreateSnapshotCommand` / Go `ec2.CreateSnapshot` on a schedule without a matching delete; no `aws_dlm_lifecycle_policy` / `aws_backup_plan` `lifecycle { delete_after = ... }`.
- **Fix:** DLM or AWS Backup plan with `delete_after`; `cold_storage_after` / snapshot archive for compliance copies; remove ad-hoc snapshot code.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-archive.html ; https://aws.amazon.com/ebs/pricing/
- **Last verified:** 2026-10-12

### COST-057 — Expire old container images in ECR
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** ECR repositories that receive CI pushes have a lifecycle policy expiring untagged images and keeping the last N tagged ones.
- **Why:** ECR bills storage per GB-month; every CI build pushes hundreds of MB, so a repo with no policy grows by tens of GB a month indefinitely.
- **Detect:** `aws_ecr_repository` without `aws_ecr_lifecycle_policy`; CDK `new ecr.Repository(` without `lifecycleRules`.
- **Fix:**
  ```ts
  new ecr.Repository(this, "Repo", { lifecycleRules: [{ tagStatus: ecr.TagStatus.UNTAGGED, maxImageAge: Duration.days(7) }, { maxImageCount: 30 }] });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html ; https://aws.amazon.com/ecr/pricing/
- **Last verified:** 2026-10-12

### COST-058 — Batch tiny S3 writes and stop polling with LIST
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** High-rate producers aggregate records into larger objects (Firehose, buffered writers), and consumers use S3 Event Notifications instead of periodic `ListObjectsV2` polling.
- **Why:** PUT and LIST cost $0.005 per 1,000. Writing one object per event at 1,000 events/s is 2.63B PUTs/month = $13,140/month; the same data buffered into 1-minute files is 43,800 PUTs ≈ $0.22.
- **Detect:** `PutObjectCommand` inside a per-message loop or per-request handler for small payloads; Go `s3.PutObject` per record; scheduled functions calling `ListObjectsV2Command` / `paginateListObjectsV2` to find new files.
- **Fix:** Use Data Firehose to S3 (buffering), or buffer in memory and flush by size/time; replace polling with `aws_s3_bucket_notification` → SQS/EventBridge. Hand off event design to `aws-messaging`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12
