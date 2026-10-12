# Networking and data transfer

Prices below are us-east-1 as verified on 2026-10-12. Confirm them live before quoting.
Reference prices: NAT gateway $0.045/h and $0.045/GB processed; public IPv4 $0.005/h (in use
or idle); interface endpoint $0.01/h per endpoint ENI (per AZ) plus $0.01/GB (first PB);
gateway endpoints free; cross-AZ transfer $0.01/GB each direction; internet egress from EC2/S3
$0.09/GB after the 100 GB/month free allowance (the EC2 page renders this rate dynamically);
CloudFront US/Mexico/Canada egress first 1 TB/month free, then $0.085/GB (next 9 TB),
pay-as-you-go; AWS origin → CloudFront transfer free; Application Load Balancer $0.0225/h plus
$0.008 per LCU-hour.

### COST-001 — Size NAT gateways to the environment
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Non-production VPCs use one NAT gateway (or a NAT instance) for all AZs; one NAT per AZ is a production availability choice, not a default.
- **Why:** Each NAT gateway bills $0.045/h whether it moves traffic or not. CDK `ec2.Vpc` defaults to one NAT per AZ with `maxAzs: 3` (environment-agnostic stacks only see 2 AZs, so count the AZs the stack really gets): 3 × $0.045 × 730 = $98.55/month per dev/preview stack before any data, plus 3 Elastic IPs (3 × $3.65).
- **Detect:** Terraform `aws_nat_gateway` with `count = length(var.azs)` / `for_each` over subnets in a dev/staging workspace or tfvars; CDK `new ec2.Vpc(` without `natGateways` (default = one per AZ) or `natGateways: 3`; SST `new sst.aws.Vpc(` with `nat: "managed"` in every stage; `aws_nat_gateway` with `availability_mode = "regional"` (billed per AZ, see COST-010).
- **Fix:** Parametrize the count by stage.
  ```ts
  // CDK
  new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: isProd ? 2 : 1 });
  // SST
  new sst.aws.Vpc("Vpc", { nat: $app.stage === "production" ? "managed" : "ec2" });
  ```
- **Volatile:** yes
- **Source:** https://aws.amazon.com/vpc/pricing/ ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Vpc.html ; https://sst.dev/docs/component/aws/vpc
- **Last verified:** 2026-10-12

### COST-002 — Route S3 and DynamoDB through gateway endpoints, not the NAT
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A VPC whose private workloads call S3 or DynamoDB has gateway endpoints for both, associated with the private route tables.
- **Why:** Without them, every byte to S3/DynamoDB from a private subnet pays NAT processing ($0.045/GB). A worker pulling 2 TB/month of S3 objects pays 2,048 × $0.045 = $92.16/month for nothing; gateway endpoints cost $0.
- **Detect:** `aws_nat_gateway` present and no `aws_vpc_endpoint` with `service_name` ending `.s3` / `.dynamodb` (Terraform default `vpc_endpoint_type` is `Gateway`); CDK `ec2.Vpc` without `gatewayEndpoints` or `addGatewayEndpoint`; code in private-subnet compute importing `@aws-sdk/client-s3`, `@aws-sdk/client-dynamodb`, `github.com/aws/aws-sdk-go-v2/service/s3` or `.../dynamodb`.
- **Fix:**
  ```hcl
  resource "aws_vpc_endpoint" "s3" {
    vpc_id            = aws_vpc.main.id
    service_name      = "com.amazonaws.${var.region}.s3"
    vpc_endpoint_type = "Gateway"
    route_table_ids   = aws_route_table.private[*].id
  }
  ```
  CDK: `gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 }, Dynamo: { service: ec2.GatewayVpcEndpointAwsService.DYNAMODB } }`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html ; https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html
- **Last verified:** 2026-10-12

