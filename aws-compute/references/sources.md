# Sources

Every official page the aws-compute rules cite, grouped by topic, so a moved link can be found
again by title. All verified live on 2026-10-12 (Terraform pages against provider v6.68.0).
When refreshing, re-read the pages behind **Volatile: yes** rules first: runtime tables,
quotas, prices and defaults.

## Lambda: runtimes, quotas, pricing

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html | Supported/deprecated runtime table with deprecation and block dates; AL2 EOL note | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-sdk-included | Node runtimes ship SDK v3 only; keep-alive on by default | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html | Memory 128–10,240 MB, 1,769 MB = 1 vCPU, 900 s timeout, 6 MB sync / 1 MB async / 200 MB streamed payloads, /tmp 512–10,240 MB, 250 MB unzipped package, 5 layers, scaling 1,000 envs / 10 s | 2026-10-12 |
| https://aws.amazon.com/lambda/pricing/ | Request price, x86 and Arm GB-s prices (Arm $0.0000133334 read from the page's price data feed), provisioned concurrency GB-s price, ephemeral storage price | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/runtimes-update.html | Runtime update modes (Auto default, Manual as temporary rollback), include SDK in package | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_runtime_management_config | `update_runtime_on` Auto/FunctionUpdate/Manual; Manual blocks `runtime` changes | 2026-10-12 |
| https://aws.amazon.com/blogs/aws/aws-lambda-functions-powered-by-aws-graviton2-processor-run-your-functions-on-arm-and-get-up-to-34-better-price-performance/ | Arm duration 20% lower, up to 34% better price performance | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html | arm64 vs x86_64, compatibility of code/layers/images | 2026-10-12 |
| https://aws.amazon.com/blogs/developer/announcing-end-of-support-for-aws-sdk-for-javascript-v2/ | SDK for JavaScript v2 end-of-support 2025-09-08 | 2026-10-12 |

## Lambda: configuration and code

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html | Init outside handler, idempotency, Power Tuning, load-test timeouts, reserved concurrency, SQS visibility | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html | Memory/CPU configuration | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html | Timeout configuration | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html | Reserved concurrency, 100 unreserved minimum | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html | PC only on versions/aliases, billing, Application Auto Scaling | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html | SnapStart runtimes (Java 11+, Python 3.12+, .NET 8+), exclusions, uniqueness | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html | Init 10 s limit, freeze/thaw of background work, /tmp persistence, reset on failure | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html | Async handlers, callback handlers only up to Node.js 22, top-level await, SDK bundling | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/nodejs-context.html | Node context object (`getRemainingTimeInMillis`) | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html | Go handler signatures, init() client reuse, best practices | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/golang-context.html | Go context and deadlines | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/golang-package.html | provided.al2023, `bootstrap`, `-tags lambda.norpc`, `CGO_ENABLED=0` | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html | Response streaming | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/functions-calling-functions.html | Lambda-calls-Lambda anti-pattern | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/anti-patterns.html | Lambda anti-patterns overview | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html | Durable functions, waits without compute charges | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/durable-step-functions.html | Durable functions vs Step Functions | 2026-10-12 |
| https://docs.aws.amazon.com/powertools/typescript/latest/features/idempotency/ | Powertools TS idempotency utility | 2026-10-12 |
| https://docs.aws.amazon.com/powertools/typescript/latest/features/batch/ | Powertools TS batch processor | 2026-10-12 |
| https://repost.aws/knowledge-center/lambda-function-idempotent | Making functions idempotent | 2026-10-12 |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html | REST API integration timeout 50 ms–29 s (raisable for Regional/private) | 2026-10-12 |

## Lambda: async invocation, event sources, recursion

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html | Async retries (2), 6 h max age, discard behavior | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html | On-failure destinations and DLQs | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html | Visibility ≥ 6× timeout (+ window), maxReceiveCount ≥ 5, batch size/window, reserved ≥ 5 | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html | Partial batch responses, success/failure conditions, FIFO behavior | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html | Maximum concurrency 2–1,000, interaction with reserved concurrency | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/services-kinesis-parameters.html | Stream ESM defaults (retry -1, record age -1, bisect false) | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/services-kinesis-batchfailurereporting.html | Partial batch response for streams | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/kinesis-on-failure-destination.html | Stream on-failure destinations | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html | Filter criteria; unmatched SQS messages are deleted | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/with-sqs-filtering.html | SQS filter examples | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html | Recursive loop detection (~16 hops; SQS, S3, SNS, EventBridge custom buses; not DynamoDB) | 2026-10-12 |
| https://docs.aws.amazon.com/lambda/latest/dg/recursive-runaway.html | Recursive runaway patterns | 2026-10-12 |

