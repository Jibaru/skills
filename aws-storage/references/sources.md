# Sources

Every official page the rules cite, grouped by topic, so links can be re-found if they move.
All Last verified 2026-10-12. `/aws-refresh` re-checks these.

## S3: access, encryption, data protection

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html | The four BPA settings, what "public" means for policies (fixed-value conditions), BPA doesn't modify existing policies | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/configuring-block-public-access-bucket.html | Configuring bucket-level BPA | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html | BucketOwnerEnforced default, `AccessControlListNotSupported` on ACL writes | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html | `aws:SecureTransport`, disable ACLs, versioning, SSE-C blocked by default since April 2026, wildcard principals | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-s3-c-encryption-setting-faq.html | SSE-C default-block FAQ | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html | SSE-S3 default since Jan 5 2023, KMS quotas, log destination needs SSE-S3 | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html | Bucket Keys cut KMS request cost by up to 99%, encryption-context change | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html | 7-day SigV4 max, URL dies with temporary credentials, `s3:signatureAge` | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html | Presigned POST policy conditions (`content-length-range`) | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-server-access-logging.html | Same-bucket logging loop warning, SSE-S3 destination, no Object Lock retention | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html | Best-effort log delivery, CloudWatch Logs destination | 2026-10-12 |

## S3: lifecycle, storage classes, pricing

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://aws.amazon.com/s3/pricing/ | Storage (Standard $0.023, Standard-IA $0.0125, One Zone-IA $0.01, Glacier IR $0.004, Flexible $0.0036, Deep Archive $0.00099 per GB-month, us-east-1), PUT/LIST $0.005 and GET $0.0004 per 1,000, Intelligent-Tiering monitoring $0.0025 per 1,000 objects; 40 KB Glacier metadata | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects.html | Archived classes/tiers need a restore before reads | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html | Minimum durations (30/90/180 days), 128 KB minimum billable size, IT tiers | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html | Supported transitions, < 128 KB transition default (Sept 2024), Glacier overhead and transition request cost | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-configuration-examples.html | Noncurrent version expiration, `NewerNoncurrentVersions`, expired delete markers, small-object filters | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html | AbortIncompleteMultipartUpload rule | 2026-10-12 |
| https://aws.amazon.com/kms/pricing/ | $0.03 per 10,000 KMS requests, 20,000 free | 2026-10-12 |

## S3: API, SDKs, events, performance

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html | 1,000 keys per page, continuation tokens | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html | GetObject errors (`NoSuchKey`, 403 without ListBucket, `InvalidObjectState` on archived objects) | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html | HeadObject `NotFound` | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html | CopyObject, `CopySource` encoding | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html | 1,000 keys per request, HTTP 200 with per-key `Error` elements | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html | Multipart limits: 5 MiB–5 GiB parts, 10,000 parts, 48.8 TiB max object, multipart from 100 MB | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html | `If-None-Match`/`If-Match`, 412/409 behavior | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel | Strong read-after-write consistency, last-writer-wins, no object locking | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html | 3,500/5,500 requests per second per prefix, 503 Slow Down | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html | At-least-once delivery, recursion warning, FIFO not supported | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html | URL-encoded keys, `sequencer`, 64 KB message size for SQS | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventBridge.html | S3 → EventBridge for multiple consumers | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/with-s3.html | Same-bucket trigger loop warning | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html | Recursive loop detection (~16 invocations, S3 supported, SDK minimums) | 2026-10-12 |
| https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/CLIENTS.md | Consume/destroy streaming bodies, `maxSockets` 50 default | 2026-10-12 |
| https://github.com/aws/aws-sdk-go-v2/tree/main/feature/s3/transfermanager | Go transfer manager API (`transfermanager.New`, `UploadObject`, `UploadObjectInput`) | 2026-10-12 |
| https://github.com/aws/aws-lambda-go/blob/main/events/s3.go | `events.S3Object.URLDecodedKey` filled with `url.QueryUnescape` on unmarshal | 2026-10-12 |
| https://github.com/aws/aws-sdk-go-v2/discussions/3306 | Transfer Manager v2 GA (Jan 30 2026), `feature/s3/manager` deprecated | 2026-10-12 |

