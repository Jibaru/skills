# CloudFront

Distributions in front of S3 and other origins: origin access, TLS, cache keys and TTLs,
compression, price class, Origin Shield, invalidations and edge code. Prices are pay-as-you-go
from https://aws.amazon.com/cloudfront/pricing/ as of the Last verified date (US/Europe where
regional): invalidation $0.005 per path after 1,000 free paths/month per account; CloudFront
Functions $0.10 per 1 M invocations; Lambda@Edge $0.60 per 1 M requests + $0.00005001 per
GB-second; Origin Shield $0.0075 per 10,000 requests (US); HTTPS requests $0.0100 per 10,000
(US); data transfer out $0.085/GB after the free 1 TB (United States, Mexico, Canada; next 9 TB). Flat-rate plans
(Free/Pro/Business/Premium) also exist and change the math; check which pricing model the
distribution is on before quoting. WAF rules and DDoS posture belong to `aws-security`;
DNS/ACM to `aws-networking`.

### CFN-001 — Use Origin Access Control, not legacy OAI or a public origin
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** S3 origins use OAC with `signing_behavior = "always"`, `signing_protocol = "sigv4"`.
- **Why:** OAI is legacy: it doesn't support SSE-KMS, dynamic `PUT`/`DELETE`, or Regions launched after December 2022/January 2023. Teams hit those walls and "fix" them by making the bucket public. CDK `origins.S3Origin` is deprecated.
- **Detect:** Terraform `aws_cloudfront_origin_access_identity`, `s3_origin_config { origin_access_identity = ... }`; `aws_cloudfront_origin_access_control` with `signing_behavior = "never"` or `"no-override"` without a reason. CDK `new origins.S3Origin(`, `S3BucketOrigin.withOriginAccessIdentity(`, `S3BucketOrigin.withBucketDefaults(` on a private bucket, `new cloudfront.OriginAccessIdentity(`.
- **Fix:** Terraform:
  ```hcl
  resource "aws_cloudfront_origin_access_control" "s3" {
    name                              = "site-oac"
    origin_access_control_origin_type = "s3"
    signing_behavior                  = "always"
    signing_protocol                  = "sigv4"
  }
  # origin { domain_name = aws_s3_bucket.site.bucket_regional_domain_name
  #          origin_access_control_id = aws_cloudfront_origin_access_control.s3.id }
  ```
  CDK `origins.S3BucketOrigin.withOriginAccessControl(bucket)`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins.S3Origin.html
- **Last verified:** 2026-10-12

### CFN-002 — Pin the OAC bucket policy to your distribution with `AWS:SourceArn`
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** The bucket policy statement for `cloudfront.amazonaws.com` carries `StringEquals { "AWS:SourceArn": "arn:aws:cloudfront::<account>:distribution/<id>" }`.
- **Why:** Without the condition the service principal is allowed for any distribution, including one created in another account that points an OAC at your bucket (confused deputy): your private bucket becomes readable through someone else's CDN.
- **Detect:** Policy statements with `principals { type = "Service", identifiers = ["cloudfront.amazonaws.com"] }` and no `condition` on `AWS:SourceArn`/`aws:SourceArn`; CDK `new iam.ServicePrincipal("cloudfront.amazonaws.com")` added manually without `conditions`. SST `sst.aws.Bucket` with `access: "cloudfront"` generates this statement without a `SourceArn` condition (checked in SST source on the Last verified date); add the condition via `transform.policy` or the `policy` arg when the bucket holds private data.
- **Fix:** Add `condition { test = "StringEquals", variable = "AWS:SourceArn", values = [aws_cloudfront_distribution.site.arn] }`. CDK `S3BucketOrigin.withOriginAccessControl` writes the scoped statement for you.
- **Volatile:** yes (SST behavior)
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html#oac-permission-to-access-s3 ; https://sst.dev/docs/component/aws/bucket/
- **Last verified:** 2026-10-12