## Lambda: IaC references

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.FunctionProps.html | CDK defaults: x86_64, 128 MB, 3 s, retryAttempts 2, maxEventAge 6 h, recursiveLoop Terminate, logRetention deprecated | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs.NodejsFunction.html | NodejsFunction runtime default (NODEJS_16_X without feature flag) | 2026-10-12 |
| https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-lambda/lib/runtime.ts | `Runtime.NODEJS_LATEST` = `nodejs24.x` (not stated in the API reference) | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs.BundlingOptions.html | externalModules, bundleAwsSDK | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/v2/guide/permissions.html | CDK `grant*` methods | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function | `architectures` default x86_64, memory 128, timeout 3, `snap_start`, `ephemeral_storage`, `reserved_concurrent_executions` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping | `function_response_types`, `maximum_retry_attempts`, `bisect_batch_on_function_error`, `scaling_config`, `filter_criteria` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function_event_invoke_config | Async retry/age/destinations | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function_recursion_config | `recursive_loop` Allow/Terminate | 2026-10-12 |
| https://sst.dev/docs/component/aws/function/ | SST Function defaults (x86_64, 1024 MB, 20 s, nodejs24.x), concurrency, versioning | 2026-10-12 |
| https://sst.dev/docs/component/aws/queue/ | SST Queue visibilityTimeout 30 s, subscribe batch defaults (size 10, window 0 s, partialResponses false), dlq retry 3 | 2026-10-12 |
| https://sst.dev/docs/linking/ | SST `link` and `Resource` | 2026-10-12 |

## ECS and Fargate

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html | Circuit breaker, rollback, thresholds | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html | stopTimeout 30 s default / 120 s max, healthCheck defaults, initProcessEnabled, log driver non-blocking default, image digest resolution | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service_definition_parameters.html | min/max percent defaults, health check grace period default 0, AZ rebalancing | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html | Fargate Spot 2-minute warning, SIGTERM, base/weight | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html | Valid Fargate CPU/memory combinations, ARM64 on Linux | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-arm64.html | ARM64 task definitions | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html | Service auto scaling types and behavior during deployments | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-targettracking.html | Target tracking for services | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html | Rolling deployments, image stability | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/scheduled_tasks.html | Scheduled tasks | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html | ECS Express Mode | 2026-10-12 |
| https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/ | Shell-form PID 1 ignores SIGTERM, exec/tini, `initProcessEnabled` | 2026-10-12 |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-considerations.html | Handle SIGTERM; unique image tags (git SHA), `latest` for testing only | 2026-10-12 |
| https://aws.amazon.com/fargate/pricing/ | Per-second billing, 1-minute minimum, Spot up to 70% off, 20 GB ephemeral included | 2026-10-12 |
| https://aws.amazon.com/blogs/aws/announcing-aws-graviton2-support-for-aws-fargate-get-up-to-40-better-price-performance-for-your-serverless-containers/ | Graviton Fargate 20% lower cost | 2026-10-12 |
| https://aws.amazon.com/about-aws/whats-new/2024/09/amazon-ecs-graviton-based-spot-compute-fargate/ | Fargate Spot on Graviton | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.FargateServiceProps.html | CDK defaults: circuitBreaker disabled, minHealthyPercent 50, grace period 60 s with LB | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service | `deployment_circuit_breaker`, `ignore_changes = [desired_count]` guidance | 2026-10-12 |
| https://sst.dev/docs/component/aws/service/ | SST Service defaults (0.25 vCPU / 0.5 GB, x86_64, scaling 1–1 with 70% CPU/memory targets, no container health check, Spot option); circuit breaker not documented | 2026-10-12 |

