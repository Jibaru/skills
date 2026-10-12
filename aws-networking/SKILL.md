---
name: aws-networking
description: Review AWS networking in code, IaC and diffs — VPC layout, subnets and AZ spread, NAT Gateway cost and placement (per-AZ, single, regional, NAT instance), gateway vs interface VPC endpoints, Lambda in a VPC, security groups and NACLs, public IPv4 charges, IPv6, cross-AZ data transfer, ALB/NLB listeners, TLS policies, health checks, idle timeouts and deregistration, API Gateway (HTTP vs REST API, throttling, caching, 29-second timeout, authorizer caching, CORS, payload limits) and Route 53 (alias vs CNAME, health checks, failover, TTLs), in Terraform, CDK, SST, TypeScript (SDK v3) and Go (SDK v2). Use when the user asks "review my VPC", "why is my NAT Gateway bill so high", "do I need a NAT here", "is this ALB set up right", "HTTP API or REST API", "my API Gateway times out at 29 seconds", "random 502s behind the load balancer", "check my Route 53 records", or when aws-review dispatches it.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-networking

Static networking reviewer for AWS workloads. It reads files, diffs and `terraform plan` /
`cdk diff` / `sst diff` output; it never calls an AWS account. It reports findings and edits
nothing until the user asks for fixes.

## Covers / hands off

Covers: VPC and subnet layout, route tables, NAT (zonal, regional, instances), VPC endpoints,
Lambda VPC attachment, security groups, NACLs, public IPv4 and IPv6, cross-AZ traffic; ALB and
NLB (listeners, TLS policies, target groups, health checks, timeouts, cross-zone); API Gateway
REST, HTTP and their stages, authorizers, caching, CORS and limits; Route 53 records, routing
policies, health checks and TTLs; and the app-code side of these (server keep-alive behind a
load balancer, Lambda authorizer responses, client IP handling).

Hands off (one line, then move on):

- Lambda/ECS sizing, runtimes, concurrency, cold starts → `aws-compute`.
- IAM policies, secrets, KMS, WAF rule content, account-wide exposure baseline → `aws-security`.
- CloudFront and S3 settings → `aws-storage`. Database and cache design → `aws-data`.
- Queues, topics, Step Functions semantics → `aws-messaging`.
- State, modules, drift, tool-level IaC style → `aws-iac`.
- Bills outside networking → `aws-cost`. Access logs, flow logs, alarms → `aws-observability`.

## Signals

This expert applies when any of these appear (aws-review routes on this section):

- **Files**: `*.tf`, `*.tfvars`, `*.tfplan.json`, `cdk.json`, `lib/**/*.ts` or `bin/**/*.ts`
  importing `aws-cdk-lib`, `sst.config.ts`, `*.go` running `http.Server` or importing
  `github.com/aws/aws-lambda-go/events`, `*.ts` handling `APIGatewayProxyEvent*`,
  `APIGatewayRequestAuthorizerEvent*`, `APIGatewayTokenAuthorizerEvent` or creating `http.createServer`/`express()`/`fastify(`.
- **VPC / NAT / endpoints (Terraform)**: `aws_vpc`, `aws_subnet`, `aws_route_table`, `aws_route`,
  `aws_nat_gateway`, `availability_mode`, `aws_eip`, `aws_internet_gateway`,
  `aws_egress_only_internet_gateway`, `aws_vpc_endpoint`, `vpc_endpoint_type`,
  `private_dns_enabled`, `aws_security_group`, `aws_vpc_security_group_ingress_rule`,
  `aws_vpc_security_group_egress_rule`, `aws_security_group_rule`, `aws_default_security_group`,
  `aws_network_acl`, `map_public_ip_on_launch`, `associate_public_ip_address`, `assign_public_ip`,
  `vpc_config`, `ipv6_allowed_for_dual_stack`, `aws_ecs_service` `network_configuration`, `module "vpc"`, `single_nat_gateway`, `one_nat_gateway_per_az`.
- **VPC / NAT / endpoints (CDK, SST)**: `new ec2.Vpc`, `ec2.Vpc.fromLookup`, `natGateways`,
  `NatProvider.`, `maxAzs`, `subnetConfiguration`, `SubnetType.`, `gatewayEndpoints`,
  `addGatewayEndpoint`, `addInterfaceEndpoint`, `InterfaceVpcEndpointAwsService`,
  `ec2.SecurityGroup`, `addIngressRule`, `Peer.anyIpv4`, `connections.allowFrom`,
  `allowAllOutbound`, `restrictDefaultSecurityGroup`, `vpc:` / `vpcSubnets:` on `lambda.Function`;
  `sst.aws.Vpc`, `nat:`, `bastion:`, `vpc:` on `sst.aws.Function`, `aws.ec2.VpcEndpoint`.
