---
name: aws-storage
description: Review S3 and CloudFront code and infrastructure (Terraform, CDK v2, SST v3, AWS SDK for JavaScript v3, aws-sdk-go-v2) for public buckets, unsafe presigned URLs, missing lifecycle rules, storage-class and request waste, broken event handlers, OAI/OAC mistakes, cache keys that kill the hit ratio, weak TLS and costly invalidations. Use when the user asks "review my S3 bucket", "is this CloudFront distribution right", "why is my S3 bill growing", "check my presigned URLs / uploads", "review this StaticSite", or when aws-review dispatches it with a file list.
metadata:
  author: Jibaru
  version: 1.1.0
---

# aws-storage

Static reviewer for S3 and CloudFront. It reads files, diffs and `terraform plan` / `cdk diff` /
`sst diff` output; it never calls an AWS account. It reports findings and edits nothing until
the user asks for fixes.

**Covers:** S3 buckets (Block Public Access, bucket policies, Object Ownership/ACLs, encryption,
versioning, lifecycle, storage classes, logging, CORS), S3 from code (presigned URLs, uploads,
listing, deletes, conditional writes, event notifications, request patterns), and CloudFront
(origin access, TLS, cache/origin-request/response-headers policies, compression, price class,
Origin Shield, invalidations, CloudFront Functions vs Lambda@Edge, signed URLs).

**Hands off** (one line, "hand off to <skill>", no finding of your own):
- IAM design beyond bucket/object ARNs, KMS key strategy, WAF → `aws-security`
- Lambda/ECS settings of the functions that process S3 events → `aws-compute`
- SQS/SNS/EventBridge behind S3 notifications (DLQs, retries) → `aws-messaging`
- DNS, ACM, API Gateway, VPC endpoints for S3 → `aws-networking`
- Removal policies, state, stack structure in general → `aws-iac`
- Account-wide cost roll-ups → `aws-cost`; alarms, metrics, log analytics → `aws-observability`
- DynamoDB/RDS used as an index of S3 objects → `aws-data`

## Signals

This expert applies when the files contain any of these.

**Files:** `*.tf`, `*.tf.json`, `cdk.json`, `lib/**/*.ts`, `bin/**/*.ts`, `sst.config.ts`,
`infra/**/*.ts`, `*.go`, `*.ts`/`*.js`/`*.mjs` handlers, `terraform plan`, `cdk diff`, `sst diff` output.

**Terraform:** `aws_s3_bucket`, `aws_s3_bucket_policy`, `aws_s3_bucket_public_access_block`,
`aws_s3_bucket_ownership_controls`, `aws_s3_bucket_acl`, `aws_s3_bucket_versioning`,
`aws_s3_bucket_lifecycle_configuration`, `aws_s3_bucket_server_side_encryption_configuration`,
`aws_s3_bucket_notification`, `aws_s3_bucket_logging`, `aws_s3_bucket_cors_configuration`,
`aws_s3_bucket_website_configuration`, `aws_s3_bucket_intelligent_tiering_configuration`,
`aws_s3_object`, `aws_cloudfront_distribution`, `aws_cloudfront_origin_access_control`,
`aws_cloudfront_origin_access_identity`, `aws_cloudfront_cache_policy`,
`aws_cloudfront_origin_request_policy`, `aws_cloudfront_response_headers_policy`,
`aws_cloudfront_function`, `aws_cloudfront_key_group`, `lambda_function_association`, `custom_origin_config`.

**CDK v2:** `aws-cdk-lib/aws-s3`, `new s3.Bucket(`, `aws-s3-notifications`, `addEventNotification`,
`aws-s3-deployment`, `BucketDeployment`, `aws-cloudfront`, `new cloudfront.Distribution(`,
`aws-cloudfront-origins`, `S3BucketOrigin`, `S3Origin`, `OriginAccessIdentity`, `CachePolicy`,
`OriginRequestPolicy`, `ResponseHeadersPolicy`, `cloudfront.Function`, `EdgeFunction`, `edgeLambdas`, `FunctionUrlOrigin`, `HttpOrigin`.

**SST v3:** `sst.aws.Bucket`, `.notify(`, `.subscribe(`, `sst.aws.StaticSite`, `sst.aws.Router`,
`sst.aws.Nextjs`/`Astro`/`Remix`/`SvelteKit` (CloudFront + S3 underneath), `link: [bucket]`.

