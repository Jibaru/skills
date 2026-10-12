# aws-storage eval: expected findings

Run: *"run aws-storage on aws-review/evals/aws-storage"*. 12 planted issues, 2 decoys.
A finding counts as a hit when it cites the listed file and line (± 2 lines, or the other
line named in the same entry) with the listed rule ID.

## Planted issues

| # | Evidence | Rule | Why |
| --- | --- | --- | --- |
| 1 | `infra/uploads.tf:21` (versioning `Enabled`, line 24) | S3-014 | Versioned uploads bucket; its only lifecycle rule (`infra/uploads.tf:28`) has no `noncurrent_version_expiration`, so every overwrite/delete keeps billed old versions forever. |
| 2 | `infra/uploads.tf:28` | S3-013 | Lifecycle configuration has no `abort_incomplete_multipart_upload`; abandoned multipart parts are billed indefinitely. |
| 3 | `infra/uploads.tf:99-100` | CFN-001 | S3 origin uses legacy OAI (`s3_origin_config.origin_access_identity`, `aws_cloudfront_origin_access_identity`) instead of OAC. |
| 4 | `infra/site-stack.ts:23` | S3-021 | `BucketEncryption.KMS` with a customer key and no `bucketKeyEnabled: true` (CDK default `false`): one KMS request per object operation. |
| 5 | `infra/site-stack.ts:54` | CFN-011 | `/api/*` behavior (Lambda function URL) uses `CACHING_OPTIMIZED` (min TTL 1 s, default 24 h, no cookies/`Authorization` in the key): per-user API responses get cached and served to other users. |
| 6 | `infra/site-stack.ts:55` | CFN-008 | `OriginRequestPolicy.ALL_VIEWER` forwards the viewer `Host` header to a Lambda function URL origin; requests fail. Should be `ALL_VIEWER_EXCEPT_HOST_HEADER`. |
| 7 | `src/convert.ts:18` | S3-028 | Event key used without URL-decoding; `partner file.csv` arrives as `partner+file.csv` and `GetObject` fails. |
| 8 | `src/convert.ts:28` (trigger at `sst.config.ts:28-37`) | S3-029 | Handler writes `${key}.json` into the same `Imports` bucket whose `ObjectCreated:*` notification has no prefix/suffix filter: each output re-triggers the function (`a.csv.json`, `a.csv.json.json`, …). |
| 9 | `src/share.ts:17` | S3-006 | 7-day presigned URL generated inside a Lambda with role credentials: the link dies when the session expires (hours), and while alive it is a week-long bearer token. |
| 10 | `src/share.ts:28` | S3-007 | Upload key taken verbatim from the request body (`fileName`): any user can overwrite any object, including `uploads/<otherUser>/...`; size unbounded. |
| 11 | `cmd/cleanup/main.go:32` | S3-025 | Single `ListObjectsV2` call, no paginator: only the first 1,000 reports are ever checked. |
| 12 | `cmd/cleanup/main.go:50` | S3-035 | `DeleteObjects` result discarded; per-key failures come back in `Errors` with HTTP 200, so the job logs success while objects remain. |

## Decoys (must not be flagged)

| Evidence | Why it is correct |
| --- | --- |
| `infra/uploads.tf:13-19` | `aws_s3_bucket_public_access_block` with all four settings `true` (S3-001 satisfied). |
| `cmd/cleanup/main.go:70` | `defer out.Body.Close()` right after a successful `GetObject`, and the body is fully read (S3-026 satisfied). |

## Context that is also correct

Not scored as decoys, but a finding here is a false positive: the bucket policy denies
`aws:SecureTransport = false` (S3-004); the distribution in `uploads.tf` uses
`TLSv1.2_2021`, `redirect-to-https`, `compress = true`, a managed cache policy, `GET/HEAD`
only, `PriceClass_100` and trusted key groups; `site-stack.ts` uses `BLOCK_ALL`,
`enforceSSL`, an abort-MPU rule, OAC for both origins and `TLS_V1_2_2021`; `sst.config.ts`
uses `link`, `cors: false` and a single lifecycle resource with abort-MPU.

## Acceptable extra findings (not scored as hits or false positives)

These are defensible readings of the fixture that the planted list doesn't require:

- `infra/site-stack.ts:51-53`, CFN-024: the `/api/*` behavior uses `FunctionUrlOrigin.withOriginAccessControl` with `ALLOW_ALL`, so browser `POST`/`PUT` calls need `x-amz-content-sha256`. The fixture has no client code, so this can only be reported as a risk to check.
- `sst.config.ts:12`, S3-011: the `Imports` bucket isn't versioned. Whether the CSVs can be re-uploaded from their source is a judgment call.
