# Sources

Every official URL the aws-cost rules cite, grouped by topic. All Last verified 2026-10-12.
Pricing pages are volatile: re-read them before quoting a number. If a link moves, search the
title on the same domain.

## Pricing pages

| URL | What it gives | Last verified |
| --- | --- | --- |
| https://aws.amazon.com/vpc/pricing/ | NAT gateway hourly and per-GB (zonal and regional per AZ), public IPv4 hourly | 2026-10-12 |
| https://aws.amazon.com/privatelink/pricing/ | Interface endpoint per-AZ hourly billing and per-GB tiers | 2026-10-12 |
| https://aws.amazon.com/ec2/pricing/on-demand/ | EC2 instance prices, data transfer section, 100 GB free egress | 2026-10-12 |
| https://aws.amazon.com/cloudfront/pricing/ | Flat-rate plans (Free/$15/$200/$1,000), origin transfer waived | 2026-10-12 |
| https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/ | US/Mexico/Canada egress: first 1 TB free, next 9 TB $0.085/GB | 2026-10-12 |
| https://aws.amazon.com/elasticloadbalancing/pricing/ | ALB $0.0225/h + $0.008/LCU-hour, NLB $0.0225/h + $0.006/NLCU-hour | 2026-10-12 |
| https://aws.amazon.com/ec2/spot/pricing/ | Spot up to 90% off On-Demand | 2026-10-12 |
| https://aws.amazon.com/kinesis/data-streams/pricing/ | On-demand $0.04/stream-hour + per GB, provisioned $0.015/shard-hour | 2026-10-12 |
| https://aws.amazon.com/cloudwatch/pricing/ | Logs ingestion (Standard/IA/vended tiers), storage, custom metrics tiers, API, alarms, Container Insights | 2026-10-12 |
| https://aws.amazon.com/cloudtrail/pricing/ | Free first management copy, extra copies, data events | 2026-10-12 |
| https://aws.amazon.com/lambda/pricing/ | Duration x86/Arm, requests, provisioned concurrency, free tier (tables render dynamically) | 2026-10-12 |
| https://aws.amazon.com/fargate/pricing/ | Fargate x86 per vCPU/GB-second, ARM ~20% lower, Spot up to 70%, Savings Plans up to 50% | 2026-10-12 |
| https://aws.amazon.com/eks/pricing/ | EKS standard vs extended support hourly | 2026-10-12 |
| https://aws.amazon.com/dynamodb/pricing/on-demand/ | On-demand WRU/RRU and storage, Standard vs Standard-IA | 2026-10-12 |
| https://aws.amazon.com/dynamodb/pricing/provisioned/ | WCU/RCU-hour, reserved capacity discounts | 2026-10-12 |
| https://aws.amazon.com/rds/pricing/ | RDS instance and storage pricing (Multi-AZ, gp2/gp3) | 2026-10-12 |
| https://aws.amazon.com/rds/aurora/pricing/ | Aurora Serverless v2 $0.12/ACU-h Standard, $0.156 I/O-Optimized | 2026-10-12 |
| https://aws.amazon.com/rds/proxy/pricing/ | RDS Proxy billing basis (rate table renders dynamically; SST quotes $0.015/ACU-h, 8 ACU minimum) | 2026-10-12 |
| https://aws.amazon.com/s3/pricing/ | S3 storage, requests, transfer (tables render dynamically) | 2026-10-12 |
| https://aws.amazon.com/ebs/pricing/ | EBS volume and snapshot pricing, archive tier | 2026-10-12 |
| https://aws.amazon.com/ecr/pricing/ | ECR storage pricing | 2026-10-12 |
| https://aws.amazon.com/api-gateway/pricing/ | REST vs HTTP per million, WebSocket, caching | 2026-10-12 |
| https://aws.amazon.com/step-functions/pricing/ | Standard per transition, Express per request and GB-s | 2026-10-12 |
| https://aws.amazon.com/secrets-manager/pricing/ | Per secret-month, per 10k API calls, examples | 2026-10-12 |
| https://aws.amazon.com/systems-manager/pricing/ | Parameter Store standard free, advanced, throughput | 2026-10-12 |
| https://aws.amazon.com/kms/pricing/ | Per key-month, rotation charges, per 10k requests | 2026-10-12 |
| https://aws.amazon.com/sqs/pricing/ | Free tier, 64 KB chunk billing (rate table renders dynamically) | 2026-10-12 |
| https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/ | Free monitoring, action-enabled budgets, reports | 2026-10-12 |