## IaC providers and frameworks

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket | Deprecated inline args (`acl`, `lifecycle_rule`, …), `force_destroy`, `bucket_regional_domain_name` avoids CloudFront redirect issues (provider v6.68) | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration | `rule.prefix` deprecated (use `filter`), rule without filter = whole bucket, `transition_default_minimum_object_size` (provider v6.68) | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_notification | One notification resource per bucket, EventBridge pattern | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_server_side_encryption_configuration | `bucket_key_enabled`, `blocked_encryption_types` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution | `forwarded_values` deprecated, `compress` default false, `minimum_protocol_version` default TLSv1 (`vip` only SSLv3/TLSv1), `trusted_key_groups`, `origin_protocol_policy`/`origin_ssl_protocols` | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.Bucket.html | Bucket prop defaults (`enforceSSL` false, `bucketKeyEnabled` false, …) | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront.Distribution.html | `minimumProtocolVersion` default and feature flag, `priceClass` default | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins.S3BucketOrigin.html | `withOriginAccessControl` (auto KMS grant), OAI legacy | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins.S3Origin.html | `S3Origin` deprecated | 2026-10-12 |
| https://sst.dev/docs/component/aws/bucket/ | `access`, `cors` default, `enforceHttps`, `versioning`, `lifecycle`, `notify`, link permissions | 2026-10-12 |
| https://sst.dev/docs/component/aws/static-site/ | Invalidation default `all`, asset Cache-Control defaults | 2026-10-12 |
| https://sst.dev/docs/linking/ | `link` and `Resource` | 2026-10-12 |
| https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cloudfront-distribution-distributionconfig.html | `CustomErrorResponses` is distribution-level | 2026-10-12 |

## CloudFront

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html | OAC vs OAI, `AWS:SourceArn` bucket policy, KMS key policy, website endpoints unsupported | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html | Recommended S3 origin domain format | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html#deprecated-global-endpoint | Legacy global endpoint: 307 redirect (pre-2019 Regions) or 400 (newer Regions) | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html | Function URL OAC: `AWS_IAM` auth, PUT/POST need `x-amz-content-sha256` | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html | Origin protocol policy, minimum origin SSL protocol | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html | Security policy options, default cert forces TLSv1, price class | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/secure-connections-supported-viewer-protocols-ciphers.html | Protocols/ciphers per security policy (TLSv1.2_2021, _2025, TLSv1.3_2025) | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html | Viewer protocol policy, path patterns | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html | Fewer cache-key values → higher hit ratio | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html | Cache key composition | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html | Managed cache policy IDs and TTLs; min-TTL > 0 overrides `no-store` | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html | AllViewer vs AllViewerExceptHostHeader IDs, Host header warning | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html | SecurityHeadersPolicy ID and headers | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html | Compression requirements, 1,000–10,000,000 bytes, content types | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html | TTLs and Cache-Control interaction | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html | When Origin Shield helps, dynamic requests always charged, Region choice | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PayingForInvalidation.html | 1,000 free paths/month per account, wildcard = one path | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-functions-choosing.html | CloudFront Functions vs Lambda@Edge comparison | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html | us-east-1, numbered versions, no env vars/VPC/layers/arm64 | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html | Trusted key groups vs root key pairs, behavior ordering for signed content | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GeneratingCustomErrorResponses.html | Custom error responses | 2026-10-12 |
| https://aws.amazon.com/cloudfront/pricing/ | Flat-rate plans, price classes | 2026-10-12 |
| https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/ | Invalidation $0.005/path after 1,000 free, Functions $0.10/M, Lambda@Edge $0.60/M + $0.00005001/GB-s, Origin Shield $0.0075/10k (US), HTTPS $0.0100/10k (US), DTO $0.085/GB next 9 TB (US/Mexico/Canada) | 2026-10-12 |
