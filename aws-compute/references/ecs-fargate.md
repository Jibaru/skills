# ECS and Fargate

Rules for `aws_ecs_service` / `aws_ecs_task_definition` (Terraform), `ecs.FargateService`,
`ecs.FargateTaskDefinition`, `ecs_patterns.*` (CDK), `sst.aws.Service` + `sst.aws.Cluster`
(SST v3), plus the Dockerfile and app code that decide shutdown behavior. Load balancer, target
group and subnet design go to **aws-networking**; image scanning and task-role scope to
**aws-security**.

Defaults that matter: CDK `FargateService` has the circuit breaker **disabled**,
`minHealthyPercent` 50 and a 60 s health check grace period when a load balancer is attached;
the ECS API default `minimumHealthyPercent` is 100 (replica services) and
`healthCheckGracePeriodSeconds` 0; SST `Service` runs x86_64 at 0.25 vCPU / 0.5 GB, scales
min 1 / max 1, and has no container health check unless `health` is set (the SST docs don't
document its circuit-breaker setting).

### ECS-001 — Enable the deployment circuit breaker with rollback
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Services using rolling updates on the `ECS` deployment controller (the only kind the circuit breaker supports) enable the circuit breaker with `rollback = true` (and optionally CloudWatch deployment alarms).
- **Why:** Without it, a bad image (crash on boot, failing health check) makes ECS replace tasks in a loop indefinitely: the deployment never fails, the old tasks are drained as far as `minimumHealthyPercent` allows, and capacity stays reduced until a human notices.
- **Detect:** Terraform `aws_ecs_service` without `deployment_circuit_breaker { enable = true  rollback = true }` (and not using `deployment_controller { type = "CODE_DEPLOY" }`). CDK `new ecs.FargateService(...)`/`Ec2Service`/`ecs_patterns.ApplicationLoadBalancedFargateService` without `circuitBreaker: { rollback: true }`. SST `sst.aws.Service`: its docs don't expose the circuit breaker; report only if `transform.service` explicitly sets `deploymentCircuitBreaker: { enable: false }` or omits rollback.
- **Fix:**
  ```hcl
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  ```
  ```ts
  new ecs.FargateService(this, "Api", { cluster, taskDefinition, circuitBreaker: { rollback: true } });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html , https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.FargateServiceProps.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service
- **Last verified:** 2026-10-12

### ECS-002 — Make SIGTERM reach the app, and handle it
- **Severity:** high
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** The app process must receive SIGTERM (exec-form `CMD`/`ENTRYPOINT`, or `initProcessEnabled`/tini when a wrapper is unavoidable) and must handle it: stop accepting work, drain in-flight requests/jobs, then exit before `stopTimeout`.
- **Why:** On deploys, scale-in and Spot interruptions ECS sends SIGTERM, waits `stopTimeout` (30 s default), then SIGKILLs. With shell-form commands (`/bin/sh -c ...`) the shell is PID 1 and doesn't pass SIGTERM to the app, so the app is always SIGKILLed: in-flight HTTP requests get connection resets and half-finished jobs are lost on every deployment. An app that ignores SIGTERM has the same outcome, only later.
- **Detect:** Dockerfile `CMD node dist/server.js` / `CMD npm start` / `ENTRYPOINT ./app` (shell form), `CMD ["sh", "-c", "..."]` without `exec`. `CMD ["npm", "start"]` (npm as PID 1) is exec form, and AWS documents nothing about npm's signal forwarding: raise it as low ("run `node` directly or enable `initProcessEnabled`"), not as this rule's high finding. App code with no `process.on("SIGTERM"` (TS) or no `signal.NotifyContext(`/`signal.Notify(` with `syscall.SIGTERM` and `srv.Shutdown(` (Go). Task definitions without `"linuxParameters": { "initProcessEnabled": true }` when a wrapper is required.
- **Fix:**
  ```dockerfile
  CMD ["node", "dist/server.js"]
  ```
  ```ts
  process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
  ```
  ```go
  ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
  defer stop()
  go func() { _ = srv.ListenAndServe() }()
  <-ctx.Done()
  shutdownCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
  defer cancel()
  _ = srv.Shutdown(shutdownCtx)
  ```
- **Volatile:** no
- **Source:** https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/ , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-considerations.html , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
- **Last verified:** 2026-10-12

### ECS-003 — Size stopTimeout and load balancer deregistration delay together
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** `stopTimeout` (max 120 s on Fargate) must cover the app's drain time; the target group deregistration delay should be short enough to fit Fargate Spot's 2-minute warning and long enough for your longest request.
- **Why:** The ALB default deregistration delay is 300 s while Fargate Spot gives 120 s, so Spot tasks are killed while the load balancer is still routing to them. Long jobs with the 30 s default `stopTimeout` are killed mid-run on every deploy.
- **Detect:** Task definitions without `stopTimeout` for workers with long jobs; `stopTimeout` > 120 on Fargate (rejected); `FARGATE_SPOT` capacity with `aws_lb_target_group` lacking `deregistration_delay` (default 300) or CDK `targetGroup.setAttribute("deregistration_delay.timeout_seconds", ...)` absent.
- **Fix:**
  ```hcl
  resource "aws_lb_target_group" "api" { deregistration_delay = 30 }
  ```
  Container definition: `"stopTimeout": 60`. Hand off target group tuning to **aws-networking**.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html , https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/ , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
- **Last verified:** 2026-10-12

### ECS-004 — Give essential containers a health check and the service a grace period that covers startup
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Define a container `healthCheck` (with `startPeriod`) whose command exists in the image, and set `health_check_grace_period_seconds` on load-balanced services to cover worst-case startup.
- **Why:** With the Terraform/API default grace period of 0, a service whose app needs 60 s to warm up fails ALB checks, gets killed, restarts and fails again (task churn and a deploy that never stabilizes). A `curl` health check in a distroless or Alpine image without curl marks every task unhealthy. Without any health check, a hung process keeps receiving traffic.
- **Detect:** Terraform `container_definitions` without `healthCheck` (lower to medium when an ALB health check covers the task); CDK services with a load balancer get a 60 s grace period by default, so check it against real startup time instead of flagging it as missing; `healthCheck.command` using `curl`/`wget` in images built `FROM gcr.io/distroless/*`, `scratch`, or `node:*-alpine` without installing curl; `aws_ecs_service` with `load_balancer` blocks and no `health_check_grace_period_seconds`; SST `sst.aws.Service` without `health`.
- **Fix:**
  ```json
  "healthCheck": { "command": ["CMD", "node", "dist/healthcheck.js"], "interval": 15, "timeout": 5, "retries": 3, "startPeriod": 60 }
  ```
  ```hcl
  health_check_grace_period_seconds = 90
  ```
  Go: ship a `/app healthcheck` subcommand instead of relying on curl.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service_definition_parameters.html , https://sst.dev/docs/component/aws/service/
- **Last verified:** 2026-10-12

### ECS-005 — Use a valid Fargate CPU/memory pair sized to the runtime
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Task `cpu`/`memory` must be a supported Fargate combination, and vCPUs should match what the process can use: a single Node.js process uses one core for JavaScript unless you run `cluster`/`worker_threads` or several processes.
- **Why:** Invalid pairs (e.g. 256 CPU with 4 GB) fail task definition registration. A 4 vCPU task running one Node process pays for ~3 idle vCPUs per task, 24/7.
- **Detect:** Terraform `cpu`/`memory`, CDK `cpu`/`memoryLimitMiB`, SST `cpu`/`memory` outside the table (256: 512–2048 MiB; 512: 1–4 GB; 1024: 2–8 GB; 2048: 4–16 GB; 4096: 8–30 GB; 8192: 16–60 GB in 4 GB steps; 16384: 32–120 GB in 8 GB steps). Node services (`CMD ["node", ...]`) with `cpu >= 2048` and no `cluster`, `worker_threads` or `pm2` usage. Container-level `memory` hard limits summing above task memory.
- **Fix:** Start Node APIs at 512–1024 CPU and scale out on task count (ECS-009). Go uses all cores, so size by measured CPU.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html , https://aws.amazon.com/fargate/pricing/
- **Last verified:** 2026-10-12

### ECS-006 — Run Fargate tasks on ARM64 when the image is multi-arch
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Set `runtimePlatform.cpuArchitecture = ARM64` for Linux tasks whose image is built for `linux/arm64`; the image architecture must match.
- **Why:** Graviton-based Fargate is priced about 20% lower than x86 for the same vCPU/memory (the Fargate pricing page's example shows about 19%); Fargate Spot also supports ARM64. Mismatched architecture (arm64 task, amd64-only image) fails at start with an exec format error.
- **Detect:** Terraform `aws_ecs_task_definition` without `runtime_platform { cpu_architecture = "ARM64" }`; CDK `FargateTaskDefinition` without `runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX }`; SST `Service` without `architecture: "arm64"`. Mismatch: arm64 set while CI runs `docker build --platform linux/amd64` or base images are amd64-only.
- **Fix:**
  ```hcl
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  ```
  Build with `docker buildx build --platform linux/arm64,linux/amd64`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-arm64.html , https://aws.amazon.com/blogs/aws/announcing-aws-graviton2-support-for-aws-fargate-get-up-to-40-better-price-performance-for-your-serverless-containers/ , https://aws.amazon.com/about-aws/whats-new/2024/09/amazon-ecs-graviton-based-spot-compute-fargate/
- **Last verified:** 2026-10-12

### ECS-007 — Use Fargate Spot for interruption-tolerant tasks, with an on-demand base
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Queue workers, batch jobs and non-prod services should run mostly on `FARGATE_SPOT` (up to 70% cheaper); production request-serving services keep an on-demand `base` so a Spot reclaim cannot take them to zero.
- **Why:** Spot tasks get a 2-minute warning and Fargate does not backfill with on-demand capacity; a production service with every task on Spot (or a single Spot task) is down until Spot capacity returns. Conversely, workers on on-demand pay full price for work that tolerates interruption.
- **Detect:** `capacity_provider_strategy` with only `FARGATE_SPOT` (or SST `capacity: "spot"`) on a service behind a load balancer in production; worker/batch services with only `FARGATE`/`launch_type = "FARGATE"`. CDK `capacityProviderStrategies`.
- **Fix:**
  ```hcl
  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 2
    weight            = 1
  }
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 3
  }
  ```
  ```ts
  capacity: $app.stage === "production" ? { fargate: { base: 2, weight: 1 }, spot: { weight: 3 } } : "spot",
  ```
  Spot tasks need ECS-002/ECS-003 handled.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html , https://aws.amazon.com/fargate/pricing/ , https://sst.dev/docs/component/aws/service/
- **Last verified:** 2026-10-12

### ECS-008 — Let auto scaling own the desired count in Terraform
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform
- **Rule:** When an `aws_appautoscaling_target` manages a service, add `lifecycle { ignore_changes = [desired_count] }` to the `aws_ecs_service`.
- **Why:** Otherwise every `terraform apply` resets the task count to the literal in code, scaling a service that auto scaling grew to 20 tasks back to 2 in the middle of peak traffic.
- **Detect:** `aws_appautoscaling_target { service_namespace = "ecs", resource_id = "service/<cluster>/<service>" }` for a service whose `aws_ecs_service` sets `desired_count` and has no `ignore_changes = [desired_count]`.
- **Fix:**
  ```hcl
  resource "aws_ecs_service" "api" {
    desired_count = 2
    lifecycle { ignore_changes = [desired_count] }
  }
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html
- **Last verified:** 2026-10-12

### ECS-009 — Scale services with target tracking instead of a fixed count
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Services with variable load get Application Auto Scaling target tracking (CPU, memory or `ALBRequestCountPerTarget`; queue workers on backlog per task) with min/max bounds.
- **Why:** A fixed count is sized for peak and paid 24/7, or sized for average and falls over at peak.
- **Detect:** `aws_ecs_service` with no matching `aws_appautoscaling_target`/`aws_appautoscaling_policy`; CDK services without `autoScaleTaskCount(...)`; SST `Service` without `scaling` (default min 1, max 1).
- **Fix:**
  ```ts
  const scaling = service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 20 });
  scaling.scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 60 });
  ```
  ```ts
  scaling: { min: 2, max: 20, cpuUtilization: 60 },
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-targettracking.html , https://sst.dev/docs/component/aws/service/
- **Last verified:** 2026-10-12

### ECS-010 — Keep deployment percentages from dropping capacity
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Production services keep `minimumHealthyPercent` at 100 with `maximumPercent` ≥ 200 (start new before stopping old). Flag `minimumHealthyPercent` 0 on single-task services and CDK's implicit 50.
- **Why:** With `desired_count = 1` and `minimumHealthyPercent = 0` ECS stops the only task before the new one is healthy: downtime on every deploy. CDK's default of 50 halves serving capacity during each deployment. `maximumPercent = 100` with `minimumHealthyPercent = 100` leaves ECS no room to start a replacement.
- **Detect:** `deployment_minimum_healthy_percent = 0` (or < 100) / CDK `minHealthyPercent` unset or < 100 on request-serving services; `deployment_maximum_percent = 100` together with min 100.
- **Fix:**
  ```ts
  new ecs.FargateService(this, "Api", { minHealthyPercent: 100, maxHealthyPercent: 200, /* ... */ });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service_definition_parameters.html , https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.FargateServiceProps.html
- **Last verified:** 2026-10-12

### ECS-011 — Spread production services across at least two AZs
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Production services run at least 2 tasks with `awsvpcConfiguration.subnets` in at least two Availability Zones.
- **Why:** One task or one subnet means a single AZ impairment, or a single task crash, takes the service down; the scheduler can only spread across the subnets you give it.
- **Detect:** `network_configuration { subnets = [aws_subnet.private_a.id] }` (one subnet), CDK `vpcSubnets: { subnets: [oneSubnet] }`, `desired_count = 1` or autoscaling `min_capacity = 1` on production services.
- **Fix:** Pass all private subnets across AZs and `min_capacity >= 2`; consider `availability_zone_rebalancing = "ENABLED"` (the ECS API default for new services is `DISABLED`; CDK and the Terraform provider default it to `ENABLED`). Subnet layout: hand off to **aws-networking**.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service_definition_parameters.html
- **Last verified:** 2026-10-12

### ECS-012 — Run periodic work as scheduled tasks, not always-on services
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Work that runs on a timer (nightly export, hourly sync) runs as an EventBridge Scheduler/scheduled ECS task (or Lambda if it fits in 15 minutes), not as a service that sleeps between runs.
- **Why:** A 1 vCPU/2 GB service that works 5 minutes an hour still bills 720 task-hours a month; a scheduled task bills about 60 task-hours (per-second billing, 1-minute minimum).
- **Detect:** Services named `*cron*`, `*scheduler*`, `*worker*` whose entrypoint loops with `setInterval(`, `node-cron`, `time.NewTicker(`, `time.Sleep(time.Hour)`; `desired_count = 1` with no load balancer.
- **Fix:** `aws_scheduler_schedule` with an `ecs_parameters` target, CDK `ecs_patterns.ScheduledFargateTask`, or SST `sst.aws.Cron` with a `task`/`function` target.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/scheduled_tasks.html , https://aws.amazon.com/fargate/pricing/
- **Last verified:** 2026-10-12

### ECS-013 — Deploy immutable image references, not a moving `latest` tag
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Point task definitions at a unique tag (commit SHA) or digest per release.
- **Why:** With `:latest` the task definition never changes, so Terraform has nothing to deploy unless `force_new_deployment` runs on every apply, rollbacks have no previous revision to return to, and two task definition revisions can mean the same thing. ECS resolves the tag to a digest per deployment, so tasks stay consistent within one deployment, but the release history is lost.
- **Detect:** `"image": "<repo>:latest"` / image without tag in `container_definitions`; CDK `ContainerImage.fromEcrRepository(repo)` without a tag or `fromRegistry("...:latest")`; `force_new_deployment = true` used as the deploy mechanism.
- **Fix:** `image = "${aws_ecr_repository.api.repository_url}:${var.git_sha}"`; CDK `ContainerImage.fromEcrRepository(repo, props.gitSha)`; SST builds and tags images per deploy by default.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-considerations.html , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service
- **Last verified:** 2026-10-12