## Networking and data transfer

| URL | What it gives | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html | NAT cost reduction: same-AZ, endpoints | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html | Gateway endpoints for S3/DynamoDB, no additional charge | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html | Lambda VPC attachment and internet access | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html | ECR interface endpoints and S3 gateway endpoint for layers | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html | CloudFront compression | 2026-10-12 |
| https://aws.amazon.com/blogs/architecture/exploring-data-transfer-costs-for-aws-managed-databases/ | Cross-AZ $0.01/GB each direction for managed databases | 2026-10-12 |
| https://aws.amazon.com/blogs/networking-and-content-delivery/exploring-data-transfer-costs-for-aws-network-load-balancers/ | NLB data transfer costs | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Vpc.html | CDK Vpc defaults: natGateways one per AZ, maxAzs 3 | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.NatProvider.html | CDK NAT instance provider | 2026-10-12 |
| https://sst.dev/docs/component/aws/vpc | SST Vpc nat managed/ec2, az default 2, cost notes | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/nat_gateway | availability_mode zonal/regional, availability_zone_address | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_endpoint | vpc_endpoint_type default Gateway | 2026-10-12 |

## Logging and metrics

| URL | What it gives | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html | Log-level filtering requires JSON, levels, defaults | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-logformat.html | Lambda log format (text default, JSON) | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/logging-with-s3.html | Lambda logs to S3 via Delivery class | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html | Standard vs Infrequent Access vs Delivery features; class immutable | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html | EMF, one custom metric per dimension combination, cardinality warning | 2026-10-12 |
| https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-cw.html | Flow logs to CloudWatch Logs | 2026-10-12 |
| https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html | CloudTrail data events and selectors | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html | API Gateway execution and access logging | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group | retention_in_days (0 = never expire), log_group_class | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_settings | logging_level, data_trace_enabled | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.Function.html | CDK Function defaults: x86_64, 128 MB, logRetention INFINITE, TEXT format | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_logs.LogGroup.html | CDK LogGroup defaults: TWO_YEARS, STANDARD, RETAIN | 2026-10-12 |

## Compute

| URL | What it gives | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html | arm64 vs x86_64, migration requirements | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html | Memory sizing, 1,769 MB = 1 vCPU, Power Tuning, Compute Optimizer (x86 only) | 2026-10-12 |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html | Spot two-minute interruption notice | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_group | mixed_instances_policy, spot_allocation_strategy | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html | Provisioned concurrency | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html | Lambda timeouts | 2026-10-12 |
| https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/cost-optimization.html | Serverless Lens cost optimization | 2026-10-12 |
| https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html | Well-Architected Cost Optimization pillar | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html | Fargate Spot, 2-minute warning, SIGTERM, strategy base/weight | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-arm64.html | ECS on ARM64 | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html | ECS service autoscaling, scheduled scaling | 2026-10-12 |
| https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html | EKS version calendar, extended support default | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/eks_cluster | upgrade_policy support_type | 2026-10-12 |
| https://sst.dev/docs/component/aws/function | SST Function defaults: x86_64, 1024 MB, retention 1 month, text logs | 2026-10-12 |
| https://sst.dev/docs/component/aws/service | SST Service defaults: x86_64, capacity, scaling min/max 1 | 2026-10-12 |

## Databases

