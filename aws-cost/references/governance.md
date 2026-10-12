# Governance: tags, budgets, anomalies, commitments, lifecycle of stacks

Prices below are as verified on 2026-10-12. Confirm them live before quoting.
Reference prices: Budgets monitoring free; first two action-enabled budgets free, then
$0.10/day each; budget reports $0.01 each. Savings Plans: Compute SP up to 66% off On-Demand
(EC2, Fargate, Lambda), EC2 Instance SP up to 72% (one family in one Region), Database SP up to
35% (Aurora, RDS, DynamoDB, ElastiCache and others). Cost Anomaly Detection runs about three
times a day on Cost Explorer data (up to 24 h delay).

### COST-070 — Tag everything at the provider or app level
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every stack applies a common tag set (at least app/service, environment/stage, owner/team, cost center) through provider-level defaults, not by hand on each resource.
- **Why:** Untagged spend cannot be split by team or environment, so nobody owns the NAT or log bill; hand-tagging always misses resources.
- **Detect:** Terraform `provider "aws"` without `default_tags { tags = {...} }`; CDK app without `Tags.of(app).add(...)` (or `Tags.of(stack)`); SST `app()` without `providers: { aws: { defaultTags: { tags: {...} } } }` (SST passes `providers.aws` options to the underlying Pulumi AWS provider, whose `defaultTags` option this is; SST's own docs show only `region`, so check the provider docs it links to); resources with ad-hoc, inconsistent `tags` keys (`Env` vs `environment`).
- **Fix:**
  ```hcl
  provider "aws" {
    default_tags { tags = { app = "orders", env = var.env, team = "payments" } }
  }
  ```
  ```ts
  // CDK
  Tags.of(app).add("app", "orders"); Tags.of(app).add("env", stage);
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs#default_tags-configuration-block ; https://docs.aws.amazon.com/cdk/v2/guide/tagging.html ; https://sst.dev/docs/reference/config ; https://sst.dev/docs/providers/
- **Last verified:** 2026-10-12

### COST-071 — Activate the cost allocation tags you rely on
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform
- **Rule:** Tag keys used for cost reporting are activated as cost allocation tags (in the management/payer account), ideally as code.
- **Why:** User-defined tags do not appear in Cost Explorer or CUR until activated; keys take up to 24 h to appear for activation and up to 24 h more to activate. Earlier months can be backfilled (up to 12 months, one request per 24 h), but until someone activates the keys, per-team and per-stage reports are empty.
- **Detect:** `default_tags` / `Tags.of` present but no `aws_ce_cost_allocation_tag` for those keys in the org/payer configuration repo; dashboards or budgets filtering on tags that are not activated.
- **Fix:**
  ```hcl
  resource "aws_ce_cost_allocation_tag" "app" { tag_key = "app" status = "Active" }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html ; https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-allocation-backfill.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ce_cost_allocation_tag
- **Last verified:** 2026-10-12

### COST-072 — Put a budget with alerts on every account and environment
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Each account (or each environment via a tag/cost-category filter) has an AWS Budget with actual and forecasted alerts routed to a team channel.
- **Why:** Budget monitoring is free, and without it a runaway (a recursive Lambda, a forgotten GPU instance, a log storm) is found on the invoice weeks later.
- **Detect:** Account/bootstrap IaC with no `aws_budgets_budget` (or CDK `budgets.CfnBudget`); budgets with only `ACTUAL` notifications and no `FORECASTED`; notifications to a single personal email.
- **Fix:**
  ```hcl
  resource "aws_budgets_budget" "monthly" {
    budget_type = "COST"  limit_amount = "500"  limit_unit = "USD"  time_unit = "MONTHLY"
    notification { comparison_operator = "GREATER_THAN" threshold = 80 threshold_type = "PERCENTAGE" notification_type = "FORECASTED" subscriber_sns_topic_arns = [aws_sns_topic.cost.arn] }
  }
  ```
- **Volatile:** yes
- **Source:** https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/ ; https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/budgets_budget
- **Last verified:** 2026-10-12

### COST-073 — Enable Cost Anomaly Detection with a subscription
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform
- **Rule:** The payer or workload account has an anomaly monitor (by service, linked account, cost category or tag) and a subscription that notifies a team channel.
- **Why:** Budgets catch totals; anomaly detection catches a single service spiking inside a normal total (e.g. NAT processing tripling after a deploy), within about a day.
- **Detect:** Account-level (payer/landing-zone) IaC that defines budgets but no `aws_ce_anomaly_monitor` / `aws_ce_anomaly_subscription`; subscriptions with no threshold expression or only to an unmonitored mailbox. Do not flag a workload repo for the mere absence: accounts created after 2023-03-27 get a default AWS-services monitor with a daily email summary when Cost Explorer is enabled, so phrase it as "confirm a monitor routes to the team".
- **Fix:** `aws_ce_anomaly_monitor { monitor_type = "DIMENSIONAL" monitor_dimension = "SERVICE" }` plus `aws_ce_anomaly_subscription` with a dollar/percentage threshold and SNS → chat.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html ; https://docs.aws.amazon.com/cost-management/latest/userguide/getting-started-ad.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ce_anomaly_monitor
- **Last verified:** 2026-10-12

### COST-074 — Cover steady compute with Savings Plans (or reserved capacity)
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** When the reviewed IaC shows always-on capacity (fixed ECS task counts, EC2/ASG minimums, provisioned DynamoDB, RDS instances) expected to run for a year, recommend checking Savings Plans / reserved capacity coverage in Cost Explorer.
- **Why:** Compute Savings Plans apply across EC2, Fargate and Lambda (up to 66% off On-Demand; Fargate's page quotes up to 50%); EC2 Instance Savings Plans reach 72% for one family in one Region; Database Savings Plans take up to 35% off Aurora, RDS, DynamoDB, ElastiCache and other database services (including serverless usage); DynamoDB reserved capacity is up to 54%/77% off provisioned for 1/3 years. On-demand for a known baseline is the most expensive way to run it.
- **Detect:** Production `aws_ecs_service.desired_count` / `scaling.min` ≥ 2 and `aws_autoscaling_group.min_size` ≥ 1 running 24/7; `aws_db_instance` in prod; `aws_dynamodb_table` `PROVISIONED` with steady capacity. This rule only fires with such evidence; commitments themselves are not in IaC.
- **Fix:** Size the commitment to the always-on floor (not the peak) using Cost Explorer recommendations; state the hourly commitment and the estimated saving.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/savingsplans/latest/userguide/what-is-savings-plans.html ; https://docs.aws.amazon.com/savingsplans/latest/userguide/plan-types.html ; https://aws.amazon.com/fargate/pricing/ ; https://aws.amazon.com/dynamodb/pricing/provisioned/
- **Last verified:** 2026-10-12

### COST-075 — Make ephemeral stages removable
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Dev, preview and PR stages delete their data stores and log groups on teardown; only production retains.
- **Why:** SST's default `removal` is `"retain"` and CDK `LogGroup`/`Table`/`Bucket` default to `RETAIN`, so every removed preview stage leaves billing tables, buckets and log groups behind.
- **Detect:** `sst.config.ts` `app()` without `removal: input?.stage === "production" ? "retain" : "remove"`; CDK stacks for non-prod with `removalPolicy` unset on `Table`, `Bucket`, `LogGroup` (and no `autoDeleteObjects`); Terraform `skip_destroy = true` / `prevent_destroy` in non-prod modules.
- **Fix:**
  ```ts
  // sst.config.ts
  app(input) { return { name: "orders", home: "aws", removal: input?.stage === "production" ? "retain" : "remove" }; }
  ```
  CDK: `removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY` (+ `autoDeleteObjects: !isProd` for buckets).
- **Volatile:** no
- **Source:** https://sst.dev/docs/reference/config ; https://docs.aws.amazon.com/cdk/v2/guide/resources.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_logs.LogGroup.html
- **Last verified:** 2026-10-12

### COST-076 — State the monthly delta of new hourly resources in plan/diff reviews
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** When a `terraform plan`, `cdk diff` or `sst diff` adds hourly-billed resources (NAT gateways, interface endpoints, EIPs, load balancers, Aurora/RDS instances, EKS clusters, provisioned concurrency, caches), the review states the added monthly cost per stage.
- **Why:** Hourly resources are the ones that bill with zero traffic and multiply per stage; a one-line "+3 NAT = +$98.55/month per stage" in the PR prevents the surprise.
- **Detect:** Plan lines `+ resource "aws_nat_gateway"`, `aws_vpc_endpoint` (Interface), `aws_eip`, `aws_lb`, `aws_rds_cluster_instance`, `aws_db_instance`, `aws_eks_cluster`, `aws_elasticache_*`; `cdk diff` `[+] AWS::EC2::NatGateway`, `AWS::EC2::VPCEndpoint`, `AWS::RDS::DBInstance`; `sst diff` creating `Vpc`, `Aurora`, `Redis`.
- **Fix:** Add the arithmetic (count × hourly × 730, per stage) to the review; if the number is unexpected, apply the relevant rule above.
- **Volatile:** yes
- **Source:** https://aws.amazon.com/vpc/pricing/ ; https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html
- **Last verified:** 2026-10-12