**TypeScript (SDK v3):** `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`,
`@aws-sdk/s3-request-presigner`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/client-cloudfront`,
`@aws-sdk/cloudfront-signer`, `S3Event`/`S3Handler` from `aws-lambda`, `.s3.object.key`.

**Go (v2):** `github.com/aws/aws-sdk-go-v2/service/s3`, `feature/s3/manager`,
`feature/s3/transfermanager`, `service/cloudfront`, `feature/cloudfront/sign`,
`events.S3Event` from `github.com/aws/aws-lambda-go/events`.

## Procedure

1. **Collect the inputs.** Use the files you were given; otherwise grep the repo with the
   Signals above. When reviewing a change, start from the diff, then open the surrounding
   context it depends on: the bucket a handler writes to, the notification that triggers it,
   the distribution in front of the bucket, the lifecycle of a versioned bucket. Done when every
   bucket, distribution and S3/CloudFront call site in scope is listed with its file.
2. **Open only the references that apply** (index below): buckets or bucket policies →
   `s3-access.md`; lifecycle, storage classes, archive tiers, versioning, KMS → `s3-cost-lifecycle.md`; SDK
   calls or S3 events → `s3-sdk-events.md`; any CloudFront resource → `cloudfront.md`.
3. **Apply every rule in the opened references** to every item from step 1, using each rule's
   **Detect** signals. Then look for problems no rule covers (wrong bucket per stage, key
   collisions, missing tenant prefix, unbounded fan-out) and label them `NEW`.
4. **Verify before reporting.** For each candidate, trace it in the actual code: the value
   really reaches that call, the default really applies (no override elsewhere, no Aspect,
   no `transform`), the bucket really is the one triggered. Drop anything you can't point to
   with a file and line. A rule's default severity may move up or down; say why.
5. **Check staleness.** If a rule you used has `Last verified` more than 120 days before
   today, add "reference is stale, run /aws-refresh". For `Volatile: yes` rules, confirm the
   number live before quoting it: the AWS Knowledge/Documentation MCP if connected, otherwise
   WebFetch the rule's Source URL. If you can't confirm it, report the finding without the
   number and say so.

## Output format

Each finding in the review output:

- **[<severity>] <ID or NEW> — <title>** (category)
- Evidence: `path/to/file:line` (+ quoted snippet)
- Scenario: concrete inputs/state → what goes wrong (or what it costs, with arithmetic and a link to the pricing page when it is cost)
- Fix: concrete change
- Source: <link>

Findings without concrete evidence in the reviewed files are dropped. Rank most severe first.
The reviewer only reports; it applies fixes only if the user asks afterwards. Write the report
in the language of the conversation. When dispatched by `aws-review`, return only the findings
plus one line listing any stale rules used.

## References

| File | Rules | Holds |
| --- | --- | --- |
| [references/s3-access.md](references/s3-access.md) | S3-001–S3-012 | Block Public Access, bucket policies, ACLs, TLS, website endpoints, presigned URLs and uploads, SSE-C, object vs bucket ARNs, access logs, versioning, SST CORS |
| [references/s3-cost-lifecycle.md](references/s3-cost-lifecycle.md) | S3-013–S3-024, S3-041 | Abort MPU, noncurrent versions, delete markers, IA/Glacier minimums, Intelligent-Tiering, small-object archiving, Terraform lifecycle pitfalls, Bucket Keys, temp prefixes, LIST polling, data-bucket retention, archiving data the app still reads |
| [references/s3-sdk-events.md](references/s3-sdk-events.md) | S3-025–S3-040 | Pagination, stream handling, managed uploads, event key decoding, recursive triggers, idempotent handlers, notification ownership, conditional writes, consistency, batch deletes, prefix throughput, direct transfers, SST `link`, CopySource encoding, error mapping |
| [references/cloudfront.md](references/cloudfront.md) | CFN-001–CFN-025 | OAC, SourceArn, KMS, HTTPS, TLS policy, cache/origin/response-header policies, Host header, compression, TTLs and Cache-Control, price class, Origin Shield, invalidations, Functions vs Lambda@Edge, signed URLs, behavior order, methods, SPA error mapping, origin domain, Lambda@Edge limits, function URL OAC payload signing, origin protocol/TLS |
| [references/sources.md](references/sources.md) | — | Every official URL used, grouped by topic, with Last verified dates |