- **Load balancers**: `aws_lb`, `aws_alb`, `load_balancer_type`, `aws_lb_listener`, `ssl_policy`,
  `aws_lb_listener_rule`, `aws_lb_target_group`, `health_check`, `deregistration_delay`,
  `idle_timeout`, `tcp.idle_timeout.seconds`, `enable_cross_zone_load_balancing`, `load_balancing_cross_zone_enabled`,
  `drop_invalid_header_fields`; CDK `ApplicationLoadBalancer`, `NetworkLoadBalancer`,
  `addListener`, `sslPolicy`, `SslPolicy.`, `addTargets`, `healthCheck`, `deregistrationDelay`,
  `idleTimeout`, `crossZoneEnabled`, `ApplicationLoadBalancedFargateService`; SST
  `sst.aws.Service` with `loadBalancer:`; app code `keepAliveTimeout`, `IdleTimeout`, `X-Forwarded-For`.
- **API Gateway**: `aws_api_gateway_rest_api`, `aws_api_gateway_integration`,
  `timeout_milliseconds`, `response_transfer_mode`, `aws_api_gateway_method_settings`,
  `aws_api_gateway_stage`, `aws_api_gateway_deployment`, `triggers`, `cache_cluster_enabled`, `aws_api_gateway_authorizer`,
  `authorizer_result_ttl_in_seconds`, `aws_api_gateway_usage_plan`, `aws_apigatewayv2_api`,
  `cors_configuration`, `aws_apigatewayv2_stage`, `default_route_settings`,
  `aws_apigatewayv2_authorizer`, `aws_apigatewayv2_integration`; CDK `apigateway.RestApi`,
  `LambdaRestApi`, `endpointTypes`, `deployOptions`, `TokenAuthorizer`, `RequestAuthorizer`,
  `resultsCacheTtl`, `apigwv2.HttpApi`, `corsPreflight`, `HttpLambdaAuthorizer`, `addStage`;
  SST `sst.aws.ApiGatewayV1`, `sst.aws.ApiGatewayV2`, `addAuthorizer`, `cors:`, `transform.stage`;
  handler code returning `policyDocument`, `methodArn`, `routeArn`, `isAuthorized`,
  `Access-Control-Allow-Origin`.
- **Route 53**: `aws_route53_record`, `alias {`, `evaluate_target_health`, `type = "CNAME"`,
  `failover_routing_policy`, `weighted_routing_policy`, `aws_route53_health_check`,
  `aws_route53_zone`, `aws_route53_zone_association`; CDK `route53.ARecord`, `CnameRecord`,
  `RecordTarget.fromAlias`, `LoadBalancerTarget`, `HealthCheck`; SST `dns:` / `sst.aws.dns`.

## Procedure

1. **Collect inputs.** Use the files you were given; when invoked directly with none, find them
   with the Signals. For a change, review the diff first, then read what it wires into: the
   route tables a subnet uses, the handler behind a route, the timeout of the Lambda behind an
   integration, the server code behind a target group. Done when you hold every file a finding
   could cite.
2. **Open only the relevant references** from the index below, chosen by what the files contain.
3. **Apply every rule** of each opened reference to the files, then look past the rules for
   other networking defects; report those with ID `NEW`.
4. **Verify each finding against the code.** Trace it: the subnet really routes to that NAT,
   the Lambda timeout really exceeds the integration timeout, the authorizer really caches, the
   record really has no health check. A default that you rely on (CDK, provider or service
   default) counts as evidence only when the property is absent at the cited line. Drop
   anything you cannot point to with `file:line`.
5. **Staleness.** Today minus 120 days is the cutoff. If a rule you used has an older
   **Last verified**, say "reference is stale, run /aws-refresh". For **Volatile: yes** rules,
   confirm the number or default live (AWS Knowledge / Documentation MCP if connected, otherwise
   WebFetch the rule's Source URL) before you report it.

For cost findings, show the arithmetic with hours per month = 730 and the price you confirmed,
e.g. `3 NAT × $0.045/h × 730 h = $98.55/month + $0.045/GB`.

## Output format

Each finding in the review output:

- **[<severity>] <ID or NEW> — <title>** (category)
- Evidence: `path/to/file:line` (+ quoted snippet)
- Scenario: concrete inputs/state → what goes wrong (or what it costs, with arithmetic and a link to the pricing page when it is cost)
- Fix: concrete change
- Source: <link>

Findings without concrete evidence in the reviewed files are dropped. Rank most severe first.
The reviewer only reports; it applies fixes only if the user asks afterwards. Write the report
in the language of the conversation.

## References

| File | Rules | Open when the files contain |
| --- | --- | --- |
| [references/vpc.md](references/vpc.md) | VPC-001 – VPC-020 | VPCs, subnets, endpoints, security groups, NACLs, public IPs, IPv6, Lambda `vpc` config, Fargate task subnets |
| [references/nat.md](references/nat.md) | NAT-001 – NAT-011 | NAT gateways or instances, `natGateways`, SST `nat:`, private-subnet routes, egress-heavy code |
| [references/elb.md](references/elb.md) | ELB-001 – ELB-019 | ALB/NLB, listeners, target groups, health checks, servers running behind a load balancer |
| [references/apigw.md](references/apigw.md) | APIGW-001 – APIGW-018 | REST/HTTP APIs, stages, authorizers (IaC and handler code), caching, CORS, integrations |
| [references/route53.md](references/route53.md) | R53-001 – R53-011 | Hosted zones, records, routing policies, health checks |
| [references/sources.md](references/sources.md) | — | A Source URL moved or a fact needs re-checking |
