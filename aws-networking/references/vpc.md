# VPC, endpoints, security groups, NACLs, public IPs, IPv6

Rules VPC-001 – VPC-020. NAT placement and cost live in [nat.md](nat.md).

### VPC-001 — Attach a Lambda function to a VPC only when it reaches private resources
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Put a function in a VPC only when it must reach something with a private IP (RDS, ElastiCache, an internal ALB, an EC2 host). A function that only calls DynamoDB, S3, SQS or public HTTPS APIs belongs outside the VPC.
- **Why:** Outside a VPC a function already has internet and AWS API access. Inside, the same calls need a NAT Gateway (≈$32.85/month per AZ plus $0.045/GB) or one interface endpoint per service per AZ, ENI creation leaves the function `Pending` for minutes on first deploy, and an idle function goes `Inactive` after 14 days and fails its next invoke.
- **Detect:** Terraform `aws_lambda_function` with `vpc_config { subnet_ids = … }`; CDK `new lambda.Function(…, { vpc, vpcSubnets })` / `NodejsFunction`; SST `new sst.aws.Function(…, { vpc })` or `vpc:` on an `ApiGatewayV2` route. Then open the handler: if the only clients are `@aws-sdk/client-dynamodb`, `client-s3`, `client-sqs`, `client-sns`, `client-eventbridge`, `fetch(`/`axios` to public hosts (Go: `service/dynamodb`, `service/s3`, `http.Get`), and no private host, DB driver (`pg`, `mysql2`, `ioredis`, `database/sql`, `go-redis`) or internal DNS name appears, the VPC attachment is unneeded.
- **Fix:** Remove the VPC config. If a private resource is needed later, attach then and add gateway endpoints (VPC-003).
  ```ts
  // SST — before: new sst.aws.Function("Api", { handler: "src/api.handler", vpc, link: [table] })
  new sst.aws.Function("Api", { handler: "src/api.handler", link: [table] });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### VPC-002 — Put VPC-attached Lambda functions in private subnets with an egress path
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** A VPC Lambda function must use private subnets that route `0.0.0.0/0` to a NAT (or have endpoints for every AWS service it calls). A public subnet does not give a function internet access.
- **Why:** Lambda ENIs never get a public IP. A function in a public subnet, or in an isolated subnet with no NAT and no endpoint, hangs on every outbound call until its timeout, and the error surfaces as task timeouts, not network errors.
- **Detect:** Terraform `vpc_config.subnet_ids` referencing subnets with `map_public_ip_on_launch = true` or whose route table has `gateway_id = aws_internet_gateway.*`; CDK `vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }` (CDK also requires `allowPublicSubnet: true` — that flag is itself the signal); `SubnetType.PRIVATE_ISOLATED` while the handler calls public hosts or AWS APIs with no matching endpoint; SST `sst.aws.Vpc` without `nat:` while the function calls the internet.
- **Fix:** Use `PRIVATE_WITH_EGRESS` subnets (CDK) or private subnets routed to NAT; or add the endpoints the code needs.
  ```ts
  new lambda.Function(this, "Fn", { vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, /* … */ });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html ; https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html
- **Last verified:** 2026-10-12

