# Elastic Load Balancing: ALB and NLB

Rules ELB-001 – ELB-019. Prices us-east-1: ALB and NLB $0.0225/h each, ALB $0.008/LCU-h,
NLB $0.006/NLCU-h, plus $0.005/h per public IPv4 the LB uses. 730 h/month.

### ELB-001 — Set a modern TLS security policy on every HTTPS/TLS listener
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** HTTPS (ALB) and TLS (NLB) listeners name a TLS 1.2+ policy explicitly; AWS currently recommends `ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09` (or the `-FIPS-` variant). Never leave the policy unset or on `ELBSecurityPolicy-2016-08`.
- **Why:** Only the console defaults to the PQ TLS 1.3 policy. Listeners created through the CLI, CloudFormation or CDK (and Terraform, which calls the same API) without a policy get `ELBSecurityPolicy-2016-08`, which still negotiates TLS 1.0 and 1.1 and CBC ciphers — a compliance failure (PCI DSS, Security Hub) and a downgrade surface. Terraform's own examples use `2016-08`, so copy-paste spreads it.
- **Detect:** Terraform `aws_lb_listener` with `protocol = "HTTPS"`/`"TLS"` and `ssl_policy` absent or `"ELBSecurityPolicy-2016-08"`, `ELBSecurityPolicy-TLS-1-0-*`, `-TLS-1-1-*`, `-FS-2018-06`, `-TLS13-1-0-*`, `-TLS13-1-1-*`; CDK `addListener(…, { protocol: ApplicationProtocol.HTTPS / certificates: […] })` without `sslPolicy` in an app whose `cdk.json` lacks `"@aws-cdk/aws-elasticloadbalancingv2:usePostQuantumTlsPolicy": true`, or `sslPolicy: SslPolicy.RECOMMENDED` (that enum value is `ELBSecurityPolicy-2016-08`), `SslPolicy.LEGACY`, `SslPolicy.TLS11*`.
- **Fix:**
  ```hcl
  resource "aws_lb_listener" "https" {
    load_balancer_arn = aws_lb.app.arn
    port = 443  protocol = "HTTPS"
    ssl_policy      = "ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09"
    certificate_arn = aws_acm_certificate_validation.app.certificate_arn
    default_action { type = "forward"  target_group_arn = aws_lb_target_group.app.arn }
  }
  ```
  CDK: `sslPolicy: elbv2.SslPolicy.TLS13_12_RES_PQ` (the AWS-recommended `ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09`), or at least `RECOMMENDED_TLS` (`ELBSecurityPolicy-TLS13-1-2-2021-06`). Enabling the feature flag (CDK ≥ 2.245.0) makes listeners without `sslPolicy` use `TLS13_12_PQ` (`ELBSecurityPolicy-TLS13-1-2-PQ-2025-09`, TLS 1.2+ but still with CBC ciphers for TLS 1.2), which fixes the TLS 1.0/1.1 exposure.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/describe-ssl-policies.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_listener ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_elasticloadbalancingv2.SslPolicy.html ; https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/cx-api/FEATURE_FLAGS.md
- **Last verified:** 2026-10-12

### ELB-002 — Redirect port 80 to HTTPS instead of serving the app on it
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** On internet-facing ALBs, the HTTP:80 listener's default action is a 301 redirect to HTTPS:443; it does not `forward` to the app target group.
- **Why:** A forwarding port 80 serves logins, cookies and tokens in clear text to anyone on the path, and clients that typed `http://` never upgrade.
- **Detect:** Terraform `aws_lb_listener` with `port = 80`, `protocol = "HTTP"` and `default_action { type = "forward" … }` on an `internal = false` LB that also has a 443 listener (or has none); CDK `alb.addListener("Http", { port: 80 })` followed by `addTargets`/`addTargetGroups`.
- **Fix:**
  ```hcl
  default_action {
    type = "redirect"
    redirect { port = "443"  protocol = "HTTPS"  status_code = "HTTP_301" }
  }
  ```
  CDK: `alb.addRedirect()` (80 → 443).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_listener
- **Last verified:** 2026-10-12

