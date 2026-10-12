# Compute

Prices below are us-east-1 as verified on 2026-10-12. Confirm them live before quoting.
Reference prices: Lambda duration x86 $0.0000166667/GB-s, Arm $0.0000133334/GB-s (first tier);
requests $0.20 per million; provisioned concurrency $0.0000041667/GB-s plus a lower duration
rate ($0.0000097222/GB-s on x86); free tier 1M requests and 400,000 GB-s per month. Fargate
Linux/x86 $0.000011244 per vCPU-second and $0.000001235 per GB-second; Linux/ARM about 20%
lower. Fargate Spot up to 70% off Fargate; Compute Savings Plans up to 50% on Fargate. EC2 Spot
up to 90% off On-Demand with a two-minute interruption notice. EKS cluster $0.10/h standard
support, $0.60/h extended support.

### COST-026 — Run Lambda on arm64
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** New functions use `arm64` unless a native dependency, layer or extension has no arm64 build.
- **Why:** Arm duration is 20% cheaper per GB-s ($0.0000133334 vs $0.0000166667). A 1,024 MB function at 10M invocations × 200 ms = 2M GB-s: $33.33 → $26.67, saving $6.67/month per function, more at higher volume; AWS cites up to 34% better price-performance.
- **Detect:** Terraform `aws_lambda_function` without `architectures` (default `["x86_64"]`) or with `["x86_64"]`; CDK `new lambda.Function(` / `NodejsFunction` without `architecture` (default `Architecture.X86_64`); SST `sst.aws.Function` without `architecture` (default `"x86_64"`); Go builds with `GOARCH=amd64` for `provided.al2023`.
- **Fix:**
  ```ts
  new NodejsFunction(this, "Fn", { architecture: lambda.Architecture.ARM_64, /* ... */ });
  ```
  SST `architecture: "arm64"`; Terraform `architectures = ["arm64"]`; Go `GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap`. Check layers and native modules (e.g. `sharp`, `bcrypt`) for arm64 builds first.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/lambda/pricing/ ; https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html
- **Last verified:** 2026-10-12

### COST-027 — Set Lambda memory from measurement, not habit
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Memory is chosen by power-tuning or Compute Optimizer data; blanket values (128 MB everywhere, or 3,008 MB "to be safe") are flagged.
- **Why:** Cost = GB × seconds. CPU scales with memory (1,769 MB ≈ 1 vCPU), so a CPU-bound function at 128 MB can cost more than at 1,024 MB because it runs 10× longer; an I/O-bound router at 3,008 MB pays ~3× what 1,024 MB costs for the same duration.
- **Detect:** Terraform `memory_size` absent (default 128) on CPU-heavy code (image processing, crypto, JSON transforms) or the same large value on every function; CDK `memorySize` unset (default 128) or identical everywhere; SST `memory` unset (default `"1024 MB"`) for trivial routers.
- **Fix:** Run AWS Lambda Power Tuning (open-source, Step Functions-based, linked from the Lambda memory docs) per function, or accept Compute Optimizer memory recommendations (x86_64 functions only), and pin the cheapest memory that meets the latency target; record the result next to the config.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html ; https://aws.amazon.com/lambda/pricing/
- **Last verified:** 2026-10-12

### COST-028 — Do not pay Lambda to wait
- **Severity:** high
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Functions do not sleep, poll or busy-wait for external work; waits move to Step Functions (`Wait`, `.sync`, `.waitForTaskToken`), queues or events.
- **Why:** Lambda bills wall-clock duration. A 1,024 MB function polling a job for 5 minutes per invocation costs 300 GB-s = $0.005 per run; at 100k runs/month that is $500/month of waiting, and it caps at the 15-minute timeout.
- **Detect:** TS `await new Promise((r) => setTimeout(r, ...))` / `while (status !== "DONE") { await sleep(...) }` in handlers; repeated `GetQueryExecution`, `DescribeExecution`, `GetJob` calls in a loop; Go `time.Sleep(` inside `for` with SDK status calls.
- **Fix:** Start the job and return; resume via Step Functions `.sync` integration, an EventBridge event on completion, or a `Wait` + `Choice` loop with long intervals (Standard bills per transition, so poll rarely; see COST-061).
- **Volatile:** no
- **Source:** https://aws.amazon.com/lambda/pricing/ ; https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html
- **Last verified:** 2026-10-12

