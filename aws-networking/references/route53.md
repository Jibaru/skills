# Route 53: records, routing policies, health checks, TTLs

Rules R53-001 – R53-011. Prices: standard queries $0.40 per million (first 1 B/month); alias
queries to AWS resources free; health checks on AWS endpoints $0.50/month (first 50 free), non-AWS
$0.75/month; optional features (e.g. HTTPS, fast interval) $1.00 (AWS) / $2.00
(non-AWS) per feature per month.

### R53-001 — Use alias records, not CNAMEs, for AWS targets
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Records pointing at an ALB/NLB, CloudFront distribution, API Gateway custom domain, S3 website endpoint, VPC interface endpoint, Global Accelerator or another record in the zone are `A`/`AAAA` alias records.
- **Why:** Route 53 charges for CNAME queries (and a CNAME to another Route 53 record is billed as two queries) but not for alias queries to AWS resources; aliases work at the zone apex, follow the target's IP changes, and can evaluate target health for failover. At 500 M queries/month a CNAME costs $200/month that an alias costs $0.
- **Detect:** Terraform `aws_route53_record` with `type = "CNAME"` and `records` containing `*.elb.amazonaws.com`, `*.cloudfront.net`, `*.execute-api.*.amazonaws.com`, `d-*.execute-api.*`, `*.s3-website*`, `*.vpce.amazonaws.com`, `*.awsglobalaccelerator.com`, or `aws_lb.*.dns_name` / `aws_cloudfront_distribution.*.domain_name` references; CDK `new route53.CnameRecord(… { domainName: alb.loadBalancerDnsName })`.
- **Fix:**
  ```hcl
  resource "aws_route53_record" "api" {
    zone_id = aws_route53_zone.main.zone_id  name = "api.example.com"  type = "A"
    alias { name = aws_lb.app.dns_name  zone_id = aws_lb.app.zone_id  evaluate_target_health = true }
  }
  ```
  CDK: `new route53.ARecord(this, "Api", { zone, recordName: "api", target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)) })`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html ; https://aws.amazon.com/route53/pricing/
- **Last verified:** 2026-10-12

### R53-002 — Never put a CNAME at the zone apex
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** The apex (`example.com`) uses an alias `A`/`AAAA` record; CNAMEs are only for subdomains.
- **Why:** DNS forbids a CNAME next to the apex SOA/NS records; Route 53 rejects the change and the deploy fails (or, with an external DNS provider, the apex silently breaks MX/TXT records).
- **Detect:** Terraform `aws_route53_record` with `type = "CNAME"` and `name` equal to the zone name (`aws_route53_zone.main.name`, `""`, `var.domain`); CDK `CnameRecord` without `recordName` or with the zone name.
- **Fix:** Alias record as in R53-001.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html
- **Last verified:** 2026-10-12

