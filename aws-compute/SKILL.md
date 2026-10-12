---
name: aws-compute
description: Review AWS compute code and IaC (Lambda, ECS/Fargate, EC2/Auto Scaling/EBS, App Runner) in Terraform, CDK v2, SST v3, TypeScript (SDK v3) and Go (aws-sdk-go-v2) for bugs, cost waste, reliability and performance risks, with evidence-backed findings. Use when the user says "review my Lambda", "is this function config right", "why is my Lambda slow/expensive", "check my SQS consumer", "review this ECS service / task definition", "is this Fargate setup ok", "review my Dockerfile shutdown", "check this launch template / ASG", "gp2 or gp3", "should I use App Runner", or when aws-review dispatches compute files.
metadata:
  author: Jibaru
  version: 1.0.0
---

# aws-compute

A static reviewer for AWS compute. It reads files, diffs and `terraform plan` / `cdk diff` /
`sst diff` output, never an AWS account, and reports findings; it changes code only if the user
asks afterwards.

## Covers / hands off

Covers: Lambda configuration (runtime, architecture, memory, timeout, concurrency, SnapStart,
ephemeral storage, bundling, Go on `provided.al2023`), Lambda handler code, async invocation and
event source mappings (SQS, Kinesis, DynamoDB Streams) from the function's side, recursion
loops, ECS/Fargate services and task definitions (sizing, ARM, Spot, health checks, SIGTERM,
deployments, autoscaling), EC2/ASG/EBS (instance families, IMDSv2, gp3, launch templates, Spot),
App Runner.

Hand off, one line each, when you see these:

- Table/index design, query patterns, RDS/Aurora, connection pooling → **aws-data**
- S3 buckets, lifecycle, EBS snapshots/backups, EFS → **aws-storage**
- Queue/topic/bus design, EventBridge rules and target DLQs, DLQ redrive → **aws-messaging**
- VPC, subnets, NAT, security groups, load balancers, target groups → **aws-networking**
- Module structure, state, drift, CDK/SST project layout → **aws-iac**
- IAM scope, secrets, encryption, account-wide IMDS enforcement → **aws-security**
- Account-level spend, Savings Plans, budgets → **aws-cost**
- Log retention, alarms, tracing, dashboards → **aws-observability**

## Signals

aws-review routes to this skill when any of these appear.

Files: `*.tf`, `*.tf.json`, `terraform plan` output, `cdk.json`, `lib/**/*.ts` / `bin/*.ts` in a
CDK app, `cdk diff` output, `sst.config.ts`, `infra/**/*.ts` in an SST app, `sst diff` output,
`Dockerfile*`, `**/handler*.ts`, `**/functions/**/*.ts`, `**/lambda/**`, Go `main.go` importing
`aws-lambda-go`, `Makefile`/CI files that build `bootstrap`.

Content:

- Terraform: `aws_lambda_function`, `aws_lambda_event_source_mapping`,
  `aws_lambda_function_event_invoke_config`, `aws_lambda_provisioned_concurrency_config`,
  `aws_lambda_alias`, `aws_lambda_function_recursion_config`, `aws_lambda_runtime_management_config`, `aws_lambda_layer_version`,
  `aws_s3_bucket_notification` with `lambda_function`, `aws_ecs_service`,
  `aws_ecs_task_definition`, `aws_ecs_cluster_capacity_providers`, `aws_appautoscaling_target`
  (`ecs`/`lambda`), `aws_instance`, `aws_launch_template`, `aws_launch_configuration`,
  `aws_autoscaling_group`, `aws_autoscaling_policy`, `aws_ebs_volume`, `aws_apprunner_service`.
- CDK: `aws-cdk-lib/aws-lambda`, `aws-lambda-nodejs`, `aws-lambda-event-sources`,
  `aws-lambda-destinations`, `new lambda.Function`, `new NodejsFunction`, `SqsEventSource`,
  `DynamoEventSource`, `KinesisEventSource`, `addAlias`, `provisionedConcurrentExecutions`,
  `aws-cdk-lib/aws-ecs`, `aws-ecs-patterns`, `FargateService`, `FargateTaskDefinition`,
  `aws-cdk-lib/aws-ec2` (`Instance`, `LaunchTemplate`), `aws-autoscaling`
  (`AutoScalingGroup`), `apprunner`.
