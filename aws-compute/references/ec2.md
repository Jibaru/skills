# EC2, EBS and Auto Scaling groups

Rules for `aws_instance`, `aws_launch_template`, `aws_autoscaling_group`, `aws_ebs_volume`
(Terraform) and `ec2.Instance`, `ec2.LaunchTemplate`, `autoscaling.AutoScalingGroup` (CDK). EBS
snapshot/backup policy goes to **aws-storage**; security groups and public IPs to
**aws-networking**; instance roles to **aws-security**.

Defaults that bite: Terraform `aws_ebs_volume.type` and `aws_instance.ebs_block_device.volume_type`
default to `gp2` (`root_block_device` and launch template volumes default to the AMI's type);
`aws_launch_template` `metadata_options.http_tokens` defaults to `optional` (IMDSv1 allowed) and
hop limit 1; CDK `ec2.Volume` and `BlockDeviceVolume.ebs()` default to gp2 unless the
`@aws-cdk/aws-ec2:ebsDefaultGp3Volume` flag is on; Terraform
`spot_allocation_strategy` defaults to `lowest-price`; CDK `AutoScalingGroup` defaults to EC2-only
health checks, `requireImdsv2: false`, and a launch configuration unless a launch template or the
`AUTOSCALING_GENERATE_LAUNCH_TEMPLATE` feature flag is used.

### EC2-001 — Require IMDSv2
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Every instance and launch template sets `http_tokens = "required"`, with `http_put_response_hop_limit = 2` on hosts that run containers.
- **Why:** IMDSv1 answers unauthenticated GETs, so any SSRF in an app on the box can read the instance role's credentials from `169.254.169.254`. IMDSv2's session token blocks that class of attack. Hop limit 1 breaks IMDS access from containers on the host.
- **Detect:** Terraform `aws_instance`/`aws_launch_template` with `http_tokens = "optional"` (always report); without `metadata_options { http_tokens = "required" }` report it unless the AMI is registered with `ImdsSupport: v2.0` (e.g. Amazon Linux 2023, which then defaults to required with hop limit 2) or the account default/enforcement is visible in the reviewed code; CDK `new ec2.Instance(...)`/`new ec2.LaunchTemplate(...)`/`new autoscaling.AutoScalingGroup(...)` without `requireImdsv2: true`; AMIs registered without `imds_support = "v2.0"`.
- **Fix:**
  ```hcl
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }
  ```
  ```ts
  new ec2.LaunchTemplate(this, "Lt", { requireImdsv2: true, /* ... */ });
  ```
  Account-wide defaults/enforcement: hand off to **aws-security**.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-new-instances.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template , https://docs.aws.amazon.com/linux/al2023/ug/imdsv2.html
- **Last verified:** 2026-10-12

### EC2-002 — Use gp3 instead of gp2
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** New and existing General Purpose SSD volumes use `gp3`; migrate `gp2` in place with Elastic Volumes.
- **Why:** gp3 is 20% cheaper per GB and includes 3,000 IOPS and 125 MiB/s regardless of size, while gp2 below 1 TiB only bursts to 3,000 IOPS on credits. us-east-1: 1 TB gp2 = $100/month vs gp3 = $80/month for the same baseline 3,000 IOPS, $20/month per TB saved; a 100 GB gp2 boot volume has a 300 IOPS baseline vs 3,000 on gp3.
- **Detect:** Terraform `aws_ebs_volume` without `type` (defaults to `gp2`) or `type = "gp2"`; `aws_instance.ebs_block_device` without `volume_type` (gp2); any `volume_type = "gp2"`. A `root_block_device` or launch template `block_device_mappings { ebs { } }` without `volume_type` inherits the AMI's type: report only when the AMI is known to use gp2 (Amazon Linux 2023 AMIs ship gp3 root volumes). CDK `ec2.EbsDeviceVolumeType.GP2`, `new ec2.Volume(...)`/`BlockDeviceVolume.ebs(size)` without `volumeType: ec2.EbsDeviceVolumeType.GP3` (and, for `ec2.Volume`, without the `ebsDefaultGp3Volume` flag).
- **Fix:**
  ```hcl
  resource "aws_ebs_volume" "data" {
    availability_zone = "us-east-1a"
    size              = 500
    type              = "gp3"
  }
  ```
  Provision extra `iops`/`throughput` only above the 3,000 / 125 MiB/s baseline when measured.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/ebs/latest/userguide/general-purpose.html , https://aws.amazon.com/ebs/pricing/ , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ebs_volume , https://docs.aws.amazon.com/ebs/latest/userguide/ebs-modify-volume.html , https://docs.aws.amazon.com/linux/al2023/ug/continuing-al2-filesystem.html
- **Last verified:** 2026-10-12

### EC2-003 — Prefer current-generation and Graviton instance families
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Replace previous-generation types (T1, M1–M4, C1–C4, R3/R4, I2, as listed by AWS) and default new workloads to Graviton (`*g` families) when the AMI and software support arm64.
- **Why:** Graviton instances cost up to 20% less than comparable x86 instances, and current generations deliver more performance per dollar than previous ones on the same bill. An arm64 instance type with an x86_64 AMI fails to launch.
- **Detect:** `instance_type = "m4.*" | "c4.*" | "r4.*" | "m3.*" | "c3.*" | "r3.*" | "t1.*"`; CDK `InstanceType.of(InstanceClass.M4 | C4 | R4, ...)`. T2 is not on the previous-generation list: suggest T3/T4g for it as low. Current-generation x86 families (`m5`, `c5`, `t3`) on workloads that run interpreted/JVM/Go code with no x86-only dependency: report as low. Mismatch: `*g.*` type with an AMI filter on `x86_64`.
- **Fix:** `instance_type = "m7g.large"` with an arm64 AMI (`ec2.MachineImage.latestAmazonLinux2023({ cpuType: ec2.AmazonLinuxCpuType.ARM_64 })`).
- **Volatile:** yes
- **Source:** https://aws.amazon.com/ec2/graviton/ , https://aws.amazon.com/ec2/previous-generation/
- **Last verified:** 2026-10-12

### EC2-004 — Don't run sustained CPU on burstable instances in unlimited mode
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** T3/T3a/T4g/T8i launch as `unlimited` by default: use them for spiky, mostly idle workloads; move steady CPU-bound services to M/C families, and launch Spot T instances in `standard` mode.
- **Why:** When average CPU stays above the baseline over 24 h, unlimited mode bills surplus credits per vCPU-hour, which can make a `t3.large` cost more than an `m7g.large` that has no baseline limit. Short-lived Spot T instances in unlimited mode pay surplus charges without ever accruing credits.
- **Detect:** `t3.*`/`t3a.*`/`t4g.*`/`t8i.*` for build agents, queue workers, game servers or anything described as CPU-bound; `credit_specification { cpu_credits = "unlimited" }` on such workloads; Spot (`instance_market_options`, mixed instances with Spot) using T types without `cpu_credits = "standard"`.
- **Fix:** Switch to `m7g`/`c7g` sized from CPU metrics, or set `credit_specification { cpu_credits = "standard" }` where throttling is acceptable.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode.html , https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode-concepts.html
- **Last verified:** 2026-10-12

### EC2-005 — Use launch templates, not launch configurations
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK
- **Rule:** Auto Scaling groups reference a launch template (or mixed instances policy), never a launch configuration.
- **Why:** Launch configurations don't support instance types released since 2023-01-01, and accounts created on or after 2024-10-01 cannot create them by any method: the same code that works in an old account fails to deploy in a new one.
- **Detect:** Terraform `aws_launch_configuration`, `aws_autoscaling_group.launch_configuration`; CDK `new autoscaling.AutoScalingGroup(...)` with `instanceType`/`machineImage` props and no `launchTemplate`/`mixedInstancesPolicy`, in an app whose `cdk.json` lacks `"@aws-cdk/aws-autoscaling:generateLaunchTemplateInsteadOfLaunchConfig": true`.
- **Fix:**
  ```hcl
  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/autoscaling/ec2/userguide/launch-configurations.html , https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_autoscaling.AutoScalingGroupProps.html
- **Last verified:** 2026-10-12

### EC2-006 — Use ELB health checks for groups behind a load balancer
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** An ASG registered with a target group uses ELB health checks (in addition to EC2) with a grace period that covers boot.
- **Why:** With EC2-only checks, an instance whose app has crashed but whose VM is fine stays "healthy" forever: the load balancer stops routing to it, but the ASG never replaces it, so capacity silently shrinks.
- **Detect:** Terraform `aws_autoscaling_group` with `target_group_arns` (or an `aws_autoscaling_attachment`) and `health_check_type` absent or `"EC2"`; CDK `AutoScalingGroup` attached via `listener.addTargets(..., { targets: [asg] })` without `healthChecks: autoscaling.HealthChecks.withAdditionalChecks({ additionalTypes: [autoscaling.AdditionalHealthCheckType.ELB], gracePeriod })` (or deprecated `healthCheck: HealthCheck.elb(...)`).
- **Fix:**
  ```hcl
  health_check_type         = "ELB"
  health_check_grace_period = 120
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-health-checks.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_group , https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_autoscaling.AutoScalingGroupProps.html
- **Last verified:** 2026-10-12

### EC2-007 — Diversify Spot with price-capacity-optimized and capacity rebalancing
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** ASGs with Spot use a mixed instances policy with several interchangeable instance types, `spot_allocation_strategy = "price-capacity-optimized"`, and `capacity_rebalance = true`.
- **Why:** `lowest-price` (Terraform's default) has the highest interruption risk; a single instance type gives Spot one pool per AZ to reclaim at once. Capacity rebalancing launches a replacement when EC2 signals elevated risk, before the 2-minute notice.
- **Detect:** `mixed_instances_policy` with `spot_allocation_strategy` absent or `"lowest-price"`, one `override`, or `capacity_rebalance` absent; CDK `mixedInstancesPolicy.instancesDistribution.spotAllocationStrategy` not `PRICE_CAPACITY_OPTIMIZED`, `capacityRebalance` unset.
- **Fix:**
  ```hcl
  capacity_rebalance = true
  mixed_instances_policy {
    instances_distribution {
      on_demand_base_capacity                  = 1
      on_demand_percentage_above_base_capacity = 0
      spot_allocation_strategy                 = "price-capacity-optimized"
    }
    launch_template {
      launch_template_specification { launch_template_id = aws_launch_template.app.id }
      override { instance_type = "m7g.large" }
      override { instance_type = "m6g.large" }
      override { instance_type = "c7g.xlarge" }
    }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/autoscaling/ec2/userguide/allocation-strategies.html , https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-capacity-rebalancing.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_group
- **Last verified:** 2026-10-12

### EC2-008 — Spread Auto Scaling groups across at least two AZs
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** `vpc_zone_identifier` (CDK `vpcSubnets`) lists subnets in two or more Availability Zones, with `min_size` ≥ 2 for production.
- **Why:** A single-subnet group is down for the whole duration of an AZ impairment and cannot rebalance.
- **Detect:** `vpc_zone_identifier = [aws_subnet.a.id]`, `availability_zones = ["us-east-1a"]`; CDK `vpcSubnets: { subnets: [single] }` or `availabilityZones` with one entry; `min_size = 1` on production groups.
- **Fix:** Pass all private subnets: `vpc_zone_identifier = aws_subnet.private[*].id`. Subnet layout: hand off to **aws-networking**.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_group , https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-health-checks.html
- **Last verified:** 2026-10-12

### EC2-009 — Roll launch template changes out with instance refresh
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** When an ASG tracks the latest launch template version, configure `instance_refresh` (or an equivalent rolling update) so new AMIs and user data reach running instances.
- **Why:** Updating the template only affects instances launched later: the fleet runs a mix of old and new AMIs for weeks, security patches never land on long-lived instances, and the next scale-out deploys untested config.
- **Detect:** `aws_autoscaling_group` with `launch_template { version = aws_launch_template.x.latest_version | "$Latest" }` and no `instance_refresh` block; CDK groups without `updatePolicy: autoscaling.UpdatePolicy.rollingUpdate()`.
- **Fix:**
  ```hcl
  instance_refresh {
    strategy = "Rolling"
    preferences { min_healthy_percentage = 90 }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/autoscaling/ec2/userguide/asg-instance-refresh.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_group
- **Last verified:** 2026-10-12

### EC2-010 — Drain workers on scale-in and Spot interruption
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, Go, TypeScript
- **Rule:** ASGs running stateful work (queue consumers, long jobs) use a termination lifecycle hook, and Spot instances watch the 2-minute interruption notice to stop taking work and checkpoint.
- **Why:** Without a hook, scale-in terminates an instance mid-job; with Spot, the job dies 2 minutes after the notice whether or not you listened.
- **Detect:** Worker ASGs without `aws_autoscaling_lifecycle_hook { lifecycle_transition = "autoscaling:EC2_INSTANCE_TERMINATING" }` / CDK `asg.addLifecycleHook(...)`; Spot fleets with no EventBridge rule on `EC2 Spot Instance Interruption Warning` and no polling of `meta-data/spot/instance-action`.
- **Fix:** Add the terminating hook with a heartbeat timeout covering the longest job; the agent completes the lifecycle action after draining. Hand off event routing to **aws-messaging**.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/autoscaling/ec2/userguide/lifecycle-hooks.html , https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html
- **Last verified:** 2026-10-12

### EC2-011 — Delete EBS volumes with the instances that own them
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Volumes in launch templates and instance block device mappings keep `delete_on_termination = true` unless the data must outlive the instance (and then it gets a lifecycle owner).
- **Why:** In an ASG every scale-in or instance refresh leaves an orphaned volume billing per GB-month; a 100 GB gp3 per replacement × 30 replacements a month is 3 TB ($240/month in us-east-1) of storage nobody reads.
- **Detect:** `delete_on_termination = false` in `root_block_device`, `ebs_block_device`, or launch template `block_device_mappings { ebs { ... } }`; CDK `BlockDeviceVolume.ebs(size, { deleteOnTermination: false })`.
- **Fix:** `delete_on_termination = true`; for data that must persist use a separately managed volume or snapshots (hand off to **aws-storage**).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/RootDeviceStorage.html , https://aws.amazon.com/ebs/pricing/
- **Last verified:** 2026-10-12

### EC2-012 — Scale Auto Scaling groups with a target tracking policy
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** Groups serving variable load get a target tracking policy (`ASGAverageCPUUtilization`, `ALBRequestCountPerTarget`, or backlog per instance for queue workers) with `min_size < max_size`.
- **Why:** With `min_size = max_size` or no scaling policy the group is a fixed fleet: sized for peak it bills idle instances around the clock, sized for average it saturates at peak. Target tracking keeps the metric near the target and creates and manages its own CloudWatch alarms. Raw queue depth (`ApproximateNumberOfMessagesVisible`) and ALB `RequestCount` don't work as target tracking metrics.
- **Detect:** `aws_autoscaling_group` with no `aws_autoscaling_policy` (`policy_type = "TargetTrackingScaling"`) referencing it, or `min_size == max_size` on a group behind a load balancer or consuming a queue; CDK `AutoScalingGroup` without `scaleOnCpuUtilization`/`scaleOnRequestCount`/`scaleToTrackMetric`; target tracking on `ApproximateNumberOfMessagesVisible` directly.
- **Fix:**
  ```hcl
  resource "aws_autoscaling_policy" "cpu" {
    name                   = "cpu-50"
    autoscaling_group_name = aws_autoscaling_group.app.name
    policy_type            = "TargetTrackingScaling"
    target_tracking_configuration {
      predefined_metric_specification { predefined_metric_type = "ASGAverageCPUUtilization" }
      target_value = 50
    }
  }
  ```
  ```ts
  asg.scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 50 });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html , https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_policy
- **Last verified:** 2026-10-12
