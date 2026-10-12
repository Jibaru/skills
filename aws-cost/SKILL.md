---
name: aws-cost
description: Review AWS code, IaC and diffs (Terraform, CDK, SST, TypeScript and Go SDK code) for money leaks — NAT gateways and data transfer, log ingestion and infinite retention, high-cardinality metrics, x86 vs Graviton, Lambda memory, Fargate and EC2 Spot, shared load balancers, DynamoDB billing mode, S3 lifecycle, gp2 volumes, public IPv4, idle Aurora, Secrets Manager and KMS request costs, REST vs HTTP APIs, Standard vs Express workflows, tags and budgets — with the savings arithmetic. Use when the user asks "how can I cut my AWS bill", "why is my AWS bill so high", "is this NAT/VPC setup expensive", "review the cost of this stack", "revisa el costo de mi infra", or when aws-review dispatches it.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-cost

FinOps reviewer for the AWS review kit. It reads files, diffs and `terraform plan` / `cdk diff`
/ `sst diff` output and reports where money leaks, with the arithmetic of what each fix saves.
It reviews statically: it never calls an AWS account, and it only reports. Fixes are applied
only if the user asks afterwards.

## Scope

Covers the cost side of every service: hourly resources (NAT, endpoints, public IPv4, Aurora,
EKS), per-GB charges (data processing, transfer, log ingestion), per-request charges (KMS,
Secrets Manager, API Gateway, Step Functions, S3, CloudWatch APIs), storage classes and
lifecycle, commitment and governance (tags, budgets, anomaly detection, Savings Plans).

Hand off what is not about money, in one line per finding:

- Correctness, timeouts, concurrency of Lambda/ECS/EC2 → `aws-compute`
- DynamoDB/RDS data modelling and query design → `aws-data`
- S3/CloudFront behaviour and durability → `aws-storage`
- SQS/SNS/EventBridge/Kinesis/Step Functions semantics → `aws-messaging`
- Routing, subnets, load balancers, DNS → `aws-networking`
- Tool idioms, state, drift, module layout → `aws-iac`
- IAM, encryption choices, exposure → `aws-security`
- What to log, alarm and trace → `aws-observability` (this skill only judges what logging costs)

## Signals

This expert applies whenever any AWS resource or SDK call is in scope. Strongest signals:

- Files: `**/*.tf`, `**/*.tfvars`, `**/*.tfplan.json`, `cdk.json`, `bin/*.ts`, `lib/**/*.ts`,
  `sst.config.ts`, `infra/**/*.ts`, `cdk diff` / `sst diff` / `terraform plan` output.
- Hourly resources: `aws_nat_gateway`, `natGateways`, `nat: "managed"`, `aws_vpc_endpoint`
  (`vpc_endpoint_type = "Interface"`), `InterfaceVpcEndpoint`, `aws_eip`,
  `assign_public_ip`, `assignPublicIp`, `map_public_ip_on_launch`, `aws_rds_cluster`,
  `serverlessv2_scaling_configuration`, `sst.aws.Aurora`, `sst.aws.Postgres`, `aws_eks_cluster`,
  `provisioned_concurrent_executions`, `provisionedConcurrentExecutions`, `aws_lb`,
  `ApplicationLoadBalancer`, `ApplicationLoadBalancedFargateService`, `loadBalancer`,
  `aws_kinesis_stream`, `stream_mode_details`, `kinesis.Stream`.
- Per-GB / per-request: `aws_cloudwatch_log_group`, `retention_in_days`, `logRetention`,
  `logGroup`, `logging_config`, `aws_flow_log`, `aws_cloudtrail`, `PutMetricData`,
  `PutMetricDataCommand`, `aws_api_gateway_rest_api`, `RestApi`, `LambdaRestApi`,
  `sst.aws.ApiGatewayV1`, `aws_sfn_state_machine`, `StateMachine`, `GetSecretValue`,
  `GetSecretValueCommand`, `kms.Decrypt`, `DecryptCommand`, `GenerateDataKey`.
- Capacity and storage: `aws_lambda_function`, `lambda.Function`, `NodejsFunction`,
  `sst.aws.Function`, `architectures`, `architecture`, `memory_size`, `memorySize`,
  `aws_ecs_service`, `FargateService`, `sst.aws.Service`, `capacity_provider_strategy`,
  `aws_autoscaling_group`, `mixed_instances_policy`, `aws_eks_node_group`, `capacity_type`,
  `AutoScalingGroup`, `addNodegroupCapacity`, `instance_type`,
  `aws_dynamodb_table`, `billing_mode`, `TableV2`, `sst.aws.Dynamo`, `aws_s3_bucket`,
  `aws_s3_bucket_lifecycle_configuration`, `aws_ebs_volume`, `gp2`, `aws_ecr_repository`.
- Governance: `default_tags`, `Tags.of(`, `defaultTags`, `aws_budgets_budget`,
  `aws_ce_anomaly_monitor`, `aws_ce_cost_allocation_tag`, `RemovalPolicy`, `removal:`.