### R53-003 — Publish an AAAA alias next to the A alias for dual-stack targets
- **Severity:** low
- **Category:** performance
- **Applies to:** Terraform, CDK
- **Rule:** When the target supports IPv6 (CloudFront with IPv6 enabled, dual-stack ALB, `dualstack-without-public-ipv4`), create both `A` and `AAAA` alias records.
- **Why:** An alias answers only the record type it was created with; without `AAAA`, IPv6 clients fall back to IPv4, and an ALB set to `dualstack-without-public-ipv4` becomes unreachable by name.
- **Detect:** Terraform `aws_route53_record` alias `type = "A"` to a CloudFront distribution with `is_ipv6_enabled = true` or an `aws_lb` with `ip_address_type = "dualstack*"`, and no sibling `type = "AAAA"`; CDK `ARecord` without `AaaaRecord` for the same target.
- **Fix:** Duplicate the alias with `type = "AAAA"` (CDK `new route53.AaaaRecord(…)`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html ; https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html
- **Last verified:** 2026-10-12

### R53-004 — Attach a health check to every non-alias record in failover, weighted or latency sets
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** In a routing-policy set, each non-alias record has `health_check_id`; alias records in the set have `evaluate_target_health = true` (R53-005).
- **Why:** Route 53 treats a record without a health check as always healthy. A failover PRIMARY without a health check never fails over: when the primary dies, DNS keeps answering with it and the SECONDARY never serves traffic — the DR setup exists only on paper.
- **Detect:** Terraform `aws_route53_record` with `failover_routing_policy { type = "PRIMARY" }` (or `weighted_routing_policy`/`latency_routing_policy`) and `records = […]` but no `health_check_id`; CDK records with `failover`/`weight`/`region` and no `healthCheck`.
- **Fix:**
  ```hcl
  resource "aws_route53_health_check" "primary" {
    fqdn = "primary.example.com"  type = "HTTPS"  resource_path = "/healthz"
    port = 443  request_interval = 30  failure_threshold = 3
  }
  resource "aws_route53_record" "primary" {
    # …
    failover_routing_policy { type = "PRIMARY" }
    set_identifier  = "primary"
    health_check_id = aws_route53_health_check.primary.id
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-complex-configs.html ; https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-how-to.html
- **Last verified:** 2026-10-12

### R53-005 — Set evaluate target health on alias records in routing trees
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Alias records that take part in failover, weighted, latency or geolocation routing set `evaluate_target_health = true`.
- **Why:** With `false`, Route 53 keeps routing to the alias target (an ALB with zero healthy targets, a Region that is down) instead of backing out to a healthy branch.
- **Detect:** Terraform `alias { evaluate_target_health = false }` on records with `*_routing_policy` and `set_identifier`; CDK `ARecord` with `RecordTarget.fromAlias` inside such sets where the alias target's `bind` does not evaluate health (custom `IAliasRecordTarget` without `evaluateTargetHealth`).
- **Fix:** `evaluate_target_health = true` (ELB targets then fail when no target group has healthy targets).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-complex-configs.html
- **Last verified:** 2026-10-12

### R53-006 — Don't point Route 53 health checks at private IPs
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** Health checks for private endpoints (private hosted zones, internal ALBs, private IPs) use a `CLOUDWATCH_METRIC` health check backed by an alarm, or a `CALCULATED` check over those.
- **Why:** Route 53 health checkers run outside your VPC and cannot reach private, local or non-routable addresses; an HTTP check on `10.x.x.x` is permanently unhealthy, so failover either always fires or the team disables it.
- **Detect:** Terraform `aws_route53_health_check` with `ip_address` in `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, or `fqdn` of an internal LB (`internal-*.elb.amazonaws.com`) or a private-zone name; CDK `route53.HealthCheck` with `ipAddress` private.
- **Fix:**
  ```hcl
  resource "aws_route53_health_check" "internal_api" {
    type = "CLOUDWATCH_METRIC"
    cloudwatch_alarm_name   = aws_cloudwatch_metric_alarm.unhealthy_hosts.alarm_name
    cloudwatch_alarm_region = var.region
    insufficient_data_health_status = "Unhealthy"
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-private-hosted-zones.html ; https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/welcome-health-checks.html
- **Last verified:** 2026-10-12

### R53-007 — Set TTLs by how fast the record must change
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Non-alias records for endpoints you may move or fail over use 60–300 s; stable records (NS, MX, TXT verification) keep long TTLs; lower a TTL ahead of a planned migration, not during it. Alias records take the target's TTL and accept no `ttl`.
- **Why:** A 86,400 s TTL on `api.example.com` means a cut-over or failover reaches some clients a day late. A 5 s TTL on a high-traffic static record multiplies resolver queries (and the bill) for no benefit. Terraform errors if an alias record sets `ttl`.
- **Detect:** Terraform `aws_route53_record` with `ttl` ≥ 3600 on A/AAAA/CNAME records for app endpoints or records in routing-policy sets; `ttl` < 30 on non-failover records; `ttl` alongside `alias {}`; CDK `ttl: Duration.days(1)` on such records.
- **Fix:** `ttl = 60` for failover sets, `300` for app endpoints; drop `ttl` from alias records.
- **Volatile:** no
- **Source:** https://aws.amazon.com/blogs/networking-and-content-delivery/dns-best-practices-for-amazon-route-53/ ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record
- **Last verified:** 2026-10-12

### R53-008 — Avoid dangling records that enable subdomain takeover
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Records pointing at AWS resources reference the resource in the same IaC (so they are deleted together) or use aliases; hard-coded CNAMEs to S3 website, CloudFront, Elastic Beanstalk or API Gateway hostnames are removed before the target is deleted, and delegations (NS) match an existing hosted zone.
- **Why:** When a bucket, distribution or environment is deleted but its CNAME stays, an attacker creates a resource with the same name and serves content (phishing, cookie theft) on your subdomain.
- **Detect:** Terraform `aws_route53_record` `type = "CNAME"` with literal `records = ["….s3-website-…amazonaws.com"]`, `["d…cloudfront.net"]`, `["….elasticbeanstalk.com"]` not tied to a resource in the repo; `type = "NS"` records with literal name servers for sub-zones not defined in the repo; diffs that delete the target resource but keep the record.
- **Fix:** Use aliases or reference `aws_cloudfront_distribution.x.domain_name` so the record is destroyed with the target; delete DNS first, wait out the TTL, then delete the resource.
- **Volatile:** no
- **Source:** https://aws.amazon.com/blogs/security/threat-tactic-spotlight-subdomain-takeover/ ; https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/protection-from-dangling-dns.html
- **Last verified:** 2026-10-12

### R53-009 — Don't buy health checks you don't need
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Use `evaluate_target_health` on aliases to ELB/API Gateway instead of separate health checks; use 30 s interval and only the regions/features you need.
- **Why:** Each health check is billed monthly, and fast interval (10 s), HTTPS, string matching and latency measurement are extra per check; dozens of per-environment checks against ALBs duplicate what alias target health provides for free.
- **Detect:** Terraform `aws_route53_health_check` whose `fqdn` is an ALB/NLB DNS name already used by an alias with `evaluate_target_health = true`; `request_interval = 10`, `measure_latency = true`, `search_string` on non-critical endpoints; health checks in non-prod stacks.
- **Fix:** Remove redundant checks; `request_interval = 30`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/route53/pricing/ ; https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/health-checks-creating-values.html
- **Last verified:** 2026-10-12

### R53-010 — Reference targets and zone IDs instead of hard-coding them
- **Severity:** medium
- **Category:** readability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Alias `name` and `zone_id` come from the target resource (`aws_lb.app.dns_name`, `aws_lb.app.zone_id`, `aws_cloudfront_distribution.cdn.hosted_zone_id`) or a data source; SST `domain:` args let the component manage records.
- **Why:** Hard-coded canonical hosted-zone IDs are Region- and service-specific; copying a record to another Region or swapping an NLB for an ALB produces "Tried to create an alias that targets …, but it doesn't exist" or silently points at the old resource.
- **Detect:** Terraform `alias { name = "my-alb-123.us-east-1.elb.amazonaws.com"  zone_id = "Z35SXDOTRQ7X7K" }` literals, `zone_id = "Z2FDTNDATAQYW2"` typed by hand; CDK `RecordTarget.fromValues("…elb.amazonaws.com")`.
- **Fix:** Use resource attributes or `targets.LoadBalancerTarget(alb)` / `targets.CloudFrontTarget(dist)`; in SST pass `domain: { name, dns: sst.aws.dns() }`.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record ; https://sst.dev/docs/component/aws/apigatewayv2/
- **Last verified:** 2026-10-12

### R53-011 — Associate private hosted zones with every VPC that resolves them
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** A private hosted zone is associated with each VPC (including other accounts' VPCs via authorization + association) whose workloads use its names, and those VPCs have `enable_dns_support` and `enable_dns_hostnames` on.
- **Why:** Without the association, lookups from the other VPC fall through to public DNS: `NXDOMAIN` or, worse, a public record with the same name.
- **Detect:** Terraform `aws_route53_zone` with a single `vpc {}` block while other `aws_vpc`s in the stack consume `*.internal` names; missing `aws_route53_zone_association` / `aws_route53_vpc_association_authorization` for cross-account use; `aws_vpc` without `enable_dns_hostnames = true`; CDK `PrivateHostedZone` with one `vpc` and no `addVpc`.
- **Fix:** Add `vpc {}` blocks or `aws_route53_zone_association` per VPC (cross-account: authorization in the zone account, association in the VPC account).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zone-private-considerations.html ; https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html
- **Last verified:** 2026-10-12