### CFN-003 — Grant the distribution `kms:Decrypt` when the S3 origin uses SSE-KMS
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** With OAC + SSE-KMS, the KMS key policy allows `cloudfront.amazonaws.com` `kms:Decrypt` (plus `Encrypt`/`GenerateDataKey*` for uploads) conditioned on the distribution ARN.
- **Why:** Without it every request through CloudFront returns 403 from S3 even though the bucket policy is correct; the site is down after someone "hardens" encryption.
- **Detect:** Terraform bucket with `sse_algorithm = "aws:kms"` and a customer-managed `kms_master_key_id`, fronted by a distribution with `origin_access_control_id`, and an `aws_kms_key` policy with no `cloudfront.amazonaws.com` statement. CDK handles this automatically only with `S3BucketOrigin.withOriginAccessControl`; flag hand-built origins.
- **Fix:** KMS key policy statement: Principal `{ Service: "cloudfront.amazonaws.com" }`, Action `kms:Decrypt`, Condition `StringEquals { "AWS:SourceArn": <distribution ARN> }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html#oac-permissions-sse-kms ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins.S3BucketOrigin.html
- **Last verified:** 2026-10-12

### CFN-004 — Redirect or require HTTPS for viewers
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Every cache behavior uses `redirect-to-https` or `https-only`.
- **Why:** `allow-all` serves pages and cookies over plain HTTP, enabling content injection and session theft on hostile networks; browsers also refuse Brotli over HTTP.
- **Detect:** Terraform `viewer_protocol_policy = "allow-all"`; CDK `viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL`.
- **Fix:** `viewer_protocol_policy = "redirect-to-https"` (CDK `ViewerProtocolPolicy.REDIRECT_TO_HTTPS`), optionally with HSTS from a response headers policy (CFN-017).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html#DownloadDistValuesViewerProtocolPolicy
- **Last verified:** 2026-10-12

### CFN-005 — Set a modern minimum TLS security policy
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Distributions with a custom certificate use `sni-only` and `TLSv1.2_2021` or newer (`TLSv1.2_2025`, `TLSv1.3_2025`).
- **Why:** Terraform defaults `minimum_protocol_version` to `TLSv1`, which still negotiates TLS 1.0/1.1 and weak CBC ciphers; CDK uses `TLS_V1_2_2019` unless the `@aws-cdk/aws-cloudfront:defaultSecurityPolicyTLSv1.2_2021` feature flag is set. The default `*.cloudfront.net` certificate is always pinned to `TLSv1`, so production sites need a custom domain + ACM cert to raise the floor. `vip` (dedicated IP) costs extra and only allows `TLSv1`/`SSLv3`.
- **Detect:** Terraform `viewer_certificate` without `minimum_protocol_version` or with `TLSv1`, `TLSv1_2016`, `TLSv1.1_2016`, `TLSv1.2_2018`, `TLSv1.2_2019`; `ssl_support_method = "vip"`; `cloudfront_default_certificate = true` on a production distribution. CDK `minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_*_2016|TLS_V1_2_2019` or unset without the feature flag in `cdk.json`.
- **Fix:** Terraform `viewer_certificate { acm_certificate_arn = ..., ssl_support_method = "sni-only", minimum_protocol_version = "TLSv1.2_2021" }`; CDK `minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html#DownloadDistValues-security-policy ; https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/secure-connections-supported-viewer-protocols-ciphers.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront.Distribution.html
- **Last verified:** 2026-10-12

### CFN-006 — Replace legacy `forwarded_values` with cache and origin request policies
- **Severity:** low
- **Category:** readability
- **Applies to:** Terraform
- **Rule:** Cache behaviors set `cache_policy_id` (and `origin_request_policy_id` when the origin needs extra values) instead of `forwarded_values`, `min_ttl`/`default_ttl`/`max_ttl` on the behavior.
- **Why:** `forwarded_values` is deprecated in the provider, mixes "what is cached on" with "what the origin receives" (so forwarding a header to the origin also fragments the cache), and cannot enable Brotli.
- **Detect:** `forwarded_values {` inside `default_cache_behavior`/`ordered_cache_behavior`.
- **Fix:** Managed policies by ID, e.g. CachingOptimized `658327ea-f89d-4fab-a63d-7e88639e58f6`, CachingDisabled `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`, origin request `AllViewerExceptHostHeader` `b689b0a8-53d0-40ab-baf2-68738e2966ac`, or `aws_cloudfront_cache_policy`/`aws_cloudfront_origin_request_policy` resources.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution ; https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
- **Last verified:** 2026-10-12

