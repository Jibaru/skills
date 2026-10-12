# Sources

Every official URL the networking rules cite, grouped by topic. All Last verified 2026-10-12.
When a link moves, search the title on the same domain and update the rule's **Source** line too.

## Pricing

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://aws.amazon.com/vpc/pricing/ | NAT Gateway $0.045/h + $0.045/GB (regional: per AZ), public IPv4 $0.005/h, gateway endpoints free | 2026-10-12 |
| https://aws.amazon.com/privatelink/pricing/ | Interface endpoint $0.01/h per AZ + $0.01/GB | 2026-10-12 |
| https://aws.amazon.com/elasticloadbalancing/pricing/ | ALB/NLB $0.0225/h, $0.008/LCU-h, $0.006/NLCU-h, public IPv4 billed separately | 2026-10-12 |
| https://aws.amazon.com/api-gateway/pricing/ | HTTP API $1.00/M (512 KB metering), REST $3.50/M, hourly cache pricing | 2026-10-12 |
| https://aws.amazon.com/route53/pricing/ | Query, alias (free to AWS targets) and health check prices | 2026-10-12 |
| https://aws.amazon.com/ec2/pricing/on-demand/ | Data transfer section (inter-AZ, internet egress, 100 GB free) | 2026-10-12 |
| https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights/ | Public IPv4 charge since 2024-02-01 | 2026-10-12 |
| https://aws.amazon.com/blogs/networking-and-content-delivery/optimizing-data-transfer-costs-when-using-aws-network-load-balancer/ | Inter-AZ $0.01/GB each direction; NLB cross-zone traffic is billed | 2026-10-12 |

## VPC, endpoints, security groups, NACLs, IPv6

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html | Gateway endpoints for S3/DynamoDB, no charge, route-table association, Regional prefix lists (other-Region traffic bypasses them) | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html | Interface endpoint SG must allow inbound HTTPS; default SG used when none given | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html | ECR needs ecr.api + ecr.dkr + S3 gateway (+ logs); endpoint SG must allow 443 | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html | Fargate image pull needs public IP, NAT or endpoints | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html | Interface endpoints: per-AZ billing, private DNS, multi-AZ recommendation | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-best-practices.html | Multi-AZ subnets, SGs, NACLs, flow logs | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html | Security group rule semantics, SG references | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/default-security-group.html | Default SG rules and recommendation not to use it | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html | NACL behaviour | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/nacl-ephemeral-ports.html | Stateless NACLs need ephemeral port rules | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html | Subnet sizing, 5 reserved addresses | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html | Egress-only IGW for IPv6, no charge of its own | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html | `enableDnsSupport` / `enableDnsHostnames` | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html | Lambda VPC attachment, Hyperplane ENIs, Inactive after 14 days, IPv6 dual-stack | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html | Internet access for VPC Lambda needs NAT; public subnet gives none | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html | Lambda 6 MB synchronous payload | 2026-10-12 |

## NAT

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html | Public vs private NAT, public NAT in public subnet | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html | One NAT per AZ for resilience, 55,000 connections per destination per IP, bandwidth | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html | Regional NAT: no public subnet, up to 60 min AZ expansion, 32 IPs/AZ, no private NAT | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html | Reduce NAT charges: same-AZ NAT, endpoints | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-troubleshooting.html | 350 s idle drop, port allocation errors | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-scenarios.html | Private subnet routing through NAT | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-nat64-dns64.html | NAT64/DNS64 | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/work-with-nat-instances.html | NAT instances and their limits | 2026-10-12 |

## Elastic Load Balancing

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/describe-ssl-policies.html | Default policy: console `TLS13-1-2-Res-PQ-2025-09`, API/CFN/CDK `2016-08`; recommended PQ policy | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html | ALB attributes and defaults, /27 subnets, IP address types | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html | Idle timeout 60 s (1–4000), app timeout must be larger, client keepalive, deletion protection, desync | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html | Deregistration delay 300 s, slow start, algorithms, cross-zone at target group | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html | Health check defaults (30 s / 5 s / 5 / 2 / 200), fail-open | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html | Listener configuration, redirects | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-update-security-groups.html | ALB security group rules | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html | 502/504 causes | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/x-forwarded-headers.html | X-Forwarded-For append/preserve/remove | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html | Lambda targets: 1 MB request/response | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html | Cross-zone defaults per LB type, schemes, DNS TTL 60 s | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-security-groups.html | NLB security groups only at creation | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/network/update-idle-timeout.html | NLB TCP idle timeout 350 s (60–6000), TLS fixed 350 s, match target conntrack (ELB-019) | 2026-10-12 |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/network/edit-target-group-attributes.html | NLB target group attributes, client IP preservation | 2026-10-12 |
| https://aws.amazon.com/builders-library/implementing-health-checks/ | Shallow vs deep health checks, fail-open | 2026-10-12 |