### ELB-003 — Make the app's keep-alive timeout longer than the ALB idle timeout
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform, CDK
- **Rule:** The HTTP server behind an ALB keeps idle keep-alive connections open longer than the ALB `idle_timeout` (default 60 s), e.g. ALB 60 s → app 65–75 s.
- **Why:** The ALB reuses backend connections. If the app closes an idle connection first, the ALB can send a request on it just as it closes and returns **HTTP 502** to the client. Node's `server.keepAliveTimeout` defaults to a few seconds (5 s in current Node releases, per the Node.js docs — not an AWS source), so default Express/Fastify/Next servers behind an ALB produce sporadic 502s under light load. Go `http.Server.IdleTimeout` below 60 s does the same.
- **Detect:** TS `http.createServer`/`app.listen(` with no `server.keepAliveTimeout =` assignment, or `keepAliveTimeout` < ALB idle timeout (Fastify `keepAliveTimeout` option, `headersTimeout` ≤ `keepAliveTimeout`); Go `http.Server{IdleTimeout: …}` lower than the ALB value (or `IdleTimeout` unset with a short `ReadTimeout`, which it falls back to). Cross-check with Terraform `aws_lb.idle_timeout` (default 60) / CDK `idleTimeout`.
- **Fix:**
  ```ts
  const server = app.listen(8080);
  server.keepAliveTimeout = 65_000;   // > ALB idle_timeout (60 s)
  server.headersTimeout = 66_000;     // must exceed keepAliveTimeout
  ```
  ```go
  srv := &http.Server{Addr: ":8080", Handler: mux, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 75 * time.Second}
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html ; https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html
- **Last verified:** 2026-10-12

### ELB-004 — Fit the ALB idle timeout to the slowest legitimate request
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** If an endpoint can stay silent longer than the ALB idle timeout (report generation, large uploads, long polls), either raise `idle_timeout` (1–4000 s) above that duration or make the endpoint send bytes / go async; don't raise it to the maximum by reflex.
- **Why:** At the default 60 s, a 90-second export returns **504** to the client while the target keeps working (and may be retried, doubling the work). A huge timeout instead keeps dead connections around and hides hung targets.
- **Detect:** Handlers with long synchronous work (`await generateReport`, `ZipFile`, `time.Sleep`, loops over large queries) or request timeouts (`context.WithTimeout(…, 2*time.Minute)`, `server.requestTimeout`) above the ALB `idle_timeout`; Terraform `idle_timeout = 4000` without justification.
- **Fix:** Return 202 + job ID and poll, or stream; otherwise `idle_timeout = 120` on the ALB with the app keep-alive above it (ELB-003).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html
- **Last verified:** 2026-10-12

### ELB-005 — Give target groups a dedicated, shallow health check
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Health checks hit a dedicated cheap path (e.g. `/healthz`) that returns 200 when the process can serve, with an explicit `matcher`; they do not call the database or downstream APIs, and they are not `/` serving a heavy page or a redirect.
- **Why:** A deep check that queries the DB marks *every* target unhealthy during a brief DB blip; the ALB then fails open to all targets anyway or, with several target groups, pulls the LB out of DNS — turning a dependency hiccup into a full outage. Checking `/` on an app that redirects to `/login` gets 302 and never becomes healthy with the default matcher `200`.
- **Detect:** Handler code for the health path running `SELECT`, `db.Ping`, `fetch(` to dependencies, `dynamodb.Scan` (high); Terraform `health_check { path = "/" }` or `path` absent (default `/`), or CDK `healthCheck` absent / `path: "/"`, **only when** the code shows `/` redirects (e.g. to `/login`), requires auth, or renders a heavy page — a cheap `/` that returns 200 is fine (do not report). Report the `/` cases as medium.
- **Fix:**
  ```hcl
  health_check { path = "/healthz"  matcher = "200"  interval = 15  healthy_threshold = 3  unhealthy_threshold = 2 }
  ```
  Put dependency checks in a separate readiness/diagnostic endpoint used for alarms, not routing.
- **Volatile:** no
- **Source:** https://aws.amazon.com/builders-library/implementing-health-checks/ ; https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html
- **Last verified:** 2026-10-12

### ELB-006 — Tune health check timing to how fast you need to detect failure
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Choose `interval`, `unhealthy_threshold` and `healthy_threshold` deliberately: ALB defaults are interval 30 s, timeout 5 s, unhealthy 2, healthy 5, so a dead target takes ~60 s to leave and a recovered one ~150 s to return (the Terraform provider documents `healthy_threshold` and `unhealthy_threshold` defaults of 3 — set them explicitly rather than rely on either).
- **Why:** Too slow means a minute of 5xx for a crashed task; too aggressive (5 s interval, threshold 2, timeout ≥ interval) flaps targets during GC pauses.
- **Detect:** Terraform `health_check` blocks with `timeout` ≥ `interval`, `interval = 300`, thresholds of 10; CDK `healthCheck: { interval: Duration.minutes(5) }`; no `health_check` block at all on latency-sensitive services.
- **Fix:** Typical web service: `interval = 10–15`, `timeout = 5`, `unhealthy_threshold = 2`, `healthy_threshold = 2–3`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_target_group
- **Last verified:** 2026-10-12

### ELB-007 — Set deregistration delay to just above the longest in-flight request
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Override the 300 s default `deregistration_delay` with a value slightly above the longest normal request (often 15–60 s for APIs); never 0 for services with in-flight requests.
- **Why:** At 300 s every rolling deploy and scale-in waits 5 minutes per batch of targets, so ECS deployments take ages and Spot interruptions (2-minute notice) cut connections anyway. At 0, in-flight requests are cut mid-response (5xx). A target that closes the connection before the delay ends also produces 5xx.
- **Detect:** Terraform `aws_lb_target_group` without `deregistration_delay` on ECS/ASG services; `deregistration_delay = 0` for HTTP APIs; CDK `ApplicationTargetGroup`/`addTargets` without `deregistrationDelay`; `ApplicationLoadBalancedFargateService` with `targetGroup` untouched.
- **Fix:** `deregistration_delay = 30`; CDK `targetGroup.setAttribute("deregistration_delay.timeout_seconds", "30")` or `deregistrationDelay: Duration.seconds(30)`; make the app stop accepting on SIGTERM and drain.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_target_group
- **Last verified:** 2026-10-12

### ELB-008 — Create Network Load Balancers with a security group
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Attach at least one security group when creating an NLB, and let targets accept traffic only from that SG.
- **Why:** An NLB created without security groups can never get one later (replacement required), all client traffic reaches its listeners, and targets must allow the client CIDRs directly (with client IP preservation) — usually `0.0.0.0/0` on the target SG.
- **Detect:** Terraform `aws_lb` with `load_balancer_type = "network"` and no `security_groups`; CDK `new elbv2.NetworkLoadBalancer(…)` without `securityGroups`; target SGs allowing `0.0.0.0/0` on the NLB target port.
- **Fix:** `security_groups = [aws_security_group.nlb.id]` at creation; target SG ingress `referenced_security_group_id = aws_security_group.nlb.id` on the target and health check ports.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-security-groups.html
- **Last verified:** 2026-10-12

### ELB-009 — Decide NLB cross-zone load balancing on purpose
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** NLB (and GWLB) cross-zone is off by default. Turning it on spreads load evenly but bills inter-AZ data both ways; leaving it off requires an even number of healthy targets per AZ.
- **Why:** With cross-zone on and 3 AZs, ~2/3 of bytes cross AZs: 50 TB/month → 34,133 GB × $0.02 = $683/month. With it off and 1 target in AZ-a vs 4 in AZ-b, the AZ-a target gets 4× the load of each AZ-b target and falls over first.
- **Detect:** Terraform `aws_lb` (`network`) with `enable_cross_zone_load_balancing = true`, or target group `load_balancing_cross_zone_enabled = "true"`; CDK `crossZoneEnabled: true`; or cross-zone off with targets/`desired_count` not a multiple of the AZ count.
- **Fix:** Keep it off and balance targets per AZ (ECS `placementStrategies: spread(AZ)`), or turn it on and accept the line item; say which in a comment.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html ; https://aws.amazon.com/blogs/networking-and-content-delivery/optimizing-data-transfer-costs-when-using-aws-network-load-balancer/
- **Last verified:** 2026-10-12

### ELB-010 — Restrict load balancer and target security groups
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** The LB SG allows only its listener ports from intended clients; target SGs allow the target and health check ports only from the LB SG. In CDK set `open: false` on internal listeners and grant explicitly.
- **Why:** CDK `addListener` defaults to `open: true`, which adds `0.0.0.0/0` ingress on the listener port to the LB SG — for an internal ALB that means "anyone who can reach the VPC" via peering/VPN/TGW. Targets that allow the VPC CIDR or `0.0.0.0/0` let callers bypass the LB (and its WAF/auth).
- **Detect:** CDK `addListener(` on `internetFacing: false` ALBs without `open: false`; Terraform target SG ingress with `cidr_blocks`/`cidr_ipv4` instead of the LB SG on the app port; ECS service SG allowing `0.0.0.0/0` on the container port.
- **Fix:** CDK `alb.addListener("Https", { port: 443, open: false }); listener.connections.allowDefaultPortFrom(clientSg)`; Terraform `referenced_security_group_id = aws_security_group.alb.id` on target SGs.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_elasticloadbalancingv2.ApplicationListener.html ; https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-update-security-groups.html
- **Last verified:** 2026-10-12

### ELB-011 — Match the LB scheme to its subnets and its audience
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** Internet-facing LBs live in public subnets (routes to an IGW); LBs used only by other services in the VPC are `internal`.
- **Why:** An internet-facing LB in private subnets is unreachable (clients time out). An internal-only API exposed with an internet-facing LB is publicly resolvable and reachable, relying solely on SGs.
- **Detect:** Terraform `aws_lb` with `internal = false` (default) and `subnets = aws_subnet.private[*].id`; `internal = false` for LBs whose only callers are other services (target names like `*-internal`, consumers inside the VPC); CDK `internetFacing: true` with `vpcSubnets: { subnetType: PRIVATE_* }`.
- **Fix:** `internal = true` for service-to-service; public subnets for internet-facing.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html
- **Last verified:** 2026-10-12

### ELB-012 — Drop invalid HTTP header fields on ALBs
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Set `drop_invalid_header_fields = true` and keep `desync_mitigation_mode` at `defensive` or `strictest`.
- **Why:** The default (`false`) forwards headers with invalid names to targets, which some frameworks parse differently from the ALB — an HTTP desync/request smuggling vector, and an AWS Security Hub ELB finding.
- **Detect:** Terraform `aws_lb` (`application`) without `drop_invalid_header_fields = true`, or `desync_mitigation_mode = "monitor"`; CDK `ApplicationLoadBalancer` without `dropInvalidHeaderFields: true`.
- **Fix:** `drop_invalid_header_fields = true`; CDK `dropInvalidHeaderFields: true`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html ; https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html
- **Last verified:** 2026-10-12

### ELB-013 — Enable deletion protection on production load balancers
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Production ALBs/NLBs set deletion protection.
- **Why:** A rename or a `terraform destroy` against the wrong workspace replaces the LB, changing its DNS name and static IPs (NLB EIPs), breaking CNAMEs, allow-lists and PrivateLink consumers.
- **Detect:** Terraform `aws_lb` without `enable_deletion_protection = true` in prod; CDK without `deletionProtection: true`.
- **Fix:** `enable_deletion_protection = true` (prod only).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html
- **Last verified:** 2026-10-12

### ELB-014 — Share one ALB across services with listener rules
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Services in the same VPC and trust zone share an ALB via host/path listener rules instead of one ALB each.
- **Why:** Each internet-facing ALB costs at least $0.0225 × 730 = $16.43/month plus ≥ 2 public IPv4 × $3.65 = $7.30 before LCUs. Twelve microservices with their own ALBs ≈ $285/month of fixed cost, versus ≈ $24 for one shared ALB (rules are free up to the LCU rule-evaluation allowance).
- **Detect:** Many `aws_lb` resources (or a module instantiated per service) in the same VPC with `internal` equal; CDK `ApplicationLoadBalancedFargateService` per service each creating its own LB; SST `sst.aws.Service` with `loadBalancer:` on many services in one cluster.
- **Fix:** One ALB, one HTTPS listener, `aws_lb_listener_rule` with `host_header`/`path_pattern` conditions per service; CDK pass `loadBalancer` to each patterns construct or use `listener.addTargets(…, { conditions, priority })`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/elasticloadbalancing/pricing/ ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### ELB-015 — Pick ALB for HTTP routing and NLB for TCP/UDP, static IPs or PrivateLink
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK
- **Rule:** HTTP/gRPC apps that need path/host routing, auth actions, WAF or HTTP health checks use an ALB; NLB is for non-HTTP protocols, static/Elastic IPs, extreme connection counts, or exposing a service over PrivateLink.
- **Why:** An NLB in front of an HTTP app loses HTTP-aware health checks (TCP only by default), redirects, WAF and per-request routing; teams then rebuild them in the app. An ALB chained behind an NLB just to get static IPs is often a sign Global Accelerator or ALB-type NLB targets were wanted.
- **Detect:** `load_balancer_type = "network"` with `protocol = "TCP"` listeners on 80/443 forwarding to web apps, `health_check { protocol = "TCP" }`; CDK `NetworkLoadBalancer` + `addTargets` for an Express/Go HTTP server.
- **Fix:** Use an ALB (keep NLB only for its specific reasons, or use an NLB with ALB-type target group when both are needed).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html ; https://docs.aws.amazon.com/elasticloadbalancing/latest/network/edit-target-group-attributes.html
- **Last verified:** 2026-10-12

### ELB-016 — Don't trust the leftmost X-Forwarded-For entry
- **Severity:** high
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** Behind an ALB in the default `append` mode, the client IP the ALB saw is the **last** entry of `X-Forwarded-For` (minus any trusted proxies after it); everything to its left is client-supplied.
- **Why:** Code that takes `xff.split(",")[0]` for rate limiting, allow-lists, geo or audit logs lets any caller set `X-Forwarded-For: 10.0.0.1` and bypass IP controls or forge audit entries.
- **Detect:** TS `req.headers["x-forwarded-for"].split(",")[0]`, Express `app.set("trust proxy", true)` (trusts all hops), `request.ip` with `trustProxy: true`; Go `strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]`, middleware like `RealIP` that takes the first value.
- **Fix:** Express `app.set("trust proxy", 1)` (number of trusted hops); Go take the last element after trimming known proxy hops. Or set `xff_header_processing_mode` deliberately and document it.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/x-forwarded-headers.html
- **Last verified:** 2026-10-12

### ELB-017 — Consider dual-stack without public IPv4 for internet-facing ALBs
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** When clients can reach the ALB over IPv6 (e.g. it sits behind CloudFront, or clients are IPv6-capable), use `ip_address_type = "dualstack-without-public-ipv4"` to stop paying for its public IPv4s.
- **Why:** An internet-facing ALB in 3 AZs uses ≥ 3 public IPv4s = $10.95/month each, more as it scales; per environment and per ALB this adds up. Caveat: ALB authentication actions (OIDC/Cognito) need IPv4 to reach the IdP.
- **Detect:** Terraform `aws_lb` internet-facing with `ip_address_type` absent/`ipv4` behind a CloudFront origin (`aws_cloudfront_distribution` origin pointing at the ALB); CDK `ipAddressType` absent.
- **Fix:** `ip_address_type = "dualstack-without-public-ipv4"` with dual-stack subnets; CDK `ipAddressType: elbv2.IpAddressType.DUAL_STACK_WITHOUT_PUBLIC_IPV4`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### ELB-018 — Keep Lambda-target request and response bodies under 1 MB
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** A Lambda function behind an ALB cannot receive a request body or return a response JSON larger than 1 MB; large payloads go through S3 presigned URLs or a different front door.
- **Why:** File uploads or big JSON exports through an ALB→Lambda path fail with 413/502 in production once data grows, while tests with small fixtures pass.
- **Detect:** Terraform `aws_lb_target_group` with `target_type = "lambda"`; CDK `new targets.LambdaTarget(fn)`; handler code returning large bodies (`JSON.stringify(allRows)`, base64 file contents, `isBase64Encoded: true`) or accepting uploads (`multipart/form-data`).
- **Fix:** Return a presigned S3 URL (`getSignedUrl(new GetObjectCommand(…))` / Go `s3.NewPresignClient`) and paginate JSON.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html
- **Last verified:** 2026-10-12

### ELB-019 — Keep long-lived TCP connections through an NLB alive under its idle timeout
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Connections that can sit idle behind an NLB TCP listener (database proxies, MQTT/WebSocket over TCP, gRPC streams, connection pools) either send keepalives more often than the listener's TCP idle timeout (default 350 s, configurable 60–6000 s; TLS listeners fixed at 350 s) or raise that timeout — and if raised above 350 s, the targets' connection-tracking idle timeout must be at least as long.
- **Why:** When a flow is idle past the timeout the NLB closes it; the next write on the pooled connection gets a reset, surfacing as `ECONNRESET` / "broken pipe" / Go `connection reset by peer` after quiet periods (nights, weekends). Raising the NLB timeout without matching the target ENI's connection tracking makes the target silently drop state instead.
- **Detect:** NLB (`load_balancer_type = "network"`, CDK `NetworkLoadBalancer`) with `protocol = "TCP"`/`"TLS"` listeners fronting databases, brokers or gRPC services, and client code with pools whose idle time exceeds 350 s and no TCP keepalive: TS `pg.Pool({ idleTimeoutMillis: 600000 })` without `keepAlive: true`, `socket.setKeepAlive(false)`; Go `net.Dialer{KeepAlive: -1}`, `db.SetConnMaxIdleTime(0)` / > 350 s. Terraform listener attribute `tcp.idle_timeout.seconds` above 350 with no matching target-side change.
- **Fix:** Enable keepalives below 350 s (Node `pg.Pool({ keepAlive: true, idleTimeoutMillis: 300_000 })`; Go `net.Dialer{KeepAlive: 60 * time.Second}`, `db.SetConnMaxIdleTime(5 * time.Minute)`), or raise the listener's TCP idle timeout deliberately and match it on the targets.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/network/update-idle-timeout.html
- **Last verified:** 2026-10-12