### CFN-007 — Keep the cache key minimal
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Include in the cache policy only the headers, cookies and query strings that change the response; send anything else the origin needs through the origin request policy.
- **Why:** Every value in the cache key splits the cache. Keying static assets on all cookies or `User-Agent` makes nearly every request a miss: the origin takes the full load, and you pay origin requests/egress plus slower pages. 10 M asset requests/day at 95% hit → 0.5 M origin GETs; at ~0% hit → 10 M origin GETs (S3 GET alone: 300 M/month × $0.0004/1,000 = $120/month, before compute behind dynamic origins).
- **Detect:** `aws_cloudfront_cache_policy` with `cookie_behavior = "all"`, `header_behavior = "whitelist"` listing `User-Agent`, `Authorization`, `Cookie`, `Accept-Language` on static behaviors, `query_string_behavior = "all"` for assets that ignore query strings; CDK `new cloudfront.CachePolicy(..., { cookieBehavior: CacheCookieBehavior.all(), headerBehavior: CacheHeaderBehavior.allowList("User-Agent", ...), queryStringBehavior: CacheQueryStringBehavior.all() })`; legacy `forwarded_values { cookies { forward = "all" } headers = ["*"] }`.
- **Fix:** Static: `CachingOptimized`. Dynamic but cacheable: custom policy keyed on the one or two values that matter; pass the rest via an origin request policy. Normalize values in a CloudFront Function if needed.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html ; https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### CFN-008 — Don't forward the viewer `Host` header to API Gateway or Lambda function URL origins
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** For API Gateway, Lambda function URL (and other origins that route on their own hostname) use `AllViewerExceptHostHeader`, not `AllViewer`.
- **Why:** Those origins expect `Host` to be their own domain; forwarding the distribution's `Host` makes every request fail (403/404/`ForbiddenException`).
- **Detect:** Origin request policy `216adef6-5c7f-47e4-b989-5492eafa07d3` (AllViewer) or `cloudfront.OriginRequestPolicy.ALL_VIEWER` on behaviors whose origin is `*.execute-api.*.amazonaws.com`, `*.lambda-url.*.on.aws`, `origins.HttpOrigin(api.url)`, `origins.FunctionUrlOrigin`, `origins.RestApiOrigin`; custom policies whitelisting `Host`.
- **Fix:** `origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"`; CDK `originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policy-all-viewer-except-host-header
- **Last verified:** 2026-10-12

### CFN-009 — Don't disable caching on static assets
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** `CachingDisabled` (or TTL 0 policies) only on truly dynamic behaviors; assets (`/assets/*`, `/_next/static/*`, `*.js`, `*.css`, images) use a caching policy.
- **Why:** With caching disabled every asset request goes to the origin: S3 GETs, origin latency and (for compute origins) invocations on every page view. It also makes Origin Shield charge every request (CFN-014).
- **Detect:** `cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"` or CDK `cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED` on the default behavior of an S3 origin or on asset path patterns; custom policies with `max_ttl = 0`.
- **Fix:** `CachePolicy.CACHING_OPTIMIZED` for assets; keep `CACHING_DISABLED` on `/api/*`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
- **Last verified:** 2026-10-12

### CFN-010 — Turn on compression (gzip and Brotli)
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Behaviors serving text (HTML, JS, CSS, JSON, SVG) set `compress = true` and use a cache policy with `enable_accept_encoding_gzip` and `enable_accept_encoding_brotli`.
- **Why:** Terraform's `compress` defaults to `false`. Uncompressed JS/CSS/JSON is often 3–4× larger, so you pay that much more data transfer out ($0.085/GB after the free tier in the United States, Mexico and Canada) and users wait longer. Objects 1,000–10,000,000 bytes with a listed `Content-Type` are compressed.
- **Detect:** Terraform `default_cache_behavior`/`ordered_cache_behavior` without `compress = true`; custom `aws_cloudfront_cache_policy` without `enable_accept_encoding_brotli = true`/`enable_accept_encoding_gzip = true`; CDK `compress: false`, `new cloudfront.CachePolicy(..., { enableAcceptEncodingGzip: false })`.
- **Fix:** `compress = true` + CachingOptimized (already enables both encodings).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution
- **Last verified:** 2026-10-12

### CFN-011 — Don't use a min-TTL > 0 policy on personalized or authenticated responses
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Behaviors that return per-user content (APIs with `Authorization`/session cookies, `/account/*`) use `CachingDisabled` or a policy with `min_ttl = 0` that includes the identifying value in the key.
- **Why:** CachingOptimized (min TTL 1 s, default 24 h when the origin sends no `Cache-Control`) caches responses even when the origin says `no-store`/`private` for at least the min TTL, and it doesn't key on cookies/`Authorization`. User A's `/api/me` response is served to user B.
- **Detect:** `CachingOptimized` (`658327ea-...`, `CachePolicy.CACHING_OPTIMIZED`) or a custom policy with `min_ttl > 0` on behaviors with path patterns like `/api/*`, `/graphql`, `/account*`, or on the default behavior when the origin is an API/SSR app (`HttpOrigin`, `FunctionUrlOrigin`, Lambda/ALB origins).
- **Fix:** `cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED` + `originRequestPolicy: ALL_VIEWER_EXCEPT_HOST_HEADER` for API behaviors; cache only explicitly public, identical-for-everyone responses.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-caching-optimized
- **Last verified:** 2026-10-12

### CFN-012 — Set Cache-Control on uploaded assets: immutable for hashed files, revalidate for HTML
- **Severity:** medium
- **Category:** reliability
- **Applies to:** CDK, Terraform, TypeScript, Go
- **Rule:** Fingerprinted assets get `Cache-Control: public, max-age=31536000, immutable`; HTML/entry files get `no-cache` (or a short max-age); don't rely on the policy default TTL.
- **Why:** Without `Cache-Control`, CachingOptimized keeps objects 24 h at the edge (and browsers apply heuristics). After a deploy, cached old `index.html` points at deleted hashed bundles (404s / blank page) until it expires, which pushes teams into invalidating `/*` on every deploy (CFN-015).
- **Detect:** CDK `new s3deploy.BucketDeployment(` without `cacheControl`; uploads via `PutObjectCommand`/`Upload` of site files with no `CacheControl`; Terraform `aws_s3_object` for site files without `cache_control`; CI `aws s3 sync` without `--cache-control`. SST `StaticSite` sets sensible defaults; flag overrides that drop them.
- **Fix:** Two deployments/uploads: assets with `cacheControl: [CacheControl.fromString("public,max-age=31536000,immutable")]`, HTML with `CacheControl.fromString("no-cache")`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html ; https://sst.dev/docs/component/aws/static-site/
- **Last verified:** 2026-10-12

### CFN-013 — Choose the price class from where viewers actually are
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Set `price_class` deliberately: `PriceClass_100` (North America + Europe) or `PriceClass_200` when the audience is regional; keep `PriceClass_All` when users are global.
- **Why:** By default CloudFront serves from edge locations in all regions (CDK default `PriceClass.PRICE_CLASS_ALL`), including the most expensive ones. Viewers outside the chosen class still get served, from a farther (cheaper) edge, with more latency: a trade-off, not an outage.
- **Detect:** Terraform `aws_cloudfront_distribution` with `price_class = "PriceClass_All"` or unset; CDK `Distribution` without `priceClass`. Report only when the code shows a regional audience (localized domain, single-country app, geo restriction to a few countries); otherwise it's a trade-off to mention, not a finding.
- **Fix:** `price_class = "PriceClass_100"` / CDK `priceClass: cloudfront.PriceClass.PRICE_CLASS_100`. If on a flat-rate plan, price class doesn't change the bill; skip.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudfront/pricing/ ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront.Distribution.html
- **Last verified:** 2026-10-12

### CFN-014 — Enable Origin Shield only where it pays, in the origin's Region
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Turn on Origin Shield for cacheable content with geographically spread viewers or expensive origins (image processing, live packaging, on-prem); leave it off for dynamic/uncacheable behaviors; pick the Region closest to the origin.
- **Why:** Origin Shield charges per request that passes through it (US: $0.0075 per 10,000). Dynamic requests (PUT/POST/PATCH/DELETE, and GET/HEAD with TTL < 3,600 s or caching disabled) are always charged. An API doing 100 M requests/month through Origin Shield pays ~$75/month for no cache benefit; a shield in the wrong Region adds latency.
- **Detect:** Terraform `origin_shield { enabled = true }` on origins serving APIs or behaviors with `CachingDisabled`; `origin_shield_region` different from the origin's Region; CDK `originShieldRegion`/`originShieldEnabled: true` on `HttpOrigin`/`FunctionUrlOrigin` for APIs.
- **Fix:** Remove Origin Shield from dynamic origins; for cacheable origins set `origin_shield_region` to the origin's Region.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html ; https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/
- **Last verified:** 2026-10-12

### CFN-015 — Invalidate with one wildcard per deploy, not per file
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go, CDK, SST
- **Rule:** Prefer versioned/hashed file names; when an invalidation is needed, send one wildcard path (`/*` or `/index.html` + `/assets/*`), not a path per changed file. Don't invalidate on every request or every upload event.
- **Why:** Each path is billed after 1,000 free paths/month per account (all distributions combined); a wildcard counts as one path. A pipeline that invalidates 400 changed files per deploy, 10 deploys/day: 400 × 10 × 30 = 120,000 paths → (120,000 − 1,000) × $0.005 ≈ $595/month. One `/*` per deploy = 300 paths, free. Invalidations triggered from an S3 event Lambda per upload can reach thousands of paths a day.
- **Detect:** TS `new CreateInvalidationCommand({ InvalidationBatch: { Paths: { Items: files.map(...) } } })`; Go `cloudfront.CreateInvalidationInput` with `Items` built in a loop; invalidation calls inside S3-triggered handlers; CDK `BucketDeployment` with `distributionPaths` listing many files; SST `StaticSite` `invalidation: { paths: [ ...many ] }` (default `"all"` is one path).
- **Fix:** `Paths: { Quantity: 1, Items: ["/*"] }` once per deploy, or `distributionPaths: ["/*"]`; better, hashed asset names + `no-cache` HTML (CFN-012) so only `/index.html` needs invalidation.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PayingForInvalidation.html ; https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/
- **Last verified:** 2026-10-12

### CFN-016 — Use CloudFront Functions for light viewer logic instead of Lambda@Edge
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Header manipulation, redirects/rewrites (SPA index rewrite, `www` redirect), cache-key normalization and JWT signature checks on viewer events run as CloudFront Functions; reserve Lambda@Edge for network calls, request bodies, origin events, large dependencies or long CPU.
- **Why:** Lambda@Edge costs $0.60 per 1 M requests plus duration (vs $0.10 per 1 M for CloudFront Functions), can add cold-start latency to viewer requests, scales to 10,000 requests per second per Region (vs millions), and needs us-east-1 deployment and versioned functions. 500 M viewer requests/month: Lambda@Edge ≥ $300 + duration vs $50.
- **Detect:** Terraform `lambda_function_association { event_type = "viewer-request" | "viewer-response" }` whose handler only reads/sets headers, rewrites `request.uri`, or returns a 301; CDK `edgeLambdas: [{ eventType: LambdaEdgeEventType.VIEWER_REQUEST, functionVersion }]`, `cloudfront.experimental.EdgeFunction`; handler code with no `fetch`/AWS SDK/`body` access.
- **Fix:** CDK:
  ```ts
  const fn = new cloudfront.Function(this, "Rewrite", {
    runtime: cloudfront.FunctionRuntime.JS_2_0,
    code: cloudfront.FunctionCode.fromInline(`function handler(e){var r=e.request;if(r.uri.endsWith('/'))r.uri+='index.html';return r;}`),
  });
  // defaultBehavior: { functionAssociations: [{ function: fn, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }] }
  ```
  Terraform `aws_cloudfront_function` + `function_association`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-functions-choosing.html ; https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html ; https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/
- **Last verified:** 2026-10-12

### CFN-017 — Add security headers with a response headers policy, not code
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK
- **Rule:** HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and CORS response headers come from a response headers policy (managed `SecurityHeadersPolicy` `67f7725c-6f97-4210-82d7-5512b31e9d03` or a custom one).
- **Why:** Edge functions that only append headers cost per request, can be skipped on error responses or forgotten on new behaviors; a policy is declarative, free, and applies to every response of the behavior.
- **Detect:** CloudFront Function or Lambda@Edge `viewer-response` handlers whose body only sets `strict-transport-security`, `x-frame-options`, `content-security-policy`, `access-control-allow-origin`; distributions with none of these headers and no `response_headers_policy_id`.
- **Fix:** Terraform `response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"`; CDK `responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS`. Use a custom `aws_cloudfront_response_headers_policy` for CSP.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html
- **Last verified:** 2026-10-12

### CFN-018 — Sign URLs/cookies with trusted key groups, not root-account key pairs
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Private content uses `trusted_key_groups` with public keys you upload; never `trusted_signers` (account CloudFront key pairs).
- **Why:** Account key pairs can only be managed by the root user, max two per account, and can't be rotated via API or scoped with IAM; key groups support automated rotation and up to 4 groups × 5 keys per distribution.
- **Detect:** Terraform `trusted_signers = ["self"]` or account IDs; CDK `trustedKeyGroups` absent while code signs URLs; TS `@aws-sdk/cloudfront-signer` `getSignedUrl({ keyPairId })` (or Go `sign.NewURLSigner(keyID, ...)`) whose ID comes from a root-account CloudFront key pair rather than from an `aws_cloudfront_public_key`/`cloudfront.PublicKey` in the same codebase.
- **Fix:** `aws_cloudfront_public_key` + `aws_cloudfront_key_group`; `trusted_key_groups = [aws_cloudfront_key_group.signers.id]`; CDK `trustedKeyGroups: [new cloudfront.KeyGroup(this, "Signers", { items: [publicKey] })]`. Keep the private key in Secrets Manager.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html
- **Last verified:** 2026-10-12

### CFN-019 — Don't let an earlier public behavior shadow a protected path
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Behaviors that require signed URLs/cookies (or route to an authenticated origin) are ordered before any broader public pattern that also matches their paths.
- **Why:** CloudFront applies the first matching behavior. If `/media/*` (public) precedes `/media/private/*` (signed), private files are served without a signature.
- **Detect:** Terraform `ordered_cache_behavior` blocks where a pattern with `trusted_key_groups` appears after a broader pattern without it (`/media/*` before `/media/private/*`, `*.pdf` before `/private/*`); CDK `additionalBehaviors` object key order with the same overlap.
- **Fix:** Put the most specific protected pattern first; give the protected content its own prefix that no public pattern matches.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html#private-content-adding-trusted-signers
- **Last verified:** 2026-10-12

### CFN-020 — Allow only GET/HEAD(/OPTIONS) on S3 origins unless uploads go through CloudFront
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Behaviors with S3 origins use `allowed_methods = ["GET", "HEAD"]` (or `+ OPTIONS` for CORS); enable `PUT`/`DELETE` only on a dedicated, authenticated upload path, and keep the bucket policy to `s3:GetObject` otherwise.
- **Why:** With OAC, CloudFront signs every forwarded method. If the behavior allows all methods and the bucket policy grants the distribution `s3:PutObject`/`s3:DeleteObject`, any anonymous viewer can overwrite or delete site files through the CDN.
- **Detect:** Terraform `allowed_methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]` on an S3/OAC origin; CDK `allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL` with `S3BucketOrigin`; bucket policy for `cloudfront.amazonaws.com` including `s3:PutObject` or `s3:*`; CDK `originAccessLevels: [AccessLevel.WRITE | DELETE]`.
- **Fix:** `allowed_methods = ["GET", "HEAD"]`, `cached_methods = ["GET", "HEAD"]`; CDK `AllowedMethods.ALLOW_GET_HEAD`; bucket policy `s3:GetObject` only.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
- **Last verified:** 2026-10-12

### CFN-021 — Don't map 403/404 to `/index.html` on a distribution that also serves an API
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** SPA fallbacks via `custom_error_response` apply to the whole distribution; when the distribution also routes `/api/*`, do the SPA rewrite in a CloudFront Function on the static behavior instead.
- **Why:** Custom error responses are distribution-level: an API `403 Forbidden` or `404 Not Found` becomes `200 OK` with `index.html`, so clients parse HTML as JSON, auth failures look like success, and errors are cached for the error-caching TTL.
- **Detect:** Terraform `custom_error_response { error_code = 403|404, response_code = 200, response_page_path = "/index.html" }` together with an `ordered_cache_behavior` for `/api/*`; CDK `errorResponses: [{ httpStatus: 403|404, responseHttpStatus: 200, responsePagePath: "/index.html" }]` plus `additionalBehaviors["/api/*"]`.
- **Fix:** Remove the error mapping; add a viewer-request CloudFront Function on the default (S3) behavior that rewrites extension-less paths to `/index.html` (CFN-016).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GeneratingCustomErrorResponses.html ; https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cloudfront-distribution-distributionconfig.html
- **Last verified:** 2026-10-12

### CFN-022 — Point S3 origins at the regional REST endpoint
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** S3 origins use `bucket_regional_domain_name` (`<bucket>.s3.<region>.amazonaws.com`), not the global `bucket_domain_name` or the website endpoint.
- **Why:** CloudFront documents `<bucket>.s3.<region>.amazonaws.com` as the S3 origin format that supports OAC, HTTPS to the origin and `PUT`/`POST`; path-style and CNAME forms are explicitly unsupported. The legacy global endpoint `<bucket>.s3.amazonaws.com` routes to us-east-1 first: for a bucket elsewhere S3 answers `307 Temporary Redirect` until DNS catches up (Regions launched before March 20, 2019) or `400 Bad Request` (newer Regions), and the Terraform provider recommends the regional name to avoid these redirects. Website endpoints can't use OAC at all (S3-005).
- **Detect:** Terraform `origin { domain_name = aws_s3_bucket.x.bucket_domain_name }` or `website_endpoint`; CDK `HttpOrigin(bucket.bucketDomainName)`.
- **Fix:** `domain_name = aws_s3_bucket.x.bucket_regional_domain_name`; CDK `S3BucketOrigin.withOriginAccessControl(bucket)` (uses the regional name).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html#concept_S3Origin ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html#deprecated-global-endpoint ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket
- **Last verified:** 2026-10-12

### CFN-023 — Don't configure Lambda@Edge with environment variables, VPC, layers, X-Ray or arm64
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript
- **Rule:** Lambda@Edge functions are numbered versions (not `$LATEST` or aliases) in us-east-1 with no environment variables, no VPC config, no layers, no DLQ, no X-Ray tracing, no provisioned concurrency, no container image, ≤ 512 MB ephemeral storage, x86_64 only; pass configuration via code constants, CloudFront KeyValueStore (with CloudFront Functions) or custom origin headers.
- **Why:** Those Lambda features are unsupported for Lambda@Edge, so associating such a function with a distribution fails the deploy, or the code reads `process.env.X` as `undefined` at the edge and rejects every request.
- **Detect:** Terraform `aws_lambda_function` referenced by `lambda_function_association` (via `qualified_arn`) that has an `environment {}`, `vpc_config`, `layers`, `tracing_config { mode = "Active" }`, `package_type = "Image"`, `architectures = ["arm64"]`, or is not `publish = true`; CDK `cloudfront.experimental.EdgeFunction`/`lambda.Function` used in `edgeLambdas` with `environment:`, `vpc:`, `layers:`, `tracing: lambda.Tracing.ACTIVE`, `architecture: Architecture.ARM_64`; handler code under an edge function reading `process.env`.
- **Fix:** Inline config at build time (bundler `define`) or move the logic to a CloudFront Function with a KeyValueStore; keep the function x86_64 in us-east-1 and reference `aws_lambda_function.x.qualified_arn`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html
- **Last verified:** 2026-10-12

### CFN-024 — Lambda function URL behind OAC: clients must send `x-amz-content-sha256` on PUT/POST
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, TypeScript
- **Rule:** When a Lambda function URL origin uses OAC (`AuthType` `AWS_IAM`), either every `PUT`/`POST` client sends the SHA-256 of the body in `x-amz-content-sha256`, or the write endpoints go to an origin that doesn't need a signed payload (API Gateway, or a function URL without OAC that checks a secret origin header).
- **Why:** CloudFront signs the origin request with SigV4, and Lambda doesn't support unsigned payloads. Browsers and ordinary `fetch` calls don't send `x-amz-content-sha256`, so `GET` works in testing while every form submit, JSON `POST` or upload through the distribution fails with a signature error.
- **Detect:** CDK `origins.FunctionUrlOrigin.withOriginAccessControl(url)` (or Terraform `aws_cloudfront_origin_access_control` with `origin_access_control_origin_type = "lambda"` on a `*.lambda-url.*.on.aws` origin) on a behavior with `allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL` / `allowed_methods` containing `POST`/`PUT`, and front-end or client code that posts to that path without computing `x-amz-content-sha256`.
- **Fix:** Have clients add the header:
  ```ts
  const body = JSON.stringify(payload);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  await fetch("/api/items", { method: "POST", body, headers: { "content-type": "application/json", "x-amz-content-sha256": hash } });
  ```
  or route write-heavy APIs through API Gateway (with `ALL_VIEWER_EXCEPT_HOST_HEADER`, CFN-008).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
- **Last verified:** 2026-10-12

### CFN-025 — Use HTTPS with TLS 1.2 between CloudFront and custom origins
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Custom origins that support HTTPS (ALB, API Gateway, function URLs, your own servers) use origin protocol policy `https-only` and allow only `TLSv1.2` in the origin SSL protocols.
- **Why:** With `http-only` (or `match-viewer` and an HTTP viewer request), CloudFront forwards cookies, `Authorization` headers and request bodies to the origin in clear text even though viewers see HTTPS. Allowing `SSLv3`/`TLSv1`/`TLSv1.1` lets the origin leg negotiate obsolete protocols; AWS recommends the latest protocol your origin supports. S3 website endpoints are the exception: they only speak HTTP (S3-005).
- **Detect:** Terraform `custom_origin_config { origin_protocol_policy = "http-only" | "match-viewer" }` for origins other than `*.s3-website*`; `origin_ssl_protocols` containing `"SSLv3"`, `"TLSv1"` or `"TLSv1.1"`. CDK `new origins.HttpOrigin(domain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY | MATCH_VIEWER })` or `originSslProtocols` including `OriginSslPolicy.SSL_V3 | TLS_V1 | TLS_V1_1`; `origins.LoadBalancerV2Origin` with `protocolPolicy: HTTP_ONLY`.
- **Fix:** Terraform `origin_protocol_policy = "https-only"`, `origin_ssl_protocols = ["TLSv1.2"]`; CDK `protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY, originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2]`. The origin's certificate must match the origin domain name or CloudFront returns 502.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html#DownloadDistValuesOriginProtocolPolicy ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution
- **Last verified:** 2026-10-12