## API Gateway

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html | Feature matrix REST vs HTTP | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html | Account throttle 10,000 rps / 5,000 burst | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html | REST: 29 s integration timeout (raisable for Regional/private, may lower throttle quota; no max stated), 10 MB payload, cache TTL | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html | HTTP API: 30 s max integration timeout, 10 MB payload | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html | REST response streaming, up to 15 min; idle timeout 5 min Regional/private, 30 s edge | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html | REST throttling levels | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html | HTTP API stage/route throttling | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html | REST authorizer caching and cache keys | 2026-10-12 |
| https://repost.aws/knowledge-center/api-gateway-lambda-authorization-errors | 403s with cached authorizer policies; wildcard resource fix | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html | HTTP API authorizer caching across routes, `$context.routeKey`, identity sources → 401 | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html | Native JWT authorizers | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html | Cache keys, hourly billing, invalidation authorization | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html | HTTP API CORS, backend headers ignored, `$default` + authorizer preflight | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html | REST CORS | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-endpoint-types.html | Edge-optimized vs Regional vs private | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-disable-default-endpoint.html | Disable execute-api endpoint (REST) | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html | Disable execute-api endpoint (HTTP) | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html | API keys are not authorization; usage plans best-effort | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services.html | First-class AWS service integrations (SQS, EventBridge, Step Functions…) | 2026-10-12 |

## Route 53

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html | Alias vs CNAME: apex, pricing, TTL | 2026-10-12 |
| https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-complex-configs.html | Missing health checks treated healthy; evaluate target health | 2026-10-12 |
| https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-how-to.html | Failover setup tasks | 2026-10-12 |
| https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-private-hosted-zones.html | Failover in private zones via CloudWatch-alarm checks | 2026-10-12 |
| https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/welcome-health-checks.html | Health check types | 2026-10-12 |
| https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/health-checks-creating-values.html | Health check options (interval, features) | 2026-10-12 |
| https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zone-private-considerations.html | Private hosted zone association and DNS settings | 2026-10-12 |
| https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/protection-from-dangling-dns.html | Dangling delegation protection | 2026-10-12 |
| https://aws.amazon.com/blogs/security/threat-tactic-spotlight-subdomain-takeover/ | Subdomain takeover via dangling CNAMEs | 2026-10-12 |
| https://aws.amazon.com/blogs/networking-and-content-delivery/dns-best-practices-for-amazon-route-53/ | TTL guidance 60–300 s for endpoints | 2026-10-12 |

## IaC references

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/nat_gateway | `availability_mode`, `vpc_id`, `availability_zone_address`, `secondary_allocation_ids` (provider v6.x) | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_endpoint | `vpc_endpoint_type` default Gateway, `private_dns_enabled` default false | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group | Avoid inline rules; never mix with rule resources | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_ingress_rule | Current best-practice rule resource | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route | `nat_gateway_id`, `egress_only_gateway_id` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function | `vpc_config.ipv6_allowed_for_dual_stack` default false | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_listener | `ssl_policy` (examples use 2016-08) | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_target_group | `deregistration_delay` 300, health check defaults (healthy/unhealthy threshold 3 as documented) | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_integration | `timeout_milliseconds` (max 300,000 BUFFERED / 900,000 STREAM), `response_transfer_mode` |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_deployment | `triggers` for redeployment, `create_before_destroy` |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_settings | `require_authorization_for_cache_control`, `unauthorized_cache_control_header_strategy`, throttling defaults | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_authorizer | `authorizer_result_ttl_in_seconds` default 300 | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record | Alias TTL not settable; `ttl` conflicts with `alias` | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Vpc.html | `maxAzs` 3, `natGateways` one per AZ, `restrictDefaultSecurityGroup`, `NatProvider.regionalGateway()` | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_elasticloadbalancingv2.ApplicationListener.html | `sslPolicy` default, `open` default true |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_elasticloadbalancingv2.SslPolicy.html | `RECOMMENDED` = 2016-08, `RECOMMENDED_TLS`, `TLS13_12_RES_PQ`, `TLS13_12_PQ` |
| https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/cx-api/FEATURE_FLAGS.md | `@aws-cdk/aws-elasticloadbalancingv2:usePostQuantumTlsPolicy` (since 2.245.0) sets `ELBSecurityPolicy-TLS13-1-2-PQ-2025-09` | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway.RestApi.html | `endpointTypes` default EDGE, `deployOptions` | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2.HttpApi.html | `corsPreflight`, stage `throttle` | 2026-10-12 |
| https://sst.dev/docs/component/aws/vpc/ | `az` default 2, `nat` disabled by default, `managed`/`ec2` | 2026-10-12 |
| https://sst.dev/docs/component/aws/apigatewayv2/ | `cors` default true (`allowOrigins: ["*"]`), Lambda authorizer TTL not cached by default, `transform.stage` | 2026-10-12 |
| https://sst.dev/docs/component/aws/function/ | `vpc`, `link`, timeout default 20 s | 2026-10-12 |
