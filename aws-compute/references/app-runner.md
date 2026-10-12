# App Runner

Rules for `aws_apprunner_service` and `aws_apprunner_auto_scaling_configuration_version`
(Terraform) and `apprunner.CfnService` / `@aws-cdk/aws-apprunner-alpha` `Service` (CDK). App Runner
is closed to new customers and gets no new features, so the first question for any App Runner
code is whether it should exist at all (APR-001).

Defaults: health check protocol `TCP` (path `/`, interval 5 s, timeout 2 s, healthy 1,
unhealthy 5); instance 1 vCPU / 2 GB; auto scaling `MaxConcurrency` 100, `MinSize` 1,
`MaxSize` 25; idle provisioned instances bill memory only, and App Runner temporarily doubles
provisioned instances during deployments.

### APR-001 — Don't start new App Runner services; plan the move to ECS Express Mode
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** New workloads go to Amazon ECS Express Mode (or a regular Fargate service); existing App Runner services get a migration plan.
- **Why:** App Runner stopped accepting new customers on 2026-04-30 (existing customers can still create services); an account that wasn't a customer by then cannot adopt it, so the same IaC can fail in a fresh account, and AWS plans no new features. ECS Express Mode provisions a Fargate service, ALB, auto scaling and networking from one call at no extra charge.
- **Detect:** New `aws_apprunner_service`, `aws_apprunner_*` resources, CDK `apprunner.CfnService` / `new apprunner.Service(` in a diff (not just existing code being edited).
- **Fix:** Create the service with ECS Express Mode (`aws ecs create-express-gateway-service`, or the console/IaC equivalents) and shift traffic with Route 53 weighted records as in the AWS migration guide. Then review it with the ECS rules.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html , https://docs.aws.amazon.com/apprunner/latest/relnotes/release-2025-08-28-runtime-eos-update.html (date banner) , https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html
- **Last verified:** 2026-10-12

### APR-002 — Use an HTTP health check against a real readiness endpoint
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** Set `health_check_configuration { protocol = "HTTP", path = "/health" }` pointing at an endpoint that checks the app can serve.
- **Why:** The default TCP check only proves a port is open; an app whose event loop is wedged or whose DB pool is exhausted stays "healthy" and keeps receiving traffic.
- **Detect:** `aws_apprunner_service` without `health_check_configuration` or with `protocol = "TCP"`; CDK `healthCheck` unset or `HealthCheck.tcp(...)`.
- **Fix:**
  ```hcl
  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    healthy_threshold   = 1
    unhealthy_threshold = 3
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apprunner/latest/dg/manage-configure-healthcheck.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apprunner_service
- **Last verified:** 2026-10-12

### APR-003 — Right-size provisioned instances and pause idle environments
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Keep `min_size` at the minimum the service needs per environment, and pause non-production services when unused.
- **Why:** Every provisioned instance bills memory while idle ($0.007 per GB-hour in most US/EU Regions); `min_size = 5` with 2 GB instances bills about 5 × 2 × 730 × $0.007 ≈ $51/month before any traffic, per environment.
- **Detect:** `aws_apprunner_auto_scaling_configuration_version { min_size > 1 }` used by dev/preview services; CDK `autoScalingConfiguration` with `minSize > 1` in stage-agnostic code.
- **Fix:** One auto scaling configuration per environment class (`min_size = 1` for non-prod); pause via `aws apprunner pause-service` in a schedule.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/apprunner/pricing/ , https://docs.aws.amazon.com/apprunner/latest/dg/manage-autoscaling.html , https://docs.aws.amazon.com/apprunner/latest/dg/manage-pause.html
- **Last verified:** 2026-10-12

### APR-004 — Size instance CPU/memory and max concurrency from load tests
- **Severity:** low
- **Category:** performance
- **Applies to:** Terraform, CDK, TypeScript
- **Rule:** Set `instance_configuration { cpu, memory }` and the auto scaling configuration's `max_concurrency` from measured per-instance capacity instead of leaving defaults.
- **Why:** App Runner scales out when concurrent requests per instance exceed `max_concurrency` (default 100, range 1–200). If that number is far above what one Node process handles, latency climbs before scaling kicks in; far below, you pay for extra instances. The default 1 vCPU / 2 GB is oversized for many small Node APIs.
- **Detect:** `aws_apprunner_service` without `instance_configuration` or `auto_scaling_configuration_arn`; `max_concurrency` values not backed by a load test.
- **Fix:**
  ```hcl
  instance_configuration {
    cpu    = "512"
    memory = "1024"
  }
  ```
  plus an `aws_apprunner_auto_scaling_configuration_version` with a measured `max_concurrency`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/apprunner/latest/dg/manage-autoscaling.html , https://docs.aws.amazon.com/apprunner/latest/api/API_CreateAutoScalingConfiguration.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apprunner_service
- **Last verified:** 2026-10-12
