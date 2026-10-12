# Encryption in transit and the detection baseline

TLS enforcement on AWS endpoints and in client code, then the account-level detective controls
(CloudTrail, GuardDuty, Security Hub CSPM, IAM Access Analyzer). IDs continue the EXP series from
[exposure.md](exposure.md). Report baseline gaps only when the reviewed files define account or
landing-zone infrastructure; an app repo without them is not a finding.

### EXP-014 — Deny non-TLS requests to S3 buckets
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every bucket policy denies requests where `aws:SecureTransport` is `false`.
- **Why:** Without the deny, clients can read and write over plain HTTP, exposing data and signed requests on the wire. CDK `enforceSSL` defaults to `false`; SST `enforceHttps` defaults to `true`. Security Hub S3.5.
- **Detect:** Terraform buckets with no `aws_s3_bucket_policy` statement on `aws:SecureTransport`; CDK `new s3.Bucket(` without `enforceSSL: true`; SST `enforceHttps: false`.
- **Fix:** CDK `enforceSSL: true` (optionally `minimumTLSVersion: 1.2`); Terraform:
  ```hcl
  statement {
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.b.arn, "${aws_s3_bucket.b.arn}/*"]
    principals { type = "*" identifiers = ["*"] }
    condition { test = "Bool" variable = "aws:SecureTransport" values = ["false"] }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/s3-controls.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.BucketProps.html ; https://sst.dev/docs/component/aws/bucket/
- **Last verified:** 2026-10-12

### EXP-015 — Require TLS on database connections server-side
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** RDS/Aurora parameter groups force TLS: `rds.force_ssl = 1` for PostgreSQL (default on only for RDS for PostgreSQL 15+), `require_secure_transport = ON` for MySQL/MariaDB; RDS Proxy `require_tls = true`.
- **Why:** Engines on older defaults accept plaintext logins, so a misconfigured client sends credentials and rows unencrypted across the VPC or peering link. Security Hub RDS.38 (PostgreSQL), RDS.39 (MySQL), RDS.44 (MariaDB) and RDS.43 (RDS Proxy).
- **Detect:** `aws_db_parameter_group` / `aws_rds_cluster_parameter_group` for PostgreSQL ≤ 14 without `rds.force_ssl = 1`, or with `0` on any version; MySQL/MariaDB groups without `require_secure_transport`; `aws_db_proxy` `require_tls = false`; CDK `rds.ParameterGroup` with `'rds.force_ssl': '0'`, `DatabaseProxy` `requireTLS: false`.
- **Fix:** Set the parameter in a custom parameter group (reboot needed when attaching a new group) and use `sslmode=verify-full` with the RDS CA bundle in clients (EXP-016).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-ssl-connections.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/rds-controls.html
- **Last verified:** 2026-10-12

### EXP-016 — Never disable certificate verification in clients
- **Severity:** critical
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** TLS clients verify the server certificate and hostname; use the RDS/ElastiCache CA bundle or the system trust store instead of turning verification off.
- **Why:** With verification off, anyone on the path (compromised host in the VPC, DNS hijack, rogue proxy) can impersonate the database or API and capture credentials and data while the connection still "uses TLS".
- **Detect:** TS `rejectUnauthorized: false`, `ssl: { rejectUnauthorized: false }` in `pg`/`mysql2`/`ioredis` config, `NODE_TLS_REJECT_UNAUTHORIZED = '0'` / `process.env.NODE_TLS_REJECT_UNAUTHORIZED`, `new https.Agent({ rejectUnauthorized: false })`; connection strings with `sslmode=require` or `sslmode=disable` (no verification) instead of `verify-full`; Go `InsecureSkipVerify: true` in `tls.Config`, `sslmode=disable`/`require` in `pgx`/`lib/pq` DSNs.
- **Fix:** TS `ssl: { ca: fs.readFileSync('/opt/rds-global-bundle.pem', 'utf8') }`; Go:
  ```go
  pool := x509.NewCertPool()
  pool.AppendCertsFromPEM(rdsBundle)
  tlsCfg := &tls.Config{RootCAs: pool, ServerName: host, MinVersion: tls.VersionTLS12}
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html
- **Last verified:** 2026-10-12