### VPC-003 — Add free gateway endpoints for S3 and DynamoDB in VPCs that use them
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Any VPC whose private workloads call S3 or DynamoDB through a NAT gets gateway endpoints for both, associated with every private route table.
- **Why:** Gateway endpoints have no hourly or per-GB charge. Without them S3/DynamoDB traffic pays NAT data processing: 5 TB/month of S3 reads = 5,120 GB × $0.045 = $230.40/month for nothing, plus cross-AZ charges if the NAT sits in another AZ. Gateway endpoints only cover the VPC's own Region (prefix lists are Regional): buckets in other Regions still go through the NAT, so don't promise savings for them.
- **Detect:** Terraform: `aws_nat_gateway` present and no `aws_vpc_endpoint` with `service_name` ending `.s3` or `.dynamodb` and `vpc_endpoint_type = "Gateway"` (the default); `module "vpc"` (terraform-aws-modules) without `vpc_endpoints` submodule usage. CDK: `new ec2.Vpc` with `natGateways` ≥ 1 and no `gatewayEndpoints` / `addGatewayEndpoint`. SST: `new sst.aws.Vpc(…, { nat: … })` — the component creates no endpoints, so look for `aws.ec2.VpcEndpoint` or a `transform`. Confirm the code in the VPC uses `@aws-sdk/client-s3` / `client-dynamodb` (Go `service/s3`, `service/dynamodb`).
- **Fix:**
  ```hcl
  resource "aws_vpc_endpoint" "s3" {
    vpc_id          = aws_vpc.main.id
    service_name    = "com.amazonaws.${var.region}.s3"
    route_table_ids = aws_route_table.private[*].id
  }
  ```
  ```ts
  new ec2.Vpc(this, "Vpc", { gatewayEndpoints: {
    S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
    DynamoDB: { service: ec2.GatewayVpcEndpointAwsService.DYNAMODB } } });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html ; https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### VPC-004 — Use the gateway endpoint, not an interface endpoint, for in-VPC S3/DynamoDB access
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** An interface endpoint for S3 or DynamoDB is justified only for access from on-premises, peered VPCs or other Regions; workloads inside the VPC use the free gateway endpoint.
- **Why:** An interface endpoint costs $0.01/h per AZ plus $0.01/GB: 3 AZs × $0.01 × 730 = $21.90/month, plus 5 TB × $0.01 = $51.20, for traffic a gateway endpoint carries free.
- **Detect:** Terraform `aws_vpc_endpoint` with `service_name` ending `.s3` or `.dynamodb` and `vpc_endpoint_type = "Interface"`; CDK `addInterfaceEndpoint(…, { service: ec2.InterfaceVpcEndpointAwsService.S3 })` or `DYNAMODB`; no Direct Connect/VPN/TGW/peering resource that would need it.
- **Fix:** Replace with a `Gateway` endpoint (VPC-003 snippet). Keep the interface endpoint only if on-premises or cross-VPC clients use it, and say so in a comment.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html ; https://aws.amazon.com/privatelink/pricing/
- **Last verified:** 2026-10-12

### VPC-005 — Count interface endpoints × AZs × environments before adding them
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Each interface endpoint is billed per AZ per hour whether used or not; add one only when its traffic or a no-internet requirement justifies it, and share endpoints across VPCs (hub VPC) when many accounts need the same set.
- **Why:** A "private VPC" baseline of 10 interface endpoints (ECR api+dkr, logs, sts, secretsmanager, ssm, kms, sqs, sns, monitoring) in 3 AZs = 10 × 3 × $0.01 × 730 = $219/month per VPC; copied to dev, staging and prod that is $657/month before any data — often more than the NAT it replaced. Break-even versus NAT data processing ($0.045/GB vs $0.01/GB) for one endpoint in 3 AZs is ≈ 626 GB/month.
- **Detect:** Terraform `for_each` over a list of services into `aws_vpc_endpoint` with `vpc_endpoint_type = "Interface"`; CDK loops calling `addInterfaceEndpoint`; the same module instantiated per environment; endpoints in non-prod stacks (`dev`, `staging` in names or tfvars).
- **Fix:** Keep interface endpoints where the subnet has no NAT by design or the traffic is large (ECR image pulls, CloudWatch Logs); in dev use the NAT or fewer AZs (`subnet_ids` with one subnet).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/privatelink/pricing/ ; https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html
- **Last verified:** 2026-10-12

### VPC-006 — Enable private DNS on interface endpoints and DNS support on the VPC
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Interface endpoints for AWS services set `private_dns_enabled = true`, and the VPC has `enable_dns_support` and `enable_dns_hostnames` true; otherwise SDK calls keep resolving the public endpoint.
- **Why:** With private DNS off, `sqs.us-east-1.amazonaws.com` still resolves to public IPs: traffic goes through the NAT (paid twice: endpoint hours plus NAT GB) or, in a subnet without NAT, every SDK call times out.
- **Detect:** Terraform `aws_vpc_endpoint` with `vpc_endpoint_type = "Interface"` and `private_dns_enabled` absent or `false` (provider default is `false` for AWS service endpoints created in Terraform); `aws_vpc` with `enable_dns_hostnames` absent (defaults to `false`) or `false`; CDK `addInterfaceEndpoint(…, { privateDnsEnabled: false })`. Code that hard-codes `vpce-…vpce.amazonaws.com` in `endpoint:` (TS) / `BaseEndpoint` (Go) is the workaround and the signal.
- **Fix:**
  ```hcl
  resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16"  enable_dns_support = true  enable_dns_hostnames = true }
  resource "aws_vpc_endpoint" "sqs" {
    vpc_id = aws_vpc.main.id  service_name = "com.amazonaws.${var.region}.sqs"
    vpc_endpoint_type = "Interface"  private_dns_enabled = true
    subnet_ids = aws_subnet.private[*].id  security_group_ids = [aws_security_group.endpoints.id]
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_endpoint
- **Last verified:** 2026-10-12

### VPC-007 — Never open admin or data ports to 0.0.0.0/0 or ::/0
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Ingress from `0.0.0.0/0` or `::/0` is allowed only on the public listener ports of an internet-facing load balancer or a deliberately public service (80/443). SSH, RDP, database, cache and app ports take a security group reference or a narrow CIDR.
- **Why:** Open 22/3389/5432/3306/6379/27017 are scanned within minutes of creation; one weak password or unpatched service becomes a breach. For a public database it also bills public IPv4.
- **Detect:** Terraform `cidr_blocks = ["0.0.0.0/0"]` / `ipv6_cidr_blocks = ["::/0"]` in `ingress {}` or `aws_security_group_rule` (`type = "ingress"`), `aws_vpc_security_group_ingress_rule` with `cidr_ipv4 = "0.0.0.0/0"` / `cidr_ipv6 = "::/0"` and `from_port` not 80/443 (or `ip_protocol = "-1"`); CDK `addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22))`, `Peer.anyIpv6()`, `Port.allTraffic()`; `connections.allowFromAnyIpv4(`.
- **Fix:** Reference the caller's SG (VPC-008); for humans use SSM Session Manager instead of SSH.
  ```hcl
  resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
    security_group_id            = aws_security_group.db.id
    referenced_security_group_id = aws_security_group.app.id
    ip_protocol = "tcp"  from_port = 5432  to_port = 5432
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-best-practices.html ; https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
- **Last verified:** 2026-10-12

### VPC-008 — Reference security groups instead of CIDR ranges for traffic inside the VPC
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** App-to-DB, LB-to-target and service-to-service rules use the source security group, not the VPC CIDR or subnet CIDRs.
- **Why:** `10.0.0.0/16` lets every ENI in the VPC (bastions, other teams' tasks, endpoint ENIs) reach the database; an SG reference follows the workload as it scales and documents intent.
- **Detect:** Terraform `cidr_blocks = [aws_vpc.main.cidr_block]` / `[var.vpc_cidr]` / `"10.` literals on ingress to DB, cache or app SGs; `cidr_ipv4 = aws_vpc.*.cidr_block`; CDK `ec2.Peer.ipv4(vpc.vpcCidrBlock)`.
- **Fix:** Terraform `referenced_security_group_id = aws_security_group.app.id`; CDK `db.connections.allowDefaultPortFrom(appService)` or `sg.addIngressRule(appSg, ec2.Port.tcp(5432))`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
- **Last verified:** 2026-10-12

### VPC-009 — Use one rule style per security group in Terraform
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** Manage rules with `aws_vpc_security_group_ingress_rule` / `aws_vpc_security_group_egress_rule` (one CIDR or SG per resource); never mix inline `ingress {}`/`egress {}` blocks with standalone rule resources on the same group.
- **Why:** Mixing makes Terraform fight itself: each apply removes the rules the other style added, causing perpetual diffs and windows where traffic is dropped. Inline rules also lack IDs, tags and descriptions.
- **Detect:** An `aws_security_group` with `ingress {` or `egress {` blocks whose `id` is also referenced by `aws_security_group_rule`, `aws_vpc_security_group_ingress_rule` or `aws_vpc_security_group_egress_rule`; new code adding `aws_security_group_rule` (legacy).
- **Fix:** Move inline blocks to `aws_vpc_security_group_*_rule` resources and remove the blocks (setting `ingress = []` once if they must be purged).
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_ingress_rule
- **Last verified:** 2026-10-12

### VPC-010 — Keep the default security group empty and unused
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Strip all rules from each VPC's default security group and give every resource its own SG.
- **Why:** The default SG allows all traffic between its members and all egress. Any resource created without an explicit SG (an RDS instance, an endpoint, a task) lands in it and can talk to everything else that also landed there.
- **Detect:** Terraform `aws_vpc` without an `aws_default_security_group` that sets no `ingress`/`egress`; `vpc_security_group_ids` containing `aws_vpc.*.default_security_group_id`; CDK `new ec2.Vpc(…, { restrictDefaultSecurityGroup: false })` or an app whose `cdk.json` lacks `@aws-cdk/aws-ec2:restrictDefaultSecurityGroup` (older apps) with no explicit `true`.
- **Fix:**
  ```hcl
  resource "aws_default_security_group" "default" { vpc_id = aws_vpc.main.id }  # no rules = deny all
  ```
  CDK: `new ec2.Vpc(this, "Vpc", { restrictDefaultSecurityGroup: true })`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/default-security-group.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Vpc.html
- **Last verified:** 2026-10-12

### VPC-011 — Allow ephemeral return ports in custom NACLs
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** NACLs are stateless: every custom NACL that allows a request in one direction must allow the response on ephemeral ports 1024–65535 in the other direction (including NAT Gateway subnets and LB subnets).
- **Why:** A NACL that allows outbound 443 but not inbound 1024–65535 blocks every HTTPS response: SDK calls, image pulls and health checks time out, intermittently if only some subnets got the NACL.
- **Detect:** Terraform `aws_network_acl` / `aws_network_acl_rule` with `egress = true` allows on 443/80/5432 and no `egress = false` rule covering `from_port = 1024, to_port = 65535` (and vice versa); CDK `new ec2.NetworkAcl` + `addEntry` lacking `AclTraffic.tcpPortRange(1024, 65535)`.
- **Fix:** Add the matching ephemeral range rule per direction; prefer security groups for fine-grained control and keep NACLs coarse.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/nacl-ephemeral-ports.html ; https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
- **Last verified:** 2026-10-12

### VPC-012 — Avoid public IPv4 addresses that are not needed
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every public IPv4 address (in use or idle, including EIPs and those on ALB/NAT/instances/tasks) bills $0.005/h; give public IPs only to things clients must reach directly, and release unattached EIPs.
- **Why:** 40 Fargate tasks with `assign_public_ip = true` = 40 × $0.005 × 730 = $146/month for addresses nobody connects to, plus the exposure. An allocated but unattached `aws_eip` costs $3.65/month each.
- **Detect:** Terraform `map_public_ip_on_launch = true` on subnets that host instances/tasks, `associate_public_ip_address = true`, ECS `network_configuration { assign_public_ip = true }`, `aws_eip` without `instance`/`network_interface`/`aws_eip_association`/use by a NAT; CDK `assignPublicIp: true`, `SubnetType.PUBLIC` for app tiers, `associatePublicIpAddress: true`; SST services in public subnets.
- **Fix:** Run workloads in private subnets behind an LB; use IPv6 or `dualstack-without-public-ipv4` on ALBs where clients support it (ELB-017); delete stray EIPs.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/vpc/pricing/ ; https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights/
- **Last verified:** 2026-10-12

### VPC-013 — Spread production subnets across at least two AZs
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Production VPCs have private (and, if needed, public) subnets in ≥ 2 AZs and each tier (LB, compute, endpoints, DB subnet group) spans them.
- **Why:** A single-AZ design goes fully down with its AZ; an ALB rejects a single-AZ subnet list; interface endpoints in one AZ make other AZs lose AWS API access when that AZ fails.
- **Detect:** CDK `maxAzs: 1`; Terraform subnet lists with one element (`subnet_ids = [aws_subnet.private_a.id]`) for prod resources, `availability_zone` hard-coded identically on all subnets; SST `new sst.aws.Vpc(…, { az: 1 })`; interface endpoints with one subnet in prod.
- **Fix:** `maxAzs: 2` (or 3) / `az: 2`; pass all private subnets to LB, compute, endpoints and DB subnet groups.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-best-practices.html ; https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html
- **Last verified:** 2026-10-12

### VPC-014 — Size subnets for ENI growth
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Subnets hosting ALBs are at least `/27` with ≥ 8 free IPs; subnets for Lambda, Fargate, EKS pods or endpoints leave headroom for peak ENIs (AWS reserves 5 addresses per subnet).
- **Why:** An ALB that cannot get IPs to scale runs with insufficient capacity and returns 5xx/timeouts; Fargate tasks and pods fail to launch with "insufficient free addresses" during a scale-out — exactly when you need them.
- **Detect:** Terraform `cidrsubnet(…, 12)` style math producing `/28`, literal `"/28"` CIDRs on LB or compute subnets; CDK `cidrMask: 28`.
- **Fix:** `/24` or larger for compute tiers in prod; `/27`+ for LB subnets.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html ; https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
- **Last verified:** 2026-10-12

### VPC-015 — Keep chatty traffic inside one AZ where you can
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, Go, TypeScript
- **Rule:** High-volume traffic between tiers (app ↔ cache, app ↔ NAT, service ↔ service, NLB ↔ targets) should stay in the same AZ or be priced explicitly; data crossing AZs costs $0.01/GB in each direction.
- **Why:** 20 TB/month of app↔cache traffic split evenly across 3 AZs crosses AZs ~2/3 of the time: 13,653 GB × $0.02 = $273/month. A cache node or NAT pinned to one AZ makes it 100 %.
- **Detect:** Terraform single-AZ placements for shared hubs (`availability_zone = "…a"` on a NAT, cache node, or single-instance proxy) used by multi-AZ consumers; private route tables in all AZs pointing at one NAT (NAT-001); NLB `enable_cross_zone_load_balancing = true` (ELB-009); code with high request fan-out to a single endpoint.
- **Fix:** One NAT per AZ, AZ-local endpoints (zonal DNS names), Multi-AZ caches with reader endpoints per AZ, NLB cross-zone off when targets are balanced per AZ.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/blogs/networking-and-content-delivery/optimizing-data-transfer-costs-when-using-aws-network-load-balancer/ ; https://aws.amazon.com/ec2/pricing/on-demand/
- **Last verified:** 2026-10-12

### VPC-016 — Route IPv6 egress from private subnets through an egress-only internet gateway
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** In private subnets, `::/0` points to an egress-only internet gateway, never to the internet gateway.
- **Why:** IPv6 addresses are globally routable. A `::/0 → igw` route in a "private" subnet makes every IPv6-enabled instance reachable from the internet, bypassing the NAT-based assumption that private means unreachable (only SGs stand in the way).
- **Detect:** Terraform `aws_route` with `destination_ipv6_cidr_block = "::/0"` and `gateway_id = aws_internet_gateway.*` on a route table associated with private subnets, or `route { ipv6_cidr_block = "::/0", gateway_id = … }`; missing `aws_egress_only_internet_gateway` in a dual-stack VPC; CDK `ipProtocol: ec2.IpProtocol.DUAL_STACK` with custom routes to `CfnInternetGateway`.
- **Fix:**
  ```hcl
  resource "aws_egress_only_internet_gateway" "eigw" { vpc_id = aws_vpc.main.id }
  resource "aws_route" "private_v6" {
    route_table_id = aws_route_table.private.id  destination_ipv6_cidr_block = "::/0"
    egress_only_gateway_id = aws_egress_only_internet_gateway.eigw.id
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html
- **Last verified:** 2026-10-12

### VPC-017 — Let dual-stack Lambda functions use IPv6 for egress
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** When a VPC function sits in dual-stack subnets and talks to IPv6-capable destinations, set `ipv6_allowed_for_dual_stack = true` so that traffic can leave through the egress-only gateway instead of the NAT.
- **Why:** The option is off by default; without it all egress uses IPv4 through NAT at $0.045/GB even though a free IPv6 path exists.
- **Detect:** Terraform `aws_lambda_function.vpc_config` without `ipv6_allowed_for_dual_stack` in a VPC with `assign_generated_ipv6_cidr_block = true` and subnets with `ipv6_cidr_block`; CDK `lambda.Function` in a `DUAL_STACK` VPC without `ipv6AllowedForDualStack: true`.
- **Fix:** `vpc_config { … ipv6_allowed_for_dual_stack = true }` (all subnets must be dual-stack).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function
- **Last verified:** 2026-10-12

### VPC-018 — Restrict egress where the data warrants it, and say why when you don't
- **Severity:** low
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** SGs on workloads that handle sensitive data allow egress only to what they need (DB SG, endpoint SG, `pl-` prefix lists, 443); an all-ports `0.0.0.0/0` egress is acceptable for general app tiers but should be a choice, not a default.
- **Why:** Open egress is what turns a code-execution bug into data exfiltration; tight egress on DB/batch tiers is cheap insurance.
- **Detect:** Terraform `aws_vpc_security_group_egress_rule` with `ip_protocol = "-1"` and `cidr_ipv4 = "0.0.0.0/0"` (or inline `egress { protocol = "-1" … }`) on DB/cache/batch SGs; CDK `allowAllOutbound` absent (defaults to `true`) on `ec2.SecurityGroup` for data tiers.
- **Fix:** CDK `new ec2.SecurityGroup(this, "Db", { vpc, allowAllOutbound: false })`; Terraform egress rules with `prefix_list_id` for S3/DynamoDB gateway endpoints and SG references for peers.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html ; https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html
- **Last verified:** 2026-10-12

### VPC-019 — Let clients reach interface endpoints on 443 through the endpoint's security group
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** Every interface endpoint has its own security group that allows inbound TCP 443 from the workloads that call it (their SG or the private subnets), and those workloads' egress rules allow 443 to it.
- **Why:** If no SG is given, the endpoint gets the VPC default SG — which, correctly locked down (VPC-010), allows nothing, and otherwise allows only members of the default SG. With private DNS on, SDK calls then resolve to the endpoint and hang until timeout (Lambda timeouts, ECS `CannotPullContainerError` / `ResourceInitializationError` for ECR and Secrets Manager), even though the endpoint exists and looks healthy.
- **Detect:** Terraform `aws_vpc_endpoint` with `vpc_endpoint_type = "Interface"` and `security_group_ids` absent, or pointing to an SG with no ingress rule on 443 (`aws_vpc_security_group_ingress_rule` / inline `ingress`) from the callers' SG or CIDR; caller SGs whose egress excludes 443 to the endpoint SG/VPC CIDR. CDK `addInterfaceEndpoint(…, { open: false })` without `endpoint.connections.allowDefaultPortFrom(…)` (CDK's default `open: true` allows the VPC CIDR).
- **Fix:**
  ```hcl
  resource "aws_vpc_security_group_ingress_rule" "endpoints_https" {
    security_group_id            = aws_security_group.endpoints.id
    referenced_security_group_id = aws_security_group.app.id
    ip_protocol = "tcp"  from_port = 443  to_port = 443
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html ; https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html
- **Last verified:** 2026-10-12

### VPC-020 — Give Fargate tasks a route to ECR (and their other AWS dependencies) before they start
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** A Fargate task pulls its image over the network, so its subnet needs one of: a public subnet **with** `assign_public_ip = true`; a private subnet routed to a NAT; or the `ecr.api` + `ecr.dkr` interface endpoints **plus** the S3 gateway endpoint (and `logs` for `awslogs`, `secretsmanager`/`ssm` for injected secrets).
- **Why:** A task in a public subnet without a public IP, or in an isolated subnet with only some of the endpoints, never reaches `RUNNING`: it fails with `CannotPullContainerError` / `ResourceInitializationError` in a deployment loop. The ECR endpoints alone are not enough because image layers are served from S3.
- **Detect:** Terraform `aws_ecs_service` with `launch_type = "FARGATE"` (or a Fargate capacity provider) whose `network_configuration.subnets` are public (route to IGW) and `assign_public_ip` absent/`false`; or private subnets with no `nat_gateway_id` route and a missing `com.amazonaws.<region>.ecr.dkr`, `.ecr.api` interface endpoint or `.s3` gateway endpoint; task definitions with `logConfiguration.logDriver = "awslogs"` or `secrets` but no `logs`/`secretsmanager`/`ssm` endpoint in such subnets. CDK `FargateService` with `vpcSubnets: { subnetType: PUBLIC }` and `assignPublicIp` absent, or `PRIVATE_ISOLATED` without those endpoints. SST `sst.aws.Cluster` on a `sst.aws.Vpc` without `nat:`.
- **Fix:** Prefer private subnets with NAT (or the endpoint set above); in dev, public subnets with `assign_public_ip = true` are acceptable (costs a public IPv4 per task, VPC-012).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html ; https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html
- **Last verified:** 2026-10-12
