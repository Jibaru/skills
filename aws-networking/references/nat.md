# NAT: zonal, regional, instances, egress routing

Rules NAT-001 – NAT-011. Prices are us-east-1/us-east-2 on-demand; confirm per Region.
NAT Gateway: $0.045/h per gateway (regional mode: per AZ it is active in) + $0.045/GB processed;
public IPv4 $0.005/h per address. 730 h/month.

### NAT-001 — Route each private subnet to a NAT in its own AZ in production
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** In production, either run one zonal NAT Gateway per AZ with each private route table pointing to the NAT in the same AZ, or use a regional NAT Gateway. Never point every AZ's private subnets at a single zonal NAT.
- **Why:** A zonal NAT lives in one AZ. If that AZ fails, every private subnet in the other AZs loses outbound access (package downloads, third-party APIs, AWS APIs without endpoints) even though their compute is healthy. Meanwhile all cross-AZ egress pays $0.01/GB each way on top of NAT processing.
- **Detect:** Terraform: one `aws_nat_gateway` (or `count = 1`) with several private `aws_route_table`/`aws_route` resources all using `nat_gateway_id = aws_nat_gateway.main.id`; `terraform-aws-modules/vpc` with `single_nat_gateway = true` in a prod workspace/tfvars. CDK: `natGateways: 1` with `maxAzs` ≥ 2 in a prod stack. SST: `nat` with a custom `transform` that collapses gateways.
- **Fix:**
  ```hcl
  resource "aws_nat_gateway" "az" {
    for_each      = aws_subnet.public            # one per AZ
    subnet_id     = each.value.id
    allocation_id = aws_eip.nat[each.key].id
  }
  resource "aws_route" "private_default" {
    for_each               = aws_route_table.private   # keyed by the same AZ
    route_table_id         = each.value.id
    destination_cidr_block = "0.0.0.0/0"
    nat_gateway_id         = aws_nat_gateway.az[each.key].id
  }
  ```
  Or one regional NAT (NAT-003).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html ; https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html
- **Last verified:** 2026-10-12

### NAT-002 — Don't pay for a NAT per AZ in non-production
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Dev, preview and per-PR environments use one NAT, a NAT instance, or no NAT (functions outside the VPC, endpoints) instead of the production layout.
- **Why:** CDK's `ec2.Vpc` defaults to `maxAzs: 3` and one NAT Gateway per AZ: 3 × $0.045 × 730 = $98.55/month per environment before any data, plus 3 EIPs × $3.65 = $10.95. Ten preview stacks = ~$1,095/month of idle NAT.
- **Detect:** CDK `new ec2.Vpc(this, …)` without `natGateways` (default = one per AZ) in stacks instantiated per stage/branch; Terraform `one_nat_gateway_per_az = true` or `for_each` NAT in `dev`/`staging` tfvars; SST `nat: "managed"` without a `$app.stage === "production"` guard.
- **Fix:**
  ```ts
  // SST
  const vpc = new sst.aws.Vpc("Vpc", { nat: $app.stage === "production" ? "managed" : "ec2" });
  // CDK
  new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: props.isProd ? 2 : 1 });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Vpc.html ; https://sst.dev/docs/component/aws/vpc/ ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### NAT-003 — Consider a regional NAT Gateway instead of hand-wiring one NAT per AZ
- **Severity:** low
- **Category:** simplicity
- **Applies to:** Terraform, CDK
- **Rule:** For public NAT, a regional NAT Gateway (`availability_mode = "regional"`) gives per-AZ HA with one ID, no public subnets and one route for all private subnets; keep zonal mode only for private NAT, constrained AZs, or when you must pin EIPs per AZ manually.
- **Why:** Per-AZ NAT wiring is repetitive and easy to get wrong (NAT-001, NAT-005). A regional NAT expands to AZs where it detects ENIs (up to 60 minutes; until then traffic is processed cross-zone) and supports up to 32 IPs per AZ versus 8, reducing port exhaustion (NAT-009). It is billed per hour per AZ it is active in, so the hourly cost is like N zonal gateways, not one.
- **Detect:** Terraform `aws_nat_gateway` with `for_each`/`count` over public subnets plus per-AZ route tables; CDK `NatProvider.gateway()` or default with `maxAzs` ≥ 2. Do not flag `connectivity_type = "private"`.
- **Fix:**
  ```hcl
  resource "aws_nat_gateway" "regional" {
    vpc_id            = aws_vpc.main.id
    availability_mode = "regional"    # auto mode: AWS manages EIPs and AZ expansion
  }
  ```
  ```ts
  new ec2.Vpc(this, "Vpc", { natGatewayProvider: ec2.NatProvider.regionalGateway(), natGateways: 1 });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/nat_gateway ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### NAT-004 — Move heavy AWS-service traffic off the NAT
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** When most NAT bytes go to AWS services, use gateway endpoints (S3, DynamoDB — free) and interface endpoints for the heavy hitters (ECR, CloudWatch Logs, Kinesis/Firehose) where volume beats the endpoint's hourly cost.
- **Why:** NAT processing is $0.045/GB; an interface endpoint is $0.01/GB plus $0.01/h per AZ. Pulling 3 TB/month of container images through NAT = 3,072 × $0.045 = $138.24; with ECR interface endpoints (api + dkr in 2 AZs = 4 × $0.01 × 730 = $29.20) the layers come from S3 through the free gateway endpoint, so only small manifest/API bytes pay $0.01/GB.
- **Detect:** Private subnets with NAT and ECS/EKS/Batch tasks (`aws_ecs_service`, `FargateService`, `sst.aws.Service`) pulling from ECR without `ecr.api`/`ecr.dkr` endpoints and the S3 gateway endpoint; heavy log shipping (`client-cloudwatch-logs`, Firehose `PutRecordBatch` in loops); `client-s3` bulk transfers from VPC Lambda/tasks with no S3 gateway endpoint (VPC-003).
- **Fix:** Add the endpoints; for ECR always pair `ecr.api` + `ecr.dkr` interface endpoints with the S3 gateway endpoint.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html ; https://aws.amazon.com/privatelink/pricing/ ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### NAT-005 — Put a zonal public NAT Gateway in a public subnet
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** A zonal NAT with `connectivity_type = "public"` must sit in a subnet whose route table sends `0.0.0.0/0` to the internet gateway, and it needs an EIP.
- **Why:** A public NAT placed in a private subnet routes its own egress back to itself or nowhere: every outbound connection from the private subnets silently times out.
- **Detect:** Terraform `aws_nat_gateway.subnet_id = aws_subnet.private*.id` (or a subnet whose route table has no `gateway_id = aws_internet_gateway.*`); missing `allocation_id` with public connectivity; route tables of the NAT subnet with `nat_gateway_id` as default route.
- **Fix:** `subnet_id = aws_subnet.public[each.key].id` with `allocation_id`, or switch to a regional NAT, which needs no public subnet (NAT-003).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/nat_gateway
- **Last verified:** 2026-10-12