## EC2, EBS, Auto Scaling

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-new-instances.html | Require IMDSv2, hop limit 2 for containers, account defaults | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template | `http_tokens` default `optional`, hop limit default 1 | 2026-10-12 |
| https://docs.aws.amazon.com/ebs/latest/userguide/general-purpose.html | gp3 20% cheaper, 3,000 IOPS / 125 MiB/s baseline, gp2 burst model | 2026-10-12 |
| https://aws.amazon.com/ebs/pricing/ | gp3 $0.08 vs gp2 $0.10 per GB-month (us-east-1) | 2026-10-12 |
| https://docs.aws.amazon.com/ebs/latest/userguide/ebs-modify-volume.html | In-place volume type changes | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ebs_volume | `type` default `gp2` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance | `root_block_device.volume_type` defaults to the AMI's type, `ebs_block_device.volume_type` to gp2 | 2026-10-12 |
| https://aws.amazon.com/ec2/graviton/ | Graviton up to 20% less than comparable x86 | 2026-10-12 |
| https://aws.amazon.com/ec2/previous-generation/ | Previous-generation families list (T1, M1–M4, C1–C4, R3/R4, I2; not T2) | 2026-10-12 |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode.html | T8i/T4g/T3a/T3 launch unlimited by default; Spot in standard | 2026-10-12 |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode-concepts.html | Surplus credit charges | 2026-10-12 |
| https://docs.aws.amazon.com/autoscaling/ec2/userguide/launch-configurations.html | Launch configuration limits (no new types since 2023-01-01, blocked for accounts from 2024-10-01) | 2026-10-12 |
| https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-health-checks.html | ELB health checks for ASGs | 2026-10-12 |
| https://docs.aws.amazon.com/autoscaling/ec2/userguide/allocation-strategies.html | price-capacity-optimized recommended, lowest-price not recommended | 2026-10-12 |
| https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-capacity-rebalancing.html | Capacity rebalancing | 2026-10-12 |
| https://docs.aws.amazon.com/autoscaling/ec2/userguide/asg-instance-refresh.html | Instance refresh | 2026-10-12 |
| https://docs.aws.amazon.com/autoscaling/ec2/userguide/lifecycle-hooks.html | Lifecycle hooks | 2026-10-12 |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html | Spot 2-minute interruption notice via IMDS and EventBridge | 2026-10-12 |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/RootDeviceStorage.html | Root volume `DeleteOnTermination` | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_group | `health_check_type`, `spot_allocation_strategy` default `lowest-price`, `instance_refresh` | 2026-10-12 |
| https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html | Target tracking policies, predefined metrics, metrics that don't work | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_policy | `TargetTrackingScaling`, `ASGAverageCPUUtilization` | 2026-10-12 |
| https://docs.aws.amazon.com/linux/al2023/ug/imdsv2.html | AL2023 AMIs require IMDSv2, hop limit 2 | 2026-10-12 |
| https://docs.aws.amazon.com/linux/al2023/ug/continuing-al2-filesystem.html | AL2023 AMIs use gp3 root volumes (AL2 gp2) | 2026-10-12 |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_autoscaling.AutoScalingGroupProps.html | CDK ASG defaults: EC2 health checks, requireImdsv2 false, launch configuration unless template/flag | 2026-10-12 |

## App Runner

| URL | What it backs | Last verified |
| --- | --- | --- |
| https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html | Closed to new customers, no new features, migrate to ECS Express Mode | 2026-10-12 |
| https://docs.aws.amazon.com/apprunner/latest/relnotes/release-2025-08-28-runtime-eos-update.html | Banner: closed to new customers starting April 30, 2026 | 2026-10-12 |
| https://docs.aws.amazon.com/apprunner/latest/api/API_CreateAutoScalingConfiguration.html | Defaults MaxConcurrency 100 (1–200), MinSize 1, MaxSize 25 | 2026-10-12 |
| https://docs.aws.amazon.com/apprunner/latest/dg/manage-configure-healthcheck.html | Health check defaults (TCP, `/`, 5 s, 2 s, 1, 5) | 2026-10-12 |
| https://docs.aws.amazon.com/apprunner/latest/dg/manage-autoscaling.html | Max concurrency, min/max size, idle instances billed for memory | 2026-10-12 |
| https://docs.aws.amazon.com/apprunner/latest/dg/manage-pause.html | Pause/resume | 2026-10-12 |
| https://aws.amazon.com/apprunner/pricing/ | $0.064/vCPU-hour, $0.007/GB-hour, idle memory charge | 2026-10-12 |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apprunner_service | `health_check_configuration` and `instance_configuration` defaults | 2026-10-12 |