| URL | What it gives | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.tableclasses.html | Standard-IA when storage > 50% of throughput cost; 2 switches / 30 days | 2026-10-12 |
| https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html | TTL deletes consume no write throughput | 2026-10-12 |
| https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/AutoScaling.html | DynamoDB autoscaling | 2026-10-12 |
| https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html | GSI projections and write cost | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table | billing_mode default PROVISIONED, table_class, ttl | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_dynamodb.TableV2.html | TableV2 default Billing.onDemand(), TableClass.STANDARD | 2026-10-12 |
| https://sst.dev/docs/component/aws/dynamo | SST Dynamo ttl, streams, transform | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html | 0 ACU auto-pause, versions, blockers, resume time | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.StorageReliability.html | I/O-Optimized at ≥25% I/O spend | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/extended-support.html | RDS Extended Support enrollment | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/extended-support-charges.html | Extended Support charges and opt-out | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance | engine_lifecycle_support default, storage_type default gp2 | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html | RDS gp2 vs gp3 baseline IOPS and throughput | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/rds_cluster | serverlessv2 min_capacity 0, seconds_until_auto_pause, storage_type | 2026-10-12 |
| https://sst.dev/docs/component/aws/aurora | SST Aurora defaults (min 0.5 ACU), proxy cost | 2026-10-12 |

## Storage

| URL | What it gives | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html | S3 Lifecycle | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html | 128 KB default floor, minimum durations, 40 KB Glacier overhead | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html | Abort incomplete multipart uploads | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html | Intelligent-Tiering tiers, <128 KB not tiered | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html | S3 Bucket Keys reduce KMS requests up to 99% | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration | transition_default_minimum_object_size, abort/noncurrent blocks | 2026-10-12 |
| https://docs.aws.amazon.com/ebs/latest/userguide/general-purpose.html | gp3 20% lower per GiB than gp2, included IOPS/throughput | 2026-10-12 |
| https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-archive.html | Snapshot archive tier | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ebs_volume | type default gp2 | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Volume.html | CDK Volume default GENERAL_PURPOSE_SSD (gp2) | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html | ECR lifecycle policies | 2026-10-12 |

## Managed services

| URL | What it gives | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html | REST-only vs HTTP-only features | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html | API Gateway caching | 2026-10-12 |
| https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html | Standard vs Express semantics, limits, pricing basis, immutable type | 2026-10-12 |
| https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html | .sync and task token integration patterns | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sfn_state_machine | type default STANDARD | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html | Parameters and Secrets Lambda Extension | 2026-10-12 |
| https://docs.aws.amazon.com/powertools/typescript/latest/features/parameters/ | Powertools Parameters caching (maxAge); old docs.powertools.aws.dev URL redirects here | 2026-10-12 |
| https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/data-key-caching.html | Data key caching | 2026-10-12 |
| https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html | KMS key rotation | 2026-10-12 |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html | SQS short vs long polling | 2026-10-12 |
| https://sst.dev/docs/component/aws/apigatewayv2 | SST HTTP API component | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kinesis_stream | stream_mode_details ON_DEMAND / PROVISIONED, shard_count | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kinesis.Stream.html | CDK Stream default PROVISIONED, 1 shard | 2026-10-12 |

## Governance

| URL | What it gives | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html | Activating cost allocation tags, 24 h delays | 2026-10-12 |
| https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-allocation-backfill.html | Backfill tag activation up to 12 months | 2026-10-12 |
| https://sst.dev/docs/providers/ | SST provider configuration passes options to the provider | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ce_cost_allocation_tag | aws_ce_cost_allocation_tag | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs#default_tags-configuration-block | Provider default_tags | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/tagging.html | CDK Tags.of | 2026-10-12 |
| https://sst.dev/docs/reference/config | SST app() removal (default retain), providers | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/resources.html | CDK removal policies | 2026-10-12 |
| https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html | AWS Budgets | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/budgets_budget | aws_budgets_budget | 2026-10-12 |
| https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html | Cost Anomaly Detection, ~3 runs/day, up to 24 h delay | 2026-10-12 |
| https://docs.aws.amazon.com/cost-management/latest/userguide/getting-started-ad.html | Default AWS-services monitor for accounts created after 2023-03-27 | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ce_anomaly_monitor | aws_ce_anomaly_monitor | 2026-10-12 |
| https://docs.aws.amazon.com/savingsplans/latest/userguide/what-is-savings-plans.html | Savings Plans overview | 2026-10-12 |
| https://docs.aws.amazon.com/savingsplans/latest/userguide/plan-types.html | Compute SP up to 66% (EC2/Fargate/Lambda), EC2 Instance SP up to 72%, Database SP up to 35% | 2026-10-12 |