### NAT-006 — Point private default routes at the NAT, not the internet gateway
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform
- **Rule:** Private route tables use `nat_gateway_id` for `0.0.0.0/0`; `gateway_id = aws_internet_gateway.*` makes the subnet public.
- **Why:** With an IGW default route, any instance or task that gets a public IP (`map_public_ip_on_launch`, `assign_public_ip`) becomes directly reachable from the internet; those without one lose egress entirely.
- **Detect:** `aws_route` / inline `route {}` on a table associated (`aws_route_table_association`) with subnets named or tagged private, with `destination_cidr_block = "0.0.0.0/0"` and `gateway_id = aws_internet_gateway.*` ; `gateway_id = aws_nat_gateway.*.id` (works in some provider versions but hides intent — use `nat_gateway_id`).
- **Fix:** `nat_gateway_id = aws_nat_gateway.az[each.key].id`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-scenarios.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route
- **Last verified:** 2026-10-12

### NAT-007 — Give workloads that call the internet an egress path
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A VPC workload that calls public hosts (payment APIs, webhooks, OAuth/JWKS, package registries) needs a NAT or regional NAT on its subnets; endpoints only cover AWS services.
- **Why:** SST's `sst.aws.Vpc` has NAT disabled by default and CDK `natGateways: 0` yields isolated subnets. The deploy succeeds, then `fetch("https://api.stripe.com")` hangs until the function timeout in production.
- **Detect:** SST `new sst.aws.Vpc(…)` without `nat:` used as `vpc:` by a Function/Service whose code calls `fetch(`/`axios`/`got`/`undici` or Go `http.Client`/`http.Get` with a non-AWS host, JWKS URLs (`jwks.json`, `.well-known/openid-configuration`); CDK `natGateways: 0` or `SubnetType.PRIVATE_ISOLATED` for such functions.
- **Fix:** `nat: "managed"` (prod) or `"ec2"` (dev); or move the function out of the VPC (VPC-001).
- **Volatile:** no
- **Source:** https://sst.dev/docs/component/aws/vpc/ ; https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html
- **Last verified:** 2026-10-12