### COST-029 — Do not invoke Lambda synchronously from Lambda
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** A function does not call another function with `RequestResponse` and wait; orchestrate with Step Functions, or merge the code.
- **Why:** The caller is billed for the whole time the callee runs, so the chain pays twice (or N times) for the same work, and errors/timeouts compound.
- **Detect:** TS `new InvokeCommand({ FunctionName, InvocationType: "RequestResponse" })` or `InvocationType` omitted (defaults to `RequestResponse`) inside a handler; Go `lambda.Invoke(ctx, &lambda.InvokeInput{...})` without `InvocationType: types.InvocationTypeEvent`.
- **Fix:** Use `InvocationType: "Event"` when the result is not needed, a Step Functions state machine when it is, or a shared module in the same function.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/cost-optimization.html ; https://aws.amazon.com/lambda/pricing/
- **Last verified:** 2026-10-12

### COST-030 — Use provisioned concurrency only where cold starts cost more than it does
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Provisioned concurrency is set only on latency-critical production aliases, sized from measured concurrency, ideally scheduled; never in dev/preview stages.
- **Why:** It bills for every configured GB-second whether used or not: 10 × 1,024 MB provisioned 24/7 = 10 × 1 GB × 2,628,000 s × $0.0000041667 ≈ $109.50/month before any invocation.
- **Detect:** Terraform `aws_lambda_provisioned_concurrency_config` / `provisioned_concurrent_executions` without stage condition; CDK `provisionedConcurrentExecutions` on `Alias`/`Version`, `addAutoScaling` absent; SST `concurrency: { provisioned: N }` in every stage.
- **Fix:** Gate by stage; use Application Auto Scaling scheduled/target-tracking on the alias; or try SnapStart where the runtime supports it (hand off to `aws-compute`).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/lambda/pricing/ ; https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html
- **Last verified:** 2026-10-12