### EXP-017 — Enable in-transit encryption on caches and brokers
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** ElastiCache replication groups, MSK clusters and OpenSearch domains encrypt client and node-to-node traffic; ElastiCache AUTH tokens are only meaningful with TLS on.
- **Why:** Without TLS, AUTH tokens and cached session data cross the network in clear text. Security Hub ElastiCache.5, MSK.1, Opensearch.3.
- **Detect:** `aws_elasticache_replication_group` without `transit_encryption_enabled = true`; `aws_msk_cluster` `encryption_in_transit { client_broker = "PLAINTEXT" | "TLS_PLAINTEXT" }`; `aws_opensearch_domain` `node_to_node_encryption { enabled = false }` or `domain_endpoint_options { enforce_https = false }`; CDK `transitEncryptionEnabled: false`, `nodeToNodeEncryption: false`, `enforceHttps: false`.
- **Fix:** Turn the flags on (for existing ElastiCache groups use the documented `preferred` → `required` transition). Hand off capacity and engine details to aws-data / aws-messaging.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html
- **Last verified:** 2026-10-12

### EXP-018 — Redirect or refuse plain HTTP at the edge
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** CloudFront viewer protocol policy is `redirect-to-https` or `https-only`, and ALB port-80 listeners only redirect to 443.
- **Why:** `allow-all` or an HTTP listener that forwards to targets serves session cookies and tokens in clear text. Security Hub CloudFront.3, ELB.1.
- **Detect:** `viewer_protocol_policy = "allow-all"`; `aws_lb_listener` with `protocol = "HTTP"` and `default_action { type = "forward" }`; CDK `viewerProtocolPolicy: ViewerProtocolPolicy.ALLOW_ALL`, `alb.addListener('Http', { port: 80 })` with `defaultTargetGroups`.
- **Fix:** `viewer_protocol_policy = "redirect-to-https"`; ALB `default_action { type = "redirect" redirect { port = "443" protocol = "HTTPS" status_code = "HTTP_301" } }`. Hand off TLS policies and certificates to aws-networking.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-viewers-to-cloudfront.html ; https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html
- **Last verified:** 2026-10-12