- SDK imports: `@aws-sdk/client-cloudwatch`, `@aws-sdk/client-cloudwatch-logs`,
  `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-kms`, `@aws-sdk/client-s3`,
  `@aws-sdk/client-sfn`, `@aws-sdk/client-lambda`, `github.com/aws/aws-sdk-go-v2/service/cloudwatch`,
  `.../service/secretsmanager`, `.../service/kms`, `.../service/s3`, `.../service/lambda`.

## Procedure

1. **Collect the inputs.** Use the files you were given; otherwise find them with the Signals.
   When reviewing a change, start from the diff, then read the surrounding IaC and the handlers
   it wires into (a NAT gateway is only a leak once you know what traffic crosses it). Done
   when you can name, for each billable resource in scope, which environment it runs in and
   what calls it.
2. **Open only the references that match.** Use the index below; skip topics with nothing in
   scope.
3. **Apply the rules.** Check every rule of each opened reference against the inputs. Also hunt
   for leaks no rule names (mark them `NEW`), using the arithmetic method below.
4. **Verify every finding** against the actual code before reporting it: trace the resource to
   its environment, its caller and its volume. A cost finding needs a concrete driver in the
   files (a count, a schedule, a call inside a per-request path, a missing attribute). Drop it
   if you cannot point at one.
5. **Staleness.** Every rule carries `Last verified`. If a rule you used was last verified more
   than 120 days before today, add "reference is stale, run /aws-refresh" to the report, and for
   `Volatile: yes` rules confirm the number live before quoting it: the AWS Knowledge or AWS
   Documentation MCP if connected, otherwise WebFetch the rule's Source URL. Prices on pricing
   pages change without notice; quote the price you confirmed, with its region.

## Savings arithmetic

Every cost finding shows its math, so the reader can redo it with their own volumes:

- State the region and the unit price with a link to the pricing page, e.g. "NAT gateway
  $0.045/h + $0.045/GB processed, us-east-1 ([pricing](https://aws.amazon.com/vpc/pricing/))".
- Monthly = hourly × 730. Per-request = (requests per month ÷ 1,000,000) × price per million.
- Take volumes from the files (counts, AZs, memory, schedules). When the volume is unknown,
  state the assumption explicitly ("assuming 50 GB/month through the NAT") and show the formula.
- Show before, after and delta. Example: 3 NAT gateways in dev → 1: (3 − 1) × $0.045 × 730 =
  **$65.70/month** saved, plus 2 public IPv4 × $0.005 × 730 = $7.30.
- Round to cents; never present an estimate as a quote.

## Output format

Each finding in the review output:

- **[<severity>] <ID or NEW> — <title>** (category)
- Evidence: `path/to/file:line` (+ quoted snippet)
- Scenario: concrete inputs/state → what goes wrong (or what it costs, with arithmetic and a link to the pricing page when it is cost)
- Fix: concrete change
- Source: <link>

Findings without concrete evidence in the reviewed files are dropped. Rank most severe first
(at equal severity, larger monthly savings first). The reviewer only reports; it applies fixes
only if the user asks afterwards. Write the report in the language of the conversation.

## References

| File | Covers |
| --- | --- |
| [networking-data-transfer.md](references/networking-data-transfer.md) | NAT gateways, gateway vs interface endpoints, VPC Lambda, cross-AZ and inter-Region transfer, internet egress via CloudFront, public IPv4, shared load balancers (COST-001–013, COST-078) |
| [logging-metrics.md](references/logging-metrics.md) | Log retention, log level and payload logging, log classes, Lambda log delivery, custom metric cardinality, PutMetricData, Flow Logs, CloudTrail, API Gateway execution logs (COST-014–025) |
| [compute.md](references/compute.md) | Graviton/arm64, Lambda memory tuning, idle waits, Lambda-to-Lambda, provisioned concurrency, Fargate Spot and ARM, EC2 Spot, scaling, EKS extended support, timeouts (COST-026–037, COST-077) |
| [databases.md](references/databases.md) | DynamoDB on-demand vs provisioned breakeven, autoscaling, Standard-IA, TTL, GSI projections, Scan, Aurora min ACU and auto-pause, RDS Extended Support, Multi-AZ in dev, gp3, I/O-Optimized, RDS Proxy (COST-038–049) |
| [storage.md](references/storage.md) | S3 lifecycle, incomplete multipart uploads, noncurrent versions, Intelligent-Tiering, small-object transitions, request-heavy patterns, gp2→gp3, orphaned EBS and snapshots, ECR lifecycle (COST-050–058) |
| [managed-services.md](references/managed-services.md) | API Gateway REST vs HTTP and caching, Step Functions Standard vs Express and polling loops, Secrets Manager caching and per-secret cost, Parameter Store, KMS keys, data keys and S3 Bucket Keys, SQS long polling, Kinesis on-demand vs provisioned (COST-059–069, COST-079) |
| [governance.md](references/governance.md) | Cost allocation tags and activation, Budgets, Cost Anomaly Detection, Savings Plans (Compute, EC2 Instance, Database), removable ephemeral stages, monthly delta in plan/diff review (COST-070–076) |
| [sources.md](references/sources.md) | Every official URL used, grouped by topic, with Last verified dates |
