# Public exposure: data stores, endpoints and network entry points

What the internet (or any AWS account) can reach. Resource-policy wildcards in general are
IAM-009; this file covers the service-specific switches. Network design (subnets, NAT, load
balancers, WAF) belongs to aws-networking; bucket configuration beyond public access belongs to
aws-storage.

### EXP-001 — Keep S3 Block Public Access fully on; serve public content through CloudFront
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** All four Block Public Access settings stay `true` on every bucket (and at account level); public websites and assets go through CloudFront with Origin Access Control, not a public bucket.
- **Why:** New buckets block public access by default, so turning a setting off is a deliberate step that, combined with any public policy or ACL, publishes every object, including future uploads and misplaced exports. Removing BPA later re-exposes whatever public policy was already there. Security Hub S3.1/S3.8.
- **Detect:** Terraform `aws_s3_bucket_public_access_block` / `aws_s3_account_public_access_block` with any of `block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets` = `false`; CDK `publicReadAccess: true`, `blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS` (policies allowed) or `new s3.BlockPublicAccess({ blockPublicPolicy: false ... })`, `bucket.grantPublicAccess()`; SST `new sst.aws.Bucket("X", { access: "public" })`.
- **Fix:** SST `access: "cloudfront"` (or `sst.aws.StaticSite`/`Router`); CDK `blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL` plus `cloudfront.Distribution` with `origins.S3BucketOrigin.withOriginAccessControl(bucket)`; Terraform all four flags `true` and `aws_cloudfront_origin_access_control`. Hand off bucket-level details to aws-storage.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html ; https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html ; https://sst.dev/docs/component/aws/bucket/
- **Last verified:** 2026-10-12

### EXP-002 — Disable S3 ACLs (BucketOwnerEnforced) and drop public canned ACLs
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, TypeScript, Go
- **Rule:** Buckets use Object Ownership `BucketOwnerEnforced` (the default for new buckets); code and IaC never set `public-read`/`public-read-write`/`authenticated-read` ACLs.
- **Why:** ACLs grant access outside bucket policies and IAM, are easy to miss in review, and `authenticated-read` means any AWS account. Security Hub S3.12.
- **Detect:** Terraform `aws_s3_bucket_acl` with `acl = "public-read"` etc., `aws_s3_bucket_ownership_controls` with `object_ownership = "BucketOwnerPreferred"` / `"ObjectWriter"`; CDK `objectOwnership: s3.ObjectOwnership.OBJECT_WRITER`/`BUCKET_OWNER_PREFERRED`, `accessControl: s3.BucketAccessControl.PUBLIC_READ`; TS `new PutObjectCommand({ ACL: 'public-read' })`; Go `ACL: types.ObjectCannedACLPublicRead`.
- **Fix:** Remove ACL settings; `object_ownership = "BucketOwnerEnforced"`; grant access with bucket policies or CloudFront OAC.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/s3-controls.html
- **Last verified:** 2026-10-12

### EXP-003 — No 0.0.0.0/0 or ::/0 ingress except on intended public web ports
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Security group ingress from `0.0.0.0/0` or `::/0` is allowed only on 80/443 of internet-facing load balancers or CloudFront-fronted origins; never on SSH/RDP, database, cache, broker or admin ports, and never "all ports".
- **Why:** Open 22/3389/5432/3306/6379/9200/27017 ports are scanned continuously; one weak credential or unpatched service gives remote access. IPv6 `::/0` rules are often forgotten next to a tightened IPv4 rule. Security Hub EC2.18/EC2.19.
- **Detect:** Terraform `aws_security_group` `ingress { cidr_blocks = ["0.0.0.0/0"] }` or `ipv6_cidr_blocks = ["::/0"]`, `aws_vpc_security_group_ingress_rule` with `cidr_ipv4 = "0.0.0.0/0"` / `cidr_ipv6 = "::/0"`, `aws_security_group_rule type = "ingress"`; `from_port = 0, to_port = 0/65535, protocol = "-1"`; CDK `sg.addIngressRule(ec2.Peer.anyIpv4(), ...)`, `ec2.Peer.anyIpv6()`, `connections.allowFromAnyIpv4(`, `ec2.Port.allTraffic()`.
- **Fix:** Reference the source security group (`referenced_security_group_id` / `ec2.Peer.securityGroupId()` / `db.connections.allowDefaultPortFrom(fn)`); use SSM Session Manager instead of SSH. Hand off network layout to aws-networking.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html ; https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules.html ; https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
- **Last verified:** 2026-10-12