### COST-031 — Run interruption-tolerant ECS tasks on Fargate Spot
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Queue workers, batch jobs and non-prod services use a capacity provider strategy that includes `FARGATE_SPOT`, with SIGTERM handling.
- **Why:** Fargate Spot is up to 70% cheaper (SST's docs estimate around 50%; the Spot price varies). A 4-task worker at 1 vCPU/2 GB running 24/7 on x86 costs 4 × 2,628,000 s × ($0.000011244 + 2 × $0.000001235) ≈ $144.16/month on Fargate; at a 50–70% discount it saves ~$72.08–$100.91/month. Interruptions come with a 2-minute warning (SIGTERM), so the code must drain.
- **Detect:** Terraform `aws_ecs_service` with `launch_type = "FARGATE"` for workers; CDK `new ecs.FargateService(` without `capacityProviderStrategies`; SST `sst.aws.Service` without `capacity` (default regular Fargate) in non-prod or for workers.
- **Fix:**
  ```ts
  // SST
  new sst.aws.Service("Worker", { cluster, capacity: $app.stage === "production" ? { fargate: { weight: 1, base: 1 }, spot: { weight: 3 } } : "spot" });
  ```
  ```hcl
  # remove launch_type: it conflicts with capacity_provider_strategy
  capacity_provider_strategy { capacity_provider = "FARGATE" base = 1 weight = 1 }
  capacity_provider_strategy { capacity_provider = "FARGATE_SPOT" weight = 3 }
  ```
  The cluster needs `aws_ecs_cluster_capacity_providers` listing `FARGATE_SPOT` (CDK: `enableFargateCapacityProviders: true`).
  Handle SIGTERM (`process.on("SIGTERM", drain)`, Go `signal.NotifyContext(ctx, syscall.SIGTERM)`).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/fargate/pricing/ ; https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html ; https://sst.dev/docs/component/aws/service
- **Last verified:** 2026-10-12

### COST-032 — Run Fargate tasks on ARM64
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Linux Fargate tasks use `ARM64` when the image builds for arm64.
- **Why:** Fargate Linux/ARM is about 20% cheaper per vCPU-second and GB-second than Linux/x86 for the same task size (confirm the regional rates on the pricing page): the $144.16/month worker of COST-031 drops ~$28.83/month. Go and Node images usually build for arm64 with no code change.
- **Detect:** Terraform `aws_ecs_task_definition` without `runtime_platform { cpu_architecture = "ARM64" }`; CDK `FargateTaskDefinition` without `runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64 }`; SST `sst.aws.Service` without `architecture: "arm64"` (default `"x86_64"`).
- **Fix:** Build multi-arch images (`docker buildx build --platform linux/arm64`) and set the architecture.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/fargate/pricing/ ; https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-arm64.html
- **Last verified:** 2026-10-12

### COST-033 — Scale non-production to zero when nobody uses it
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Dev/staging services, clusters and databases with fixed capacity have a schedule or a scale-to-zero path outside working hours.
- **Why:** Weekday working hours are ~50 of 168 hours; a 24/7 dev environment pays ~3.4× what it needs. A $300/month dev stack drops to ~$90.
- **Detect:** `aws_ecs_service.desired_count` fixed > 0 in non-prod tfvars with no `aws_appautoscaling_scheduled_action`; CDK `FargateService` with `desiredCount` and no `autoScaleTaskCount().scaleOnSchedule`; SST `scaling: { min: 1 }` (default) in every stage; Aurora `min_capacity > 0` in dev (see COST-043).
- **Fix:** Scheduled scaling to 0 at night/weekends (`scaleOnSchedule` with `minCapacity: 0, maxCapacity: 0`), Aurora auto-pause, or `sst remove` for preview stages.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html ; https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html
- **Last verified:** 2026-10-12

### COST-034 — Give long-running services autoscaling instead of fixed peak capacity
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** ECS services sized for peak have target-tracking autoscaling with a lower minimum; task CPU/memory follow observed utilization.
- **Why:** A service pinned at 10 tasks for a peak hit 2 hours/day runs ~80% idle capacity; with min 3 / max 10 it pays for roughly a third of the task-hours.
- **Detect:** SST `scaling: { min: N, max: N }` (min = max) or unset (default `{ min: 1, max: 1 }`) on production services; CDK `desiredCount` with no `autoScaleTaskCount`; Terraform `aws_ecs_service` without `aws_appautoscaling_target`; `cpu = 4096`/`memory = 16384` on simple web tasks.
- **Fix:** `scaling: { min: 2, max: 10, cpuUtilization: 60 }` (SST) / `autoScaleTaskCount({ minCapacity: 2, maxCapacity: 10 }).scaleOnCpuUtilization(...)` (CDK).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html ; https://sst.dev/docs/component/aws/service
- **Last verified:** 2026-10-12

### COST-035 — Upgrade EKS before extended support, or decide to pay for it
- **Severity:** high
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** EKS clusters run a version in standard support, or the PR explicitly accepts extended support; the upgrade policy is set on purpose.
- **Why:** Extended support is enabled by default and raises the control plane from $0.10/h to $0.60/h: +$365/month per cluster. On 2026-10-12, versions 1.31–1.33 are already in extended support.
- **Detect:** Terraform `aws_eks_cluster` `version = "1.31" | "1.32" | "1.33"` (check the current calendar) and no `upgrade_policy { support_type = "STANDARD" }`; CDK `eks.Cluster` with `version: eks.KubernetesVersion.V1_31`…`V1_33`.
- **Fix:** Plan the upgrade; set `upgrade_policy { support_type = "STANDARD" }` if the team prefers forced upgrades over the surcharge.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/eks/pricing/ ; https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/eks_cluster
- **Last verified:** 2026-10-12

### COST-036 — Prefer current-generation and Graviton EC2 families
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** New EC2 / ASG / RDS / ElastiCache instance types use a current Graviton family (`*g`) or current x86 generation, not old generations kept by copy-paste.
- **Why:** Older generations usually cost more per unit of performance; Graviton families are typically priced lower than comparable x86 sizes (confirm the specific pair on the pricing page).
- **Detect:** Previous-generation families in new code: `instance_type = "t2.*" | "m4.*" | "c4.*" | "r4.*" | "m3.*"`; CDK `ec2.InstanceType.of(ec2.InstanceClass.T2, ...)`; `db.t2.*` / `db.m4.*` / `cache.t2.*` / `cache.m4.*` in new resources. Do not flag a current-generation x86 family (e.g. `m5`, `m6i`, `m7i`) as a finding by itself; suggest the Graviton equivalent only as a low-severity note with the hourly delta.
- **Fix:** Move to e.g. `t4g`, `m7g`, `c7g`, `r7g` (or the newest available generation) after checking AMI/arch support; state the hourly delta.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/ec2/pricing/on-demand/ ; https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html
- **Last verified:** 2026-10-12

### COST-037 — Set function timeouts to the real budget
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Lambda timeouts sit just above the p99 duration (and below the caller's timeout), not at 900 s by default.
- **Why:** A hung dependency then bills the full timeout on every invocation and every retry: a 1 GB function hanging to 900 s costs $0.015 per call, so 10,000 stuck calls is $150 before anyone notices.
- **Detect:** Terraform `timeout = 900`; CDK `timeout: Duration.minutes(15)`; SST `timeout: "15 minutes"` on API handlers or event consumers with short work; SDK clients without request timeouts (`requestHandler: { requestTimeout }`, Go `context.WithTimeout`).
- **Fix:** Set the function timeout from measured p99 plus margin and give SDK/HTTP calls their own timeouts. Hand off retry semantics to `aws-compute`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html ; https://aws.amazon.com/lambda/pricing/
- **Last verified:** 2026-10-12

### COST-077 — Run interruption-tolerant EC2 capacity on Spot
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Auto Scaling groups, EKS node groups and batch/CI fleets that tolerate interruption (stateless workers, queue consumers, CI runners, non-prod nodes) use Spot capacity with several instance types, keeping On-Demand only for a stable base.
- **Why:** Spot is up to 90% off On-Demand. Moving 10 × `m7g.large` CI/worker nodes running 24/7 to Spot saves 10 × 730 × (On-Demand − Spot hourly) — quote both rates live for the Region; the saving is usually most of the bill. Interruptions come with a two-minute notice, so workloads must drain.
- **Detect:** Terraform `aws_autoscaling_group` with `launch_template` only (no `mixed_instances_policy`) for workers/CI; `aws_eks_node_group` without `capacity_type = "SPOT"` for non-prod or batch node groups; CDK `new autoscaling.AutoScalingGroup(` without `mixedInstancesPolicy` / `spotPrice`, `cluster.addNodegroupCapacity(` without `capacityType: eks.CapacityType.SPOT`.
- **Fix:** `mixed_instances_policy { instances_distribution { on_demand_base_capacity = 1 on_demand_percentage_above_base_capacity = 0 spot_allocation_strategy = "price-capacity-optimized" } launch_template { ... override { instance_type = "m7g.large" } override { instance_type = "m6g.large" } } }`; EKS `capacity_type = "SPOT"` with several `instance_types`. Handle the interruption notice (EventBridge `EC2 Spot Instance Interruption Warning` or instance metadata). Hand off scheduling semantics to `aws-compute`.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/ec2/spot/pricing/ ; https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_group
- **Last verified:** 2026-10-12