### EXP-019 — Keep one multi-Region CloudTrail trail with log file validation
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** The account (or organization) has a trail with `is_multi_region_trail = true`, `enable_log_file_validation = true`, KMS encryption and a bucket policy that pins `aws:SourceArn` to the trail.
- **Why:** Event history alone keeps 90 days of management events and nothing tamper-evident; incident response needs a durable, validated record of IAM and data-plane changes in every Region, including the ones an attacker uses because you don't. Terraform defaults `is_multi_region_trail` and `enable_log_file_validation` to `false`. Security Hub CloudTrail.1/.2/.4.
- **Detect:** `aws_cloudtrail` missing `is_multi_region_trail = true`, `enable_log_file_validation = true` or `kms_key_id`; trail bucket policy for `cloudtrail.amazonaws.com` without `aws:SourceArn`; CDK `new cloudtrail.Trail(` with `isMultiRegionTrail: false` or `enableFileValidation: false`.
- **Fix:**
  ```hcl
  resource "aws_cloudtrail" "main" {
    name                       = "org-main"
    s3_bucket_name             = aws_s3_bucket.trail.id
    is_multi_region_trail      = true
    enable_log_file_validation = true
    kms_key_id                 = aws_kms_key.trail.arn
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-trail-security-best-practices.html ; https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudtrail ; https://docs.aws.amazon.com/securityhub/latest/userguide/cloudtrail-controls.html
- **Last verified:** 2026-10-12

### EXP-020 — Do not pay for duplicate management-event trails
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Only the first copy of management events per Region is free; extra trails that also log management events (per-app trails next to the org trail) should be removed or switched to data events only for the resources that need them.
- **Why:** Each additional copy costs $2.00 per 100,000 management events: an account emitting 20 M management events/month pays 20,000,000 / 100,000 × $2 = $400/month for a second trail. Data events cost $0.10 per 100,000 and blanket S3/Lambda data events on busy accounts grow fast.
- **Detect:** More than one `aws_cloudtrail` / `cloudtrail.Trail` with management events on (default `include_management_events = true` in `event_selector`, or no selector) in the same account, or an app stack creating a trail while an organization trail exists; `data_resource` selectors with `values = ["arn:aws:s3"]` (all buckets).
- **Fix:** Keep the org trail for management events; in extra trails set `event_selector { include_management_events = false ... }` and scope data events to specific ARNs (or advanced event selectors).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudtrail/pricing/ ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudtrail
- **Last verified:** 2026-10-12

### EXP-021 — Enable GuardDuty in every Region you use, with the protection plans that match the workload
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Landing-zone code enables a GuardDuty detector per used Region (organization-wide via the delegated admin) and turns on the features that cover the stack: S3 data events for data buckets, Lambda network logs, RDS login events, runtime monitoring for ECS/EKS/EC2.
- **Why:** GuardDuty detects credential exfiltration (role credentials used from outside AWS), crypto-mining and anomalous S3 access; without it, the first signal is often the bill. Security Hub GuardDuty.1 and feature controls.
- **Detect:** Account/org Terraform with no `aws_guardduty_detector` (or `enable = false`), or detectors only in the home Region while resources exist elsewhere; no `aws_guardduty_detector_feature` for `S3_DATA_EVENTS`, `LAMBDA_NETWORK_LOGS`, `RDS_LOGIN_EVENTS`, `RUNTIME_MONITORING` where those services are used; CDK `guardduty.CfnDetector` with `enable: false`.
- **Fix:** `aws_guardduty_organization_admin_account` + `aws_guardduty_organization_configuration { auto_enable_organization_members = "ALL" }`, plus `aws_guardduty_detector_feature` per relevant feature. Check pricing per feature before enabling everything.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/guardduty-controls.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/guardduty_detector_feature ; https://aws.amazon.com/guardduty/pricing/
- **Last verified:** 2026-10-12

### EXP-022 — Enable Security Hub CSPM with the Foundational Security Best Practices standard
- **Severity:** low
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Landing-zone code enables Security Hub CSPM with the AWS Foundational Security Best Practices standard (and consolidated control findings) in each used Region, aggregated to one Region.
- **Why:** It continuously checks the same controls this reviewer cites (S3.8, EC2.19, RDS.2, Lambda.1…) on what is actually deployed, catching console drift and resources created outside IaC.
- **Detect:** Account/org Terraform without `aws_securityhub_account`, or with `enable_default_standards = false` and no `aws_securityhub_standards_subscription` for FSBP; no `aws_securityhub_finding_aggregator`.
- **Fix:** `resource "aws_securityhub_account" "this" { control_finding_generator = "SECURITY_CONTROL" }` (FSBP is enabled by default via `enable_default_standards = true`) and a finding aggregator.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/securityhub_account ; https://aws.amazon.com/security-hub/pricing/
- **Last verified:** 2026-10-12

### EXP-023 — Run an IAM Access Analyzer for external access
- **Severity:** low
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Each account (or the organization) has an Access Analyzer of type `ACCOUNT` or `ORGANIZATION` to flag resources shared outside the zone of trust.
- **Why:** It continuously reports buckets, keys, roles, queues, secrets and functions that grant access to external principals or the public, at no charge for external access analysis, which catches what slips past code review (IAM-009, EXP-001, EXP-013).
- **Detect:** Account/org Terraform without `aws_accessanalyzer_analyzer`; CDK without `accessanalyzer.CfnAnalyzer`.
- **Fix:** `resource "aws_accessanalyzer_analyzer" "org" { analyzer_name = "org" type = "ORGANIZATION" }` in the delegated admin account.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/accessanalyzer_analyzer ; https://aws.amazon.com/iam/access-analyzer/pricing/
- **Last verified:** 2026-10-12