### NAT-008 — Use NAT instances only where their limits are acceptable
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** NAT instances (SST `nat: "ec2"` with fck-nat, CDK `NatProvider.instanceV2`, hand-rolled EC2 with `source_dest_check = false`) are fine for dev; in production they need per-AZ instances, health-based replacement, patching and a bandwidth-appropriate size.
- **Why:** A `t4g.nano` NAT has burstable, small bandwidth and is a single instance per AZ: instance failure, maintenance or credit exhaustion drops egress for its AZ, and nothing scales it.
- **Detect:** SST `nat: "ec2"` or `nat: { ec2: { instance: "t4g.nano" } }` in a production stage; CDK `NatProvider.instance(` (deprecated) / `instanceV2(` in prod stacks; Terraform `aws_instance` with `source_dest_check = false` used as `network_interface_id` target of `0.0.0.0/0`.
- **Fix:** Use managed NAT in production (`nat: "managed"`, regional NAT) or document the HA/scale plan for the instance.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/work-with-nat-instances.html ; https://sst.dev/docs/component/aws/vpc/
- **Last verified:** 2026-10-12

### NAT-009 — Avoid NAT port exhaustion: reuse connections and add IPs
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, TypeScript, Go
- **Rule:** High-fan-out egress to one destination reuses HTTP connections (keep-alive, shared clients) and, if needed, adds NAT IPs; each NAT IPv4 supports up to 55,000 simultaneous connections per unique destination (IP, port, protocol).
- **Why:** A worker fleet that opens a new TLS connection per request to one API exhausts NAT ports: `ErrorPortAllocation` rises and new connections fail while the NAT looks healthy.
- **Detect:** Go: `&http.Client{}` or `http.Transport{DisableKeepAlives: true}` created inside a request/loop, `resp.Body` not closed/drained (blocks reuse); TS: `new https.Agent({ keepAlive: false })`, a new SDK client per invocation in hot loops, `Connection: close` headers; Terraform NAT with a single `allocation_id` serving large fleets (`desired_count` in the hundreds).
- **Fix:** One shared client per process, created outside the handler (Go `http.Client` with `Transport.MaxIdleConnsPerHost` raised; TS one SDK client / one keep-alive `Agent` per module); add `secondary_allocation_ids` on zonal NAT (up to 8 IPv4 addresses per NAT; public NATs get 2 EIPs by default until you raise the quota) or use regional NAT (up to 32 IPs per AZ).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html ; https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-troubleshooting.html ; https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html
- **Last verified:** 2026-10-12

### NAT-010 — Keep long-lived connections through NAT alive under 350 seconds
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Connections that idle through a NAT Gateway (DB over the internet, long polls, gRPC streams, SFTP) send TCP keepalives or application pings more often than every 350 seconds.
- **Why:** A NAT Gateway drops a connection idle for 350 s without telling either side; the next write hangs or gets a reset, surfacing as random "socket hang up"/`ECONNRESET` or Go `i/o timeout` errors after quiet periods.
- **Detect:** Go `net.Dialer{KeepAlive: -1}` or custom dialers without `KeepAlive`, pooled DB connections with `SetConnMaxIdleTime` > 350 s or unset, to hosts outside the VPC; TS `socket.setKeepAlive(false)`, pools (`pg.Pool`, `mysql2`) with `idleTimeoutMillis` > 350000 and no `keepAlive: true`, to non-VPC hosts.
- **Fix:** Go `net.Dialer{KeepAlive: 60 * time.Second}` and `db.SetConnMaxIdleTime(5 * time.Minute)`; Node `new pg.Pool({ keepAlive: true, idleTimeoutMillis: 300_000 })`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-troubleshooting.html
- **Last verified:** 2026-10-12

### NAT-011 — Prefer an egress-only internet gateway for IPv6 egress over NAT
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** IPv6 outbound traffic from private subnets leaves through an egress-only internet gateway (no hourly or processing charge); reserve NAT64 for IPv6-only workloads that must reach IPv4-only destinations.
- **Why:** An egress-only gateway has no charge of its own (normal data transfer out applies); sending IPv6-capable traffic through NAT64 adds $0.045/GB processing plus NAT hours.
- **Detect:** Dual-stack VPCs with `aws_route` `destination_ipv6_cidr_block = "64:ff9b::/96"` → NAT plus no `aws_egress_only_internet_gateway`; subnets with `enable_dns64 = true` where destinations support IPv6.
- **Fix:** Add the egress-only gateway route for `::/0` (VPC-016) and keep `64:ff9b::/96 → NAT` only for IPv4-only targets.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html ; https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-nat64-dns64.html ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12