### COST-003 — Justify every interface endpoint against its per-AZ hourly charge
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Add an interface endpoint when its traffic would otherwise cost more through the NAT, or for a security requirement; do not add a blanket list of endpoints to every small VPC.
- **Why:** Each interface endpoint bills per AZ: 10 endpoints × 3 AZs × $0.01 × 730 = $219/month, which beats NAT processing only above ~6.2 TB/month across those services ($219 ÷ ($0.045 − $0.01)/GB). Below that the endpoints cost more than the NAT they bypass.
- **Detect:** Many `aws_vpc_endpoint` with `vpc_endpoint_type = "Interface"` and `subnet_ids` spanning all AZs; CDK `vpc.addInterfaceEndpoint(` in a loop or `new ec2.InterfaceVpcEndpoint(` for low-traffic services (SSM, ECR, Logs, STS) in dev stacks.
- **Fix:** Keep endpoints for high-volume services (e.g. ECR + Logs for large Fargate fleets), place them in fewer AZs in non-prod (`subnets: { availabilityZones: [...] }`), and rely on the NAT for the rest. State the breakeven in the PR.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/privatelink/pricing/ ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### COST-004 — Keep Lambda out of a VPC unless it reaches private resources
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Attach a function to a VPC only when it must reach a private resource (RDS, ElastiCache, internal ALB); functions that only call AWS APIs or the internet run outside the VPC.
- **Why:** A VPC-attached function has no internet path, so it needs a NAT (hourly + per-GB) or interface endpoints for every AWS API it calls. Teams add the VPC "for security" and then pay ~$33–$99/month in NAT per stage plus per-GB processing.
- **Detect:** `aws_lambda_function` with `vpc_config { ... }` whose code only imports SQS/SNS/S3/DynamoDB/HTTP clients; CDK `new lambda.Function(` / `NodejsFunction` with `vpc:`; SST `sst.aws.Function` with `vpc:` and no linked `Postgres`/`Aurora`/`Redis`.
- **Fix:** Remove `vpc_config` / `vpc` from functions that do not open a socket to a private address. Keep it only on the function that talks to the database.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### COST-005 — Keep NAT-bound traffic in the NAT's AZ
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Each private subnet routes to a NAT gateway in its own AZ, or the high-volume workloads sit in the AZ of the single NAT.
- **Why:** Traffic from AZ b to a NAT in AZ a pays cross-AZ transfer ($0.01/GB each direction) on top of NAT processing. A single shared route table pointing every AZ at one NAT is common in hand-written Terraform.
- **Detect:** One `aws_route_table` with `nat_gateway_id = aws_nat_gateway.main.id` associated (`aws_route_table_association`) with private subnets in several AZs, combined with high-volume compute (ECS services, batch) spread across those AZs.
- **Fix:** In production create one NAT per AZ with a route table per AZ; in non-prod accept the cross-AZ cost or pin bulk workers to the NAT's AZ. Show both numbers.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html
- **Last verified:** 2026-10-12

