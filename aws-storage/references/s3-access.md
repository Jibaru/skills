# S3: access, encryption and data protection

Who can read or write a bucket, how data is encrypted, and how it survives mistakes. Public
exposure through CloudFront lives in [cloudfront.md](cloudfront.md). Account-wide IAM design is
`aws-security`'s lane; these rules stop at the bucket boundary.

### S3-001 — Keep all four Block Public Access settings on
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every bucket keeps `BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy` and `RestrictPublicBuckets` set to true; public delivery goes through CloudFront with OAC (CFN-001), never by opening the bucket.
- **Why:** BPA settings override public ACLs and policies. Turning one off lets the next `"Principal": "*"` policy or `public-read` ACL expose every object, and removing BPA re-exposes anything already public (BPA does not modify existing policies or ACLs).
- **Detect:** Terraform `aws_s3_bucket_public_access_block` with any of `block_public_acls`, `ignore_public_acls`, `block_public_policy`, `restrict_public_buckets` = `false`, or a bucket with a public policy and no such resource. CDK `blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY`, `new s3.BlockPublicAccess({ blockPublicPolicy: false, ... })`, `publicReadAccess: true`. SST `new sst.aws.Bucket(..., { access: "public" })`.
- **Fix:** Terraform:
  ```hcl
  resource "aws_s3_bucket_public_access_block" "this" {
    bucket                  = aws_s3_bucket.this.id
    block_public_acls       = true
    ignore_public_acls      = true
    block_public_policy     = true
    restrict_public_buckets = true
  }
  ```
  CDK: `blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL`. SST: `access: "cloudfront"` (or omit `access`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
- **Last verified:** 2026-10-12

### S3-002 — Scope every `Principal: "*"` bucket-policy Allow with a fixed-value condition
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** A bucket policy statement with `Effect: Allow` and `Principal: "*"` (or `{"AWS": "*"}`) must be pinned by a fixed-value condition (`aws:SourceArn`, `aws:SourceAccount`, `aws:SourceVpce`, `aws:PrincipalOrgID`, …); wildcards in the condition value make it public again.
- **Why:** S3 treats such a policy as public: anyone on the internet can call the allowed actions. `s3:PutObject` to `*` turns the bucket into free hosting for someone else's malware and your bill.
- **Detect:** `aws_s3_bucket_policy` / `aws_iam_policy_document` with `principals { type = "*" ... }` or `type = "AWS", identifiers = ["*"]` and no `condition`; CDK `new iam.AnyPrincipal()` / `new iam.StarPrincipal()` in `bucket.addToResourcePolicy(...)`; SST `policy: [{ principals: "*", ... }]`; JSON `"Principal": "*"`; conditions with `StringLike` + `*` values.
- **Fix:** Grant the concrete principal (service principal + `aws:SourceArn`, role ARN, or org ID):
  ```ts
  bucket.addToResourcePolicy(new iam.PolicyStatement({
    actions: ["s3:GetObject"],
    resources: [bucket.arnForObjects("*")],
    principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
    conditions: { StringEquals: { "AWS:SourceArn": distribution.distributionArn } },
  }));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html#access-control-block-public-access-policy-status ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html
- **Last verified:** 2026-10-12

### S3-003 — Keep ACLs disabled (Object Ownership = BucketOwnerEnforced)
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Leave Object Ownership at `BucketOwnerEnforced` and grant access with policies; do not send ACLs on writes.
- **Why:** With ACLs enabled, objects written by other accounts are owned by the writer and invisible to your policies; a stray `public-read` ACL exposes a single object. With ACLs disabled, any `PutObject` that carries an ACL other than `bucket-owner-full-control` fails with `400 AccessControlListNotSupported`, so code that sets ACLs breaks on new buckets.
- **Detect:** Terraform `aws_s3_bucket_ownership_controls` with `object_ownership = "ObjectWriter"` or `"BucketOwnerPreferred"`, any `aws_s3_bucket_acl`, deprecated `acl =`/`grant` on `aws_s3_bucket`. CDK `objectOwnership: s3.ObjectOwnership.OBJECT_WRITER | BUCKET_OWNER_PREFERRED`, `accessControl: s3.BucketAccessControl.*`. TS `ACL: "public-read"` (or any `ACL:`) in `PutObjectCommand`/`CopyObjectCommand`/`Upload` params. Go `ACL: types.ObjectCannedACLPublicRead`.
- **Fix:** Remove ACL arguments and ACL resources; set `object_ownership = "BucketOwnerEnforced"` (CDK `ObjectOwnership.BUCKET_OWNER_ENFORCED`, or omit, which is the S3 default). Move any cross-account grant into the bucket policy.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html
- **Last verified:** 2026-10-12

### S3-004 — Deny non-TLS requests in the bucket policy
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Add a `Deny` for `aws:SecureTransport = false` on the bucket and `bucket/*`.
- **Why:** Without it, any client (or misconfigured SDK endpoint) can read and write over plain HTTP, exposing data and credentials-bearing presigned URLs in transit. CDK defaults `enforceSSL` to `false`.
- **Detect:** CDK `new s3.Bucket(` without `enforceSSL: true`. Terraform buckets with no policy statement on `aws:SecureTransport`. SST `enforceHttps: false` (SST defaults to `true`).
- **Fix:** CDK `enforceSSL: true` (optionally `minimumTLSVersion: 1.2`). Terraform:
  ```hcl
  statement {
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.this.arn, "${aws_s3_bucket.this.arn}/*"]
    principals { type = "*", identifiers = ["*"] }
    condition { test = "Bool", variable = "aws:SecureTransport", values = ["false"] }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.Bucket.html
- **Last verified:** 2026-10-12

### S3-005 — Don't host a site from a public S3 website endpoint
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Serve static sites from a private bucket's REST endpoint behind CloudFront with OAC instead of `aws_s3_bucket_website_configuration` plus a public-read policy.
- **Why:** Website endpoints only work with a publicly readable bucket, serve HTTP only (CloudFront must reach them as a custom origin over HTTP), and cannot be protected with OAC, so every object in the bucket (including source maps, `.env` leftovers, backups) is world-readable by direct URL. Raise to high when the same bucket holds anything other than public site assets; keep it low for a deliberately public, assets-only bucket that needs S3 redirect rules.
- **Detect:** Terraform `aws_s3_bucket_website_configuration` together with a public `s3:GetObject` policy or BPA off; CloudFront `custom_origin_config` pointing at `*.s3-website-*.amazonaws.com`. CDK `websiteIndexDocument:` + `publicReadAccess: true`, `origins.S3StaticWebsiteOrigin`.
- **Fix:** Private bucket + `origins.S3BucketOrigin.withOriginAccessControl(bucket)`, `defaultRootObject: "index.html"`; do directory-index rewrites in a CloudFront Function (CFN-016). In SST use `sst.aws.StaticSite`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
- **Last verified:** 2026-10-12

### S3-006 — Keep presigned URL expiry short and within the signer's credential lifetime
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Use the shortest `expiresIn` the flow needs (minutes, not days) and never promise a lifetime longer than the credentials that sign it.
- **Why:** A presigned URL is a bearer token usable any number of times until expiry; a 7-day URL leaked in a log or a chat is 7 days of access. URLs signed with role credentials (Lambda, ECS, `AssumeRole`) die when the session expires, even if `expiresIn` is longer, so "7-day download links" from Lambda break within hours and users get `ExpiredToken`/403.
- **Detect:** TS `getSignedUrl(client, cmd, { expiresIn: N })` with N ≥ 3600 (or `604800`), especially inside a Lambda handler; Go `s3.NewPresignClient(...).PresignGetObject(..., s3.WithPresignExpires(d))` or `opts.Expires = ...` with hours/days. URLs stored in a database or emailed for later use.
- **Fix:** Issue URLs on demand with a short TTL and regenerate when needed:
  ```ts
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: 300 });
  ```
  For long-lived links, store the key and sign at click time, or use CloudFront signed URLs (CFN-018). Optionally cap age in the bucket policy with `s3:signatureAge`.
- **Volatile:** yes (maximum 7 days with SigV4)
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- **Last verified:** 2026-10-12

### S3-007 — Pick the key server-side and bound upload size for browser uploads
- **Severity:** high
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** When presigning uploads, derive the object key on the server (user-scoped prefix + random ID) and use a presigned POST with `content-length-range` (and `Content-Type` condition) when size must be bounded.
- **Why:** A presigned PUT overwrites whatever object has that key. Taking the key (or a path) from the request lets one user overwrite another's object or a site asset (`../index.html`), and a presigned PUT cannot enforce a size range (at most an exact `ContentLength` if you sign it), so a client can upload gigabytes you pay to store.
- **Detect:** `new PutObjectCommand({ Bucket, Key: req.body.key | event.queryStringParameters.key | body.fileName })` passed to `getSignedUrl`; Go `PresignPutObject` with `Key: aws.String(r.FormValue(...))`; no `@aws-sdk/s3-presigned-post` / `createPresignedPost` when files come from browsers.
- **Fix:**
  ```ts
  import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
  const Key = `uploads/${userId}/${crypto.randomUUID()}`;
  const post = await createPresignedPost(s3, {
    Bucket, Key, Expires: 300,
    Conditions: [["content-length-range", 1, 10 * 1024 * 1024], ["eq", "$Content-Type", "image/png"]],
  });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html ; https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html
- **Last verified:** 2026-10-12

### S3-008 — Don't depend on SSE-C; it is blocked by default on new buckets
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform
- **Rule:** Use SSE-S3 (default) or SSE-KMS; if SSE-C is truly required, unblock it explicitly on that bucket and document why.
- **Why:** Since April 2026 new general purpose buckets (and existing buckets in accounts with no SSE-C objects) reject SSE-C writes with `403 AccessDenied`. Code that sends `SSECustomerKey` works against an old bucket and fails on a freshly created one in another stage. SSE-C also makes the data unreadable to AWS services and anyone without the key.
- **Detect:** TS `SSECustomerAlgorithm` / `SSECustomerKey` in `PutObjectCommand`, `GetObjectCommand`, `CopyObjectCommand`, `CreateMultipartUploadCommand`; Go `SSECustomerKey:` in `s3.PutObjectInput`. Terraform `blocked_encryption_types = ["NONE"]` on `aws_s3_bucket_server_side_encryption_configuration` (unblocks SSE-C) without a documented need.
- **Fix:** Drop SSE-C parameters; set default encryption to SSE-KMS with a bucket key if you need key control (S3-021). To make the block explicit in IaC, set `blocked_encryption_types = ["SSE-C"]` (Terraform AWS provider v6).
- **Volatile:** yes (default changed April 2026)
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-s3-c-encryption-setting-faq.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_server_side_encryption_configuration
- **Last verified:** 2026-10-12

### S3-009 — Put object actions on `bucket/*` and list actions on the bucket ARN
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** `s3:GetObject`/`PutObject`/`DeleteObject` need `arn:aws:s3:::bucket/*` (or a prefix); `s3:ListBucket` needs `arn:aws:s3:::bucket` (narrow with `s3:prefix`). Prefer the construct grants (`bucket.grantRead`) or SST `link`.
- **Why:** Object actions on the bare bucket ARN match nothing, so the function gets `AccessDenied` in production; the usual "fix" is `Resource: "*"` with `s3:*`, which grants every bucket in the account. Without `s3:ListBucket`, `GetObject` on a missing key returns 403 instead of 404, hiding real bugs.
- **Detect:** IAM statements with `s3:GetObject` and `resources = [aws_s3_bucket.x.arn]` (no `/*`); `actions = ["s3:*"]` with `resources = ["*"]`; CDK `new iam.PolicyStatement({ actions: ["s3:*"], resources: ["*"] })` where `bucket.grantReadWrite(fn)` would do. Hand off broad IAM design to `aws-security`.
- **Fix:** CDK `bucket.grantRead(fn)`; Terraform `resources = ["${aws_s3_bucket.x.arn}/*"]` for object actions and the bucket ARN for `s3:ListBucket`; SST `link: [bucket]`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html ; https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
- **Last verified:** 2026-10-12

### S3-010 — Send server access logs to a separate SSE-S3 bucket
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** The log destination is a different bucket in the same Region and account, encrypted with SSE-S3, without Object Lock default retention and without logging enabled on itself.
- **Why:** Logging a bucket into itself causes an infinite loop of log objects (growing storage and request bills). An SSE-KMS destination can receive log objects encrypted with a key you cannot use, so the logs are unreadable when you need them.
- **Detect:** Terraform `aws_s3_bucket_logging` with `target_bucket` equal to `bucket`; target bucket with `sse_algorithm = "aws:kms"`. CDK `serverAccessLogsBucket: this` / same bucket, or `serverAccessLogsPrefix` without `serverAccessLogsBucket` on a KMS-encrypted bucket.
- **Fix:** Dedicated log bucket per Region with SSE-S3 and a bucket policy for `logging.s3.amazonaws.com` scoped by `aws:SourceArn`/`aws:SourceAccount`; add an expiration lifecycle rule on it.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-server-access-logging.html
- **Last verified:** 2026-10-12

### S3-011 — Version buckets that hold data you cannot recreate
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Enable versioning (with S3-014's noncurrent expiration) on buckets storing user uploads, documents or state; skip it for caches and build artifacts.
- **Why:** Without versioning an overwrite or a buggy delete loop is permanent: S3 has no undelete. Versioning is also required for replication.
- **Detect:** Buckets named or used for `uploads`, `documents`, `attachments`, `state`, `backups` with no `aws_s3_bucket_versioning` (`status = "Enabled"`), CDK `versioned` absent/false, SST `versioning` absent (SST default `false`). Names are only a hint: confirm from the code that the bucket holds originals nobody can regenerate (user uploads), and skip buckets whose objects are derived from another source (imports already stored elsewhere, thumbnails, exports, build output).
- **Fix:** Terraform `aws_s3_bucket_versioning { versioning_configuration { status = "Enabled" } }`; CDK `versioned: true`; SST `versioning: true`. Pair with S3-014 so old versions do not accumulate.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html ; https://sst.dev/docs/component/aws/bucket/
- **Last verified:** 2026-10-12

### S3-012 — Narrow SST Bucket's default CORS
- **Severity:** low
- **Category:** security
- **Applies to:** SST
- **Rule:** When a bucket is used from browsers, set `cors` to your origins and the methods you use; set `cors: false` when no browser touches it.
- **Why:** `sst.aws.Bucket` defaults CORS to all origins, all headers and `DELETE, GET, HEAD, POST, PUT`. S3 doesn't use cookies, so this is defense in depth rather than an open door: it lets script on any website read objects it has URLs for and replay leaked presigned PUT/DELETE URLs from the browser, and it hides which front ends are supposed to call the bucket.
- **Detect:** `new sst.aws.Bucket("X")` or `new sst.aws.Bucket("X", { ... })` without a `cors` key, while presigned URLs are generated for it; Terraform `aws_s3_bucket_cors_configuration` with `allowed_origins = ["*"]` and `PUT`/`DELETE` in `allowed_methods`; CDK `cors: [{ allowedOrigins: ["*"], allowedMethods: [..., s3.HttpMethods.DELETE] }]`.
- **Fix:**
  ```ts
  new sst.aws.Bucket("Uploads", {
    cors: { allowOrigins: ["https://app.example.com"], allowMethods: ["PUT", "GET"] },
  });
  ```
- **Volatile:** yes (SST default)
- **Source:** https://sst.dev/docs/component/aws/bucket/
- **Last verified:** 2026-10-12