- SST v3: `sst.aws.Function`, `handler:` on any component, `.subscribe(`, `sst.aws.Queue`,
  `sst.aws.Cron`, `sst.aws.Service`, `sst.aws.Cluster`, `sst.aws.Task`.
- TypeScript: `export const handler`, `from "aws-lambda"`, `@aws-sdk/client-lambda`,
  `@aws-sdk/client-*` used in a handler, `@aws-lambda-powertools/*`, `batchItemFailures`,
  `require("aws-sdk")`, `process.on("SIGTERM"`.
- Go: `github.com/aws/aws-lambda-go/lambda`, `lambda.Start(`, `aws-lambda-go/events`,
  `github.com/aws/aws-sdk-go-v2/service/lambda`, `.../service/ecs`, `.../service/ec2`,
  `signal.NotifyContext(`, `-tags lambda.norpc`.

## Procedure

1. **Collect the inputs.** Use the files aws-review passed, or find them with the Signals above.
   When reviewing a change, start from the diff but open the surrounding code: a handler and the
   IaC that wires it (runtime, trigger, timeout, queue) must be read together, since most
   compute bugs are a mismatch between the two. Done when every function, service, task
   definition, instance/ASG and App Runner service in scope has both its declaration and its
   code (or image) located, or is noted as missing.
2. **Open only the relevant reference files** from the index below.
3. **Apply every rule** in the opened files to every resource in scope, then look for problems
   the rules don't name and mark those `NEW`.
4. **Verify each finding against the code.** Trace it: the trigger really feeds this function,
   the default really applies because the property is really absent, the value really flows to
   that call. Drop anything you cannot point to.
5. **Check staleness.** If a rule you used has `Last verified` more than 120 days before today,
   say "reference is stale, run /aws-refresh". For `Volatile: yes` rules, confirm the number
   live (AWS Knowledge/Documentation MCP if connected, otherwise WebFetch the rule's Source URL)
   before reporting prices, limits, defaults or dates.

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

## Reference files

- [references/lambda-config.md](references/lambda-config.md) — LMB-001–014 and LMB-037: runtimes, arm64, build/arch match, memory, timeout, reserved and provisioned concurrency, SnapStart, /tmp, bundling, Go on provided.al2023, recursion setting, SST `link`, runtime management mode.
- [references/lambda-code.md](references/lambda-code.md) — LMB-015–026: handler code in TS and Go: async handlers on Node 24, client reuse, un-awaited work, SDK v2, init, global state, context deadlines, exiting, payload limits, Lambda-to-Lambda, sleep loops, idempotency.
- [references/lambda-events.md](references/lambda-events.md) — LMB-027–036: async failure capture, partial batch responses, item identifiers, SQS visibility and redrive, stream retries, ESM concurrency, filtering, trigger-write loops, batch size.
- [references/ecs-fargate.md](references/ecs-fargate.md) — ECS-001–013: circuit breaker, SIGTERM and PID 1, stopTimeout/deregistration, health checks and grace period, task sizing, ARM64, Spot, desired_count drift, autoscaling, deployment percentages, AZ spread, scheduled tasks, image tags.
- [references/ec2.md](references/ec2.md) — EC2-001–012: IMDSv2, gp3, Graviton/current generation, burstable credits, launch templates, ELB health checks, Spot diversification, AZ spread, instance refresh, drain on termination, orphaned volumes, ASG target tracking.
- [references/app-runner.md](references/app-runner.md) — APR-001–004: closed to new customers (ECS Express Mode), HTTP health checks, idle provisioned cost, instance and concurrency sizing.
- [references/sources.md](references/sources.md) — every official URL used, by topic, with what it backs; start here when refreshing.