### COST-006 — Release idle Elastic IPs and stop handing out public IPv4 by default
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every public IPv4 address (Elastic IP, auto-assigned, or on a Fargate task ENI) must be needed; unattached EIPs are deleted.
- **Why:** Public IPv4 costs $0.005/h in use or idle: $3.65/month each. 40 Fargate tasks with `assignPublicIp: true` = $146/month; an EIP left over from a deleted instance keeps billing forever.
- **Detect:** `aws_eip` without `instance`/`network_interface` and not referenced by a NAT; `map_public_ip_on_launch = true` on subnets used by fleets; `aws_ecs_service` `network_configuration { assign_public_ip = true }`; CDK `assignPublicIp: true`, `associatePublicIpAddress: true`, `subnetType: ec2.SubnetType.PUBLIC` for tasks.
- **Fix:** Put tasks and instances in private subnets behind a load balancer; delete orphan `aws_eip`. When many tasks need only outbound internet, compare N × $3.65 with one NAT ($32.85 + $0.045/GB) and pick the cheaper.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### COST-007 — Serve public downloads through CloudFront, not straight from S3/ALB/EC2
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Buckets or services that serve meaningful public egress (assets, downloads, media) sit behind CloudFront.
- **Why:** Transfer from AWS origins to CloudFront is free, CloudFront egress is cheaper per GB than regional internet egress (US: first 1 TB/month free, then $0.085/GB vs $0.09/GB from EC2/S3 after the 100 GB free allowance), and cache hits cut origin requests. Flat-rate CloudFront plans (Free/$15/$200/$1,000 per month) can cap the bill for small sites.
- **Detect:** `aws_s3_bucket_website_configuration` / public-read bucket policy with no `aws_cloudfront_distribution`; CDK `s3.Bucket({ publicReadAccess: true, websiteIndexDocument })` without `cloudfront.Distribution`; presigned GET URLs for large public media generated in code (`getSignedUrl(` with `GetObjectCommand`) for anonymous traffic.
- **Fix:** Put a `cloudfront.Distribution` with `S3BucketOrigin.withOriginAccessControl(bucket)` in front, block public bucket access, and compare pay-as-you-go vs a flat-rate plan for the expected traffic. SST `sst.aws.StaticSite` / `sst.aws.Router` already provision CloudFront.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/cloudfront/pricing/ ; https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/ ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### COST-008 — Call AWS services in the same Region as the caller
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go, Terraform, CDK
- **Rule:** SDK clients target the Region where the data lives and the caller runs; cross-Region reads in a hot path are deliberate and documented.
- **Why:** Inter-Region transfer is billed per GB on both sides of a chatty path, and a hard-coded `us-east-1` in a client used by a function deployed in `eu-west-1` silently adds transfer and latency to every call.
- **Detect:** TS `new S3Client({ region: "us-east-1" })` (literal) in code deployed to other Regions; Go `config.LoadDefaultConfig(ctx, config.WithRegion("us-east-1"))`; Terraform `provider "aws" { alias = ... region = ... }` used for buckets/tables read by compute in another Region; S3 cross-Region replication (`aws_s3_bucket_replication_configuration`) with no stated need.
- **Fix:** Let the SDK pick the Region from the environment (`AWS_REGION` is set in Lambda/ECS) or pass it from config; co-locate data and compute; replicate only for DR or latency with the cost stated.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/ec2/pricing/on-demand/ ; https://aws.amazon.com/s3/pricing/
- **Last verified:** 2026-10-12

### COST-009 — Avoid gratuitous cross-AZ chatter
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** High-volume service-to-service traffic (cache, broker, database replicas, service mesh) prefers same-AZ paths where the design allows.
- **Why:** Cross-AZ transfer is $0.01/GB in each direction ($0.02/GB round trip). 50 TB/month of cache reads across AZs is ~$1,024/month.
- **Detect:** ElastiCache/MSK/self-managed brokers with consumers spread across 3 AZs and no AZ-aware client config; `aws_lb` with `enable_cross_zone_load_balancing = true` on NLBs carrying bulk traffic; Kafka clients without `client.rack`.
- **Fix:** Use AZ-aware routing (Kafka rack awareness, reader endpoints per AZ, topology-aware routing in EKS) for bulk flows; keep cross-AZ for availability, not by accident. Hand off topology to `aws-networking`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/blogs/architecture/exploring-data-transfer-costs-for-aws-managed-databases/ ; https://aws.amazon.com/blogs/networking-and-content-delivery/exploring-data-transfer-costs-for-aws-network-load-balancers/
- **Last verified:** 2026-10-12

### COST-010 — Do not expect a regional NAT gateway to cut the hourly bill
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform
- **Rule:** A regional NAT gateway is chosen for operational simplicity; its cost is still per active AZ.
- **Why:** Regional NAT bills $0.045/h per AZ it expands into, so three AZs cost $0.135/h ($98.55/month), the same as three zonal NATs. PRs that switch "to save money" save nothing.
- **Detect:** `aws_nat_gateway` with `availability_mode = "regional"` and a PR/commit message claiming savings; no `availability_zone_address` blocks (auto mode expands to every AZ with an ENI).
- **Fix:** If the goal is cost, limit AZs (manual mode with `availability_zone_address` for only the AZs needed) or use a single zonal NAT in non-prod.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/vpc/pricing/ ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/nat_gateway
- **Last verified:** 2026-10-12