### EXP-004 — Keep databases off the internet
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** RDS instances and Aurora cluster instances stay `publicly_accessible = false` in private subnets; in CDK do not place them in `SubnetType.PUBLIC`, which flips the default to public.
- **Why:** A public endpoint plus a permissive security group exposes the database login to the internet; credential stuffing or an engine CVE becomes data theft. In CDK, `publiclyAccessible` defaults to `true` when `vpcSubnets` selects public subnets. Security Hub RDS.2/RDS.46.
- **Detect:** Terraform `aws_db_instance` / `aws_rds_cluster_instance` with `publicly_accessible = true`, `db_subnet_group_name` pointing at public subnets; CDK `publiclyAccessible: true`, `vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }` on `rds.DatabaseInstance`/`DatabaseCluster`.
- **Fix:** `publicly_accessible = false`, private subnet group; CDK `vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED }`. Reach it from laptops via SSM port forwarding or RDS Data API/Proxy.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/rds-controls.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html
- **Last verified:** 2026-10-12

### EXP-005 — Do not expose Lambda function URLs with auth NONE unless the handler authenticates
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Function URLs use `AWS_IAM` (fronted by CloudFront OAC for browser traffic); `NONE` is acceptable only for intentionally public endpoints whose handler verifies a signature or token before doing work.
- **Why:** With `NONE`, anyone who finds the URL can invoke the function: data access, cost (each call bills duration) and abuse. SST `url: true` defaults to `authorization: "none"`. Terraform adds the public `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` statements on create and does not remove them on destroy.
- **Detect:** Terraform `aws_lambda_function_url` with `authorization_type = "NONE"`; CDK `fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE })` (CDK's default is `AWS_IAM`); SST `url: true` or `url: { authorization: "none" }`. Then open the handler: no check of a signature header (`stripe-signature`, `x-hub-signature-256`), JWT or HMAC before side effects.
- **Fix:** SST: route the function through `sst.aws.Router` with `protection: "oac"` (or `"oac-with-edge-signing"` when clients POST bodies without an `x-amz-content-sha256` header); CDK `authType: FunctionUrlAuthType.AWS_IAM` + CloudFront `FunctionUrlOrigin.withOriginAccessControl(fnUrl)`; for webhooks keep `NONE` but verify the provider signature first and return 401 otherwise.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function_url ; https://sst.dev/docs/component/aws/function/ ; https://sst.dev/docs/component/aws/router/ ; https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
- **Last verified:** 2026-10-12

### EXP-006 — Put an authorizer on every non-public API route
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every API Gateway route or method that is not deliberately public has IAM, JWT/Cognito or Lambda authorization, either on the route or as the API's default.
- **Why:** HTTP API routes, REST methods and SST routes default to no auth, so a new `POST /admin/...` route ships open unless someone remembers. Security Hub APIGateway.8.
- **Detect:** Terraform `aws_apigatewayv2_route` without `authorization_type` (defaults to `NONE`) or with `"NONE"`; `aws_api_gateway_method` with `authorization = "NONE"`; CDK `new apigwv2.HttpApi(` without `defaultAuthorizer` and `addRoutes({ ... })` without `authorizer`, `new apigw.RestApi(` without `defaultMethodOptions.authorizationType`; SST `api.route("POST /admin/users", ...)` with no `auth` arg. Prioritise routes with write verbs or admin/internal paths.
- **Fix:** SST:
  ```ts
  const auth = api.addAuthorizer({ name: "jwt", jwt: { issuer, audiences: [clientId] } });
  api.route("POST /admin/users", "src/admin.handler", { auth: { jwt: { authorizer: auth.id } } });
  ```
  CDK `new apigwv2.HttpApi(this, 'Api', { defaultAuthorizer: new HttpJwtAuthorizer('jwt', issuer, { jwtAudience: [clientId] }) })`, and opt public routes out explicitly with `HttpNoneAuthorizer`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-access-control.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/apigateway-controls.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route ; https://sst.dev/docs/component/aws/apigatewayv2/
- **Last verified:** 2026-10-12

### EXP-007 — Do not treat API keys as authentication
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK, SST
- **Rule:** REST API usage-plan keys (`api_key_required`) and AppSync `API_KEY` mode are for metering or public read APIs, not for protecting private data or writes.
- **Why:** API keys are static, shared, travel in headers that end up in browser bundles and logs, and identify no user; the Serverless Lens states API keys are not a security mechanism. Security Hub AppSync.5.
- **Detect:** Terraform `aws_api_gateway_method` with `api_key_required = true` and `authorization = "NONE"` on non-public operations; `aws_appsync_graphql_api` `authentication_type = "API_KEY"` for user data; CDK `apiKeyRequired: true` without an authorizer, `appsync.AuthorizationType.API_KEY` as default auth.
- **Fix:** Add a Cognito/JWT, IAM or Lambda authorizer; keep the API key only for throttling per client.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/identity-and-access-management.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/appsync-controls.html
- **Last verified:** 2026-10-12

### EXP-008 — Require IMDSv2 on instances and launch templates
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** EC2 instances, launch templates and Auto Scaling configurations set `http_tokens = "required"`; hop limit 2 only where containers on the host need metadata.
- **Why:** IMDSv1 answers unauthenticated GETs, so an SSRF bug in any app on the instance returns the instance role's credentials. Terraform's launch template default is `optional`; CDK's `requireImdsv2` defaults to `false`. Security Hub EC2.8/EC2.170/AutoScaling.3.
- **Detect:** Terraform `aws_instance` / `aws_launch_template` without `metadata_options { http_tokens = "required" }` (or with `"optional"`); CDK `new ec2.Instance(` / `new ec2.LaunchTemplate(` without `requireImdsv2: true` and no `InstanceRequireImdsv2Aspect` / `LaunchTemplateRequireImdsv2Aspect`.
- **Fix:** Terraform `metadata_options { http_endpoint = "enabled" http_tokens = "required" }`; CDK `requireImdsv2: true` or `Aspects.of(app).add(new ec2.InstanceRequireImdsv2Aspect())`; account-wide, set the IMDS default to V2 only.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-new-instances.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.InstanceProps.html
- **Last verified:** 2026-10-12

### EXP-009 — Do not assign public IPs to workloads that do not serve the internet directly
- **Severity:** medium
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Instances, ECS services and task sets stay without public IPs; inbound traffic arrives through a load balancer or CloudFront, outbound through NAT or VPC endpoints.
- **Why:** A public IP turns any security-group mistake (EXP-003) into internet exposure. Security Hub EC2.9, ECS.2, ECS.16.
- **Detect:** Terraform `associate_public_ip_address = true` on `aws_instance`/launch templates, `aws_subnet` `map_public_ip_on_launch = true` for app subnets, `aws_ecs_service` `network_configuration { assign_public_ip = true }`; CDK `assignPublicIp: true`, `associatePublicIpAddress: true`, `vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }` for services.
- **Fix:** Private subnets and `assign_public_ip = false`; hand off NAT vs endpoint cost to aws-networking.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/ecs-controls.html
- **Last verified:** 2026-10-12

### EXP-010 — Never share snapshots or AMIs publicly
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** RDS/Aurora snapshots, EBS snapshots and AMIs are shared only with named account IDs, never with `all`.
- **Why:** A public DB or EBS snapshot is a full copy of the data that any AWS account can restore; AMIs routinely carry baked-in keys and config. Security Hub RDS.1, EC2.1.
- **Detect:** Terraform `aws_db_snapshot` / `aws_db_cluster_snapshot` with `shared_accounts = ["all"]`; `aws_ami_launch_permission` with `group = "all"`; scripts calling `ModifyDBSnapshotAttribute` with `ValuesToAdd: ['all']` or `ModifySnapshotAttribute` with `GroupNames: ['all']`.
- **Fix:** Share with explicit account IDs (encrypted with a CMK the target can use); turn on EBS snapshot block public access at account level.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ShareSnapshot.html ; https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/sharingamis-intro.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_snapshot
- **Last verified:** 2026-10-12

### EXP-011 — Keep other data services private (OpenSearch, Redshift, MSK, EKS API)
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** OpenSearch domains run in a VPC (or with fine-grained access and no `*` access policy), Redshift and Redshift Serverless are not publicly accessible, MSK public access stays `DISABLED`, and EKS API endpoints are private or limited by `public_access_cidrs`.
- **Why:** These services hold data or control planes; a public endpoint with weak auth (open OpenSearch access policy, default admin user) leaks indexes or clusters. Security Hub Opensearch.2, Redshift.1, MSK.4, EKS.1.
- **Detect:** Terraform `aws_opensearch_domain` without `vpc_options` and with `access_policies` granting `"AWS": "*"`; `aws_redshift_cluster` `publicly_accessible = true`; `aws_msk_cluster` `public_access { type = "SERVICE_PROVIDED_EIPS" }`; `aws_eks_cluster` `vpc_config { endpoint_public_access = true }` without `public_access_cidrs` (the default is public); CDK `opensearch.Domain` without `vpc`, `eks.Cluster` with `endpointAccess: eks.EndpointAccess.PUBLIC`.
- **Fix:** VPC placement and named principals; EKS `endpoint_private_access = true`, `endpoint_public_access = false` (or CIDR-restricted).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/eks_cluster
- **Last verified:** 2026-10-12

### EXP-012 — Do not hand broad roles to unauthenticated Cognito identities
- **Severity:** high
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** Identity pools allow unauthenticated identities only when the unauthenticated role is narrowly scoped (for example, `PutEvents` to one analytics stream); the role trust policy checks `cognito-identity.amazonaws.com:aud` and `amr`.
- **Why:** Anyone can mint guest credentials from a public identity pool ID found in the web bundle; whatever the guest role allows, the internet can do. Without the `aud` condition, identities from other pools can assume the role. Security Hub Cognito.2.
- **Detect:** Terraform `aws_cognito_identity_pool` `allow_unauthenticated_identities = true` with an `unauthenticated` role carrying S3/DynamoDB/`*` actions; role trust for `cognito-identity.amazonaws.com` without `cognito-identity.amazonaws.com:aud`; CDK `allowUnauthenticatedIdentities: true`.
- **Fix:** Set it to `false`, or scope the guest role to the single action needed and add `StringEquals cognito-identity.amazonaws.com:aud = <pool id>`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html ; https://docs.aws.amazon.com/securityhub/latest/userguide/cognito-controls.html
- **Last verified:** 2026-10-12

### EXP-013 — Restrict who can invoke functions through resource policies
- **Severity:** critical
- **Category:** security
- **Applies to:** Terraform, CDK
- **Rule:** `lambda:InvokeFunction` permissions with principal `*` must carry `lambda:InvokedViaFunctionUrl` (function URL case) or a source condition; never grant public invoke on the plain function.
- **Why:** A public invoke permission lets any AWS account call the function directly with arbitrary payloads, bypassing API Gateway auth and throttling. Security Hub Lambda.1.
- **Detect:** Terraform `aws_lambda_permission` with `principal = "*"` and none of `function_url_auth_type` (for `lambda:InvokeFunctionUrl`), `invoked_via_function_url = true` (for `lambda:InvokeFunction`), `source_arn` or `principal_org_id`; CDK `fn.grantInvoke(new iam.AnyPrincipal())`, `fn.addPermission('x', { principal: new iam.StarPrincipal() })`.
- **Fix:** Name the caller (`principal = "apigateway.amazonaws.com"` with `source_arn = "${aws_apigatewayv2_api.api.execution_arn}/*/*"`), or `principal_org_id` for org-internal callers.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/securityhub/latest/userguide/lambda-controls.html ; https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission
- **Last verified:** 2026-10-12