### COST-011 — Use a NAT instance for low-throughput non-prod
- **Severity:** low
- **Category:** cost
- **Applies to:** CDK, SST, Terraform
- **Rule:** Dev, preview and sandbox stages with light outbound traffic may use a small NAT instance instead of a managed NAT gateway.
- **Why:** SST documents a managed NAT for its default two AZs at a minimum of $0.045 × 2 × 24 × 30 ≈ $65/month versus $0.0042 × 2 × 24 × 30 ≈ $6/month for its `ec2` NAT instances (about 10× cheaper). Per-stage preview environments multiply the gap.
- **Detect:** SST `sst.aws.Vpc` with `nat: "managed"` in non-production stages; CDK `natGatewayProvider` unset (default `NatProvider.gateway()`) in dev stacks.
- **Fix:** SST `nat: "ec2"`; CDK `natGatewayProvider: ec2.NatProvider.instanceV2({ instanceType: new ec2.InstanceType("t4g.nano") })`. Note the trade-off (single instance, you patch it) for `aws-networking`.
- **Volatile:** yes
- **Source:** https://sst.dev/docs/component/aws/vpc ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.NatProvider.html
- **Last verified:** 2026-10-12

### COST-012 — Compress what CloudFront and APIs send
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, TypeScript
- **Rule:** CloudFront cache behaviours compress text responses, and JSON-heavy APIs return compressed payloads.
- **Why:** Egress is billed per GB; text assets typically shrink several-fold when compressed, cutting the egress line proportionally.
- **Detect:** Terraform `aws_cloudfront_distribution` `default_cache_behavior { compress = false }` (or omitted, default false in Terraform); CDK `compress: false` on a behavior (CDK default is true).
- **Fix:** `compress = true` in each cache behaviour, with a cache policy that enables Gzip and Brotli.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html
- **Last verified:** 2026-10-12

### COST-013 — Pull container images through endpoints or caches when fleets are large
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Large or frequently scaling Fargate/ECS fleets in private subnets pull images from ECR via the S3 gateway endpoint plus ECR interface endpoints, or keep images small.
- **Why:** Every task start downloads the image; through a NAT every GB pays $0.045. 1,000 task starts/day × 0.5 GB × 30 days = 15,000 GB/month × $0.045 = $675/month in NAT processing alone.
- **Detect:** `aws_ecs_service` / `FargateService` in private subnets with autoscaling and no `com.amazonaws.<region>.ecr.dkr` / `ecr.api` interface endpoints and no S3 gateway endpoint (ECR layers are served from S3).
- **Fix:** Add the S3 gateway endpoint (free) plus `ecr.api` and `ecr.dkr` interface endpoints when COST-003's breakeven is met; slim images.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html ; https://aws.amazon.com/vpc/pricing/
- **Last verified:** 2026-10-12

### COST-078 — Share load balancers across non-production services
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Dev, preview and staging stages route several services through one shared ALB (host- or path-based listener rules) instead of one load balancer per service per stage; idle load balancers are deleted.
- **Why:** Each ALB bills $0.0225/h whether or not it serves traffic: 8 services × 3 non-prod stages × $0.0225 × 730 = $394.20/month in hourly charges alone, before LCUs. Sharing one ALB per stage cuts that to 3 × $16.43 = $49.28/month. SST notes a load balancer adds ~$16/month to every `sst.aws.Service` that has one.
- **Detect:** Terraform `aws_lb` (`load_balancer_type = "application"` or unset) inside a per-service module instantiated for every service and stage; CDK `ecsPatterns.ApplicationLoadBalancedFargateService` / `new elbv2.ApplicationLoadBalancer(` per service in dev stacks; SST several `sst.aws.Service` with their own `loadBalancer` in non-prod stages (internal services can often use `serviceRegistry`/Cloud Map or a shared `sst.aws.Router`); `aws_lb` with no listener rules or targets.
- **Fix:** Create one ALB per stage and attach each service as a target group behind `aws_lb_listener_rule` / `listener.addTargets(...)` with `conditions: [elbv2.ListenerCondition.pathPatterns([...])]` or host headers; keep dedicated ALBs only where isolation or quotas require it. Show the before/after hourly arithmetic.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/elasticloadbalancing/pricing/ ; https://sst.dev/docs/component/aws/service
- **Last verified:** 2026-10-12
