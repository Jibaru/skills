# Sources

Every official page the aws-security rules cite, grouped by topic, so links can be re-found if
they move. All entries Last verified: 2026-10-12.

## IAM policies and evaluation

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html | IAM security best practices: temporary credentials, least privilege, managed policies, conditions, boundaries, Access Analyzer |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html | `iam:PassRole` scoping and `iam:PassedToService` |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html | Permissions boundaries, delegation with `iam:PermissionsBoundary` |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html | Cross-account `sts:ExternalId` and cross-service `aws:SourceArn`/`aws:SourceAccount`/`aws:SourceOrgID` |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html | Global condition keys (`aws:PrincipalArn`, `aws:PrincipalOrgID`, `aws:SecureTransport`) |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-single-vs-multi-valued-context-keys.html | `ForAllValues` true on missing keys; no set operators on single-valued keys |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_notaction.html | Risk of `NotAction` with `Allow` |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html | Access Analyzer policy validation |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-custom-policy-checks.html | `check-no-new-access`, `check-access-not-granted`, `check-no-public-access` |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html | Access Analyzer external access findings |
| https://aws.amazon.com/iam/access-analyzer/pricing/ | External access free; custom checks $0.0020/call; unused access $0.20/role-or-user/month |
| https://docs.aws.amazon.com/lambda/latest/dg/permissions-function-services.html | Lambda resource policies for services; S3 needs `aws:SourceAccount` |
| https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/identity-and-access-management.html | Serverless Lens: no shared function roles; API keys are not auth |
| https://docs.aws.amazon.com/cdk/v2/guide/permissions.html | CDK grants and permissions model |
| https://sst.dev/docs/linking/ | SST `link`: permissions plus encrypted injection, `Resource` import |
| https://docs.aws.amazon.com/securityhub/latest/userguide/iam-controls.html | Security Hub IAM.1, IAM.2, IAM.3, IAM.21 |

## Federation and SDK credentials

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html | GitHub OIDC role trust: `aud`, `sub` scoping; IAM rejects missing/wildcard-only `sub`; Cognito `aud` |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html | OIDC provider creation; thumbprints only as fallback to trusted CA library |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_openid_connect_provider | `thumbprint_list` optional and unused for GitHub |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.OidcProviderNative.html | Native OIDC provider construct vs custom-resource `OpenIdConnectProvider` |
| https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-iam/README.md | CDK recommends `OidcProviderNative` for new stacks |
| https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html | JS SDK v3 default credential provider chain |
| https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-gosdk.html | Go SDK v2 `LoadDefaultConfig`, chain order, static credentials warning, `NewCredentialsCache` |
| https://docs.aws.amazon.com/rolesanywhere/latest/userguide/introduction.html | IAM Roles Anywhere for workloads outside AWS |

## KMS

| URL | What it backs |
| --- | --- |
| https://aws.amazon.com/kms/pricing/ | $1/key/month, +$1 for first two rotations, $0.03/10k requests, 20k free requests |
| https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html | Automatic rotation (default 365 days, optional for CMKs), AWS managed keys yearly |
| https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-default.html | Account root statement, admins vs users, lockout risk |
| https://docs.aws.amazon.com/kms/latest/developerguide/conditions-kms.html | `kms:ViaService`, `kms:CallerAccount`, rotation-period conditions |
| https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html | Deletion waiting period and irreversibility |
| https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html | Encryption context |
| https://docs.aws.amazon.com/kms/latest/APIReference/API_Encrypt.html | 4,096-byte plaintext limit; context logged in plaintext |
| https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/introduction.html | AWS Encryption SDK for envelope encryption |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html | S3 Bucket Keys: up to 99% fewer KMS requests, context and CloudTrail changes |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key | `enable_key_rotation` default false, `rotation_period_in_days` 90–2560, `deletion_window_in_days` 7–30 (default 30), `bypass_policy_lockout_safety_check` |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kms.KeyProps.html | `enableKeyRotation` default false, `pendingWindow` 30 days, `RETAIN`, `defaultKeyPolicies` flag |
| https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-sqs/lib/queue.ts | CDK auto-creates a KMS key per queue for `QueueEncryption.KMS` |
| https://docs.aws.amazon.com/securityhub/latest/userguide/kms-controls.html | Security Hub KMS.1, KMS.2, KMS.3, KMS.4, KMS.5 |

## Secrets

| URL | What it backs |
| --- | --- |
| https://aws.amazon.com/secrets-manager/pricing/ | $0.40/secret/month, $0.05/10k API calls |
| https://aws.amazon.com/systems-manager/pricing/ | Parameter Store: standard free, advanced $0.05/month, higher throughput $0.05/10k |
| https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html | Standard 4 KB / 10,000 params vs advanced 8 KB / 100,000 |
| https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html | Caching, rotation, `BlockPublicPolicy`, CMK for cross-account, `kms:ViaService` |
| https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html | Rotation strategies and schedules |
| https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_cache-go.html | Go caching library, hourly default refresh |
| https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html | Extension (port 2773, 300 s TTL, 1,000 items) vs Powertools; rotation and TTL |
| https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html | Extension env vars, `X-Aws-Parameters-Secrets-Token`, SnapStart token caveat |
| https://docs.aws.amazon.com/powertools/typescript/latest/features/parameters/ | Powertools Parameters: 5 s default `maxAge`, `forceFetch`, `POWERTOOLS_PARAMETERS_MAX_AGE` |
| https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars-encryption.html | Env var encryption; Secrets Manager recommended over env vars for DB credentials |
| https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data-secrets.html | ECS `secrets` / `valueFrom` |
| https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html | RDS-managed master password in Secrets Manager |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance | `manage_master_user_password`, `password_wo`, `publicly_accessible` |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret_version | `secret_string_wo` / `secret_string_wo_version` |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/ephemeral-resources/secretsmanager_secret_version | Ephemeral secret read that never enters state |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret_policy | `block_public_policy` |
| https://developer.hashicorp.com/terraform/language/manage-sensitive-data/write-only | Write-only arguments (Terraform 1.11+), version arguments |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.SecretValue.html | `unsafePlainText`, `unsafeUnwrap` warnings |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstanceProps.html | Generated-secret default credentials; `publiclyAccessible` default tied to subnet type |
| https://sst.dev/docs/component/secret/ | `sst.Secret` storage, encrypted bundle, `sst secret set` |
| https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html | CloudWatch Logs data protection policies, `logs:Unmask` |
| https://docs.aws.amazon.com/securityhub/latest/userguide/secretsmanager-controls.html | Security Hub SecretsManager.1–.4 |
| https://docs.aws.amazon.com/securityhub/latest/userguide/ecs-controls.html | Security Hub ECS.2, ECS.8, ECS.16 |
| https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access_examples_cross.html | Cross-account secrets need a CMK; `aws/secretsmanager` cannot be used cross-account |
| https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_schedule.html | Rotation as often as every four hours |
| https://github.com/aws/aws-secretsmanager-caching-go/blob/master/secretcache/cache.go | Go cache `GetSecretStringWithContext`, `RefreshNowWithContext` |
| https://docs.aws.amazon.com/systems-manager/latest/userguide/what-is-a-parameter.html | Don't store sensitive data in `String`/`StringList`; use `SecureString` |
| https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ssm-parameter.html | CloudFormation (and so CDK) cannot create `SecureString` parameters |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter | `type`, `value_wo`/`value_wo_version`, `insecure_value` |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html | User data is not protected; don't store passwords or long-lived keys in it |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html | User data handling and visibility via `DescribeInstanceAttribute` |

## Public exposure

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html | Four BPA settings, defaults for new buckets, what counts as "public" |
| https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html | Object Ownership, ACLs disabled by default |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html | CloudFront OAC for S3 origins |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html | CloudFront OAC for Lambda function URL origins |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.BucketProps.html | `blockPublicAccess`, `enforceSSL` (default false), `bucketKeyEnabled`, auto-created KMS key |
| https://sst.dev/docs/component/aws/bucket/ | `access: "public" \| "cloudfront"`, `enforceHttps` default true |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules.html | Security group rules |
| https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html | Session Manager instead of SSH |
| https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html | Function URL `AWS_IAM` vs `NONE`; since Oct 2025 both `InvokeFunctionUrl` and `InvokeFunction` needed |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function_url | `authorization_type`; public permissions not removed on destroy |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission | `source_arn`, `source_account`, `function_url_auth_type`, `invoked_via_function_url`, `principal_org_id` |
| https://sst.dev/docs/component/aws/function/ | `url` default authorization `"none"`; `link`, `permissions` |
| https://sst.dev/docs/component/aws/router/ | Router `protection: "oac"` / `"oac-with-edge-signing"` for function URL origins |
| https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-access-control.html | HTTP API authorizers; configure one on every route |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route | `authorization_type` defaults to `NONE` |
| https://sst.dev/docs/component/aws/apigatewayv2/ | SST routes public by default; `auth` arg and `addAuthorizer` |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-new-instances.html | Require IMDSv2, account defaults, hop limit 2 for containers |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template | `http_tokens` default `optional` |
| https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.InstanceProps.html | `requireImdsv2` default false |
| https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ShareSnapshot.html | Sharing DB snapshots (public = `all`) |
| https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/sharingamis-intro.html | Sharing AMIs |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_snapshot | `shared_accounts = ["all"]` makes a snapshot public |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/eks_cluster | `endpoint_public_access`, `public_access_cidrs` |
| https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html | Full FSBP control list (S3, EC2, RDS, Lambda, APIGateway, Opensearch, Redshift, MSK, EKS, CloudFront, ELB…) |
| https://docs.aws.amazon.com/securityhub/latest/userguide/s3-controls.html | S3.1, S3.5, S3.8, S3.12 |
| https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html | EC2.1, EC2.8, EC2.9, EC2.18, EC2.19, EC2.170 |
| https://docs.aws.amazon.com/securityhub/latest/userguide/rds-controls.html | RDS.1, RDS.2, RDS.38, RDS.39, RDS.43, RDS.44, RDS.46 |
| https://docs.aws.amazon.com/securityhub/latest/userguide/lambda-controls.html | Lambda.1 |
| https://docs.aws.amazon.com/securityhub/latest/userguide/apigateway-controls.html | APIGateway.8 |
| https://docs.aws.amazon.com/securityhub/latest/userguide/appsync-controls.html | AppSync.5 |
| https://docs.aws.amazon.com/securityhub/latest/userguide/cognito-controls.html | Cognito.2 |

## Encryption in transit and detection baseline

| URL | What it backs |
| --- | --- |
| https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html | `rds.force_ssl` default 1 on PG 15+, 0 on ≤14; `sslmode=verify-full` |
| https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-ssl-connections.html | `require_secure_transport` for MySQL |
| https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html | RDS CA bundles and certificate verification |
| https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html | ElastiCache TLS |
| https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-viewers-to-cloudfront.html | Viewer protocol policy |
| https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html | ALB listeners and HTTP→HTTPS redirects |
| https://aws.amazon.com/cloudtrail/pricing/ | First management-event copy free; $2.00/100k extra copies; $0.10/100k data events |
| https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-trail-security-best-practices.html | Trail best practices |
| https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html | Log file integrity validation |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudtrail | `is_multi_region_trail` and `enable_log_file_validation` default false |
| https://docs.aws.amazon.com/securityhub/latest/userguide/cloudtrail-controls.html | CloudTrail.1, .2, .4 |
| https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html | GuardDuty overview |
| https://aws.amazon.com/guardduty/pricing/ | GuardDuty pricing per protection plan |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/guardduty_detector_feature | Feature names (`S3_DATA_EVENTS`, `LAMBDA_NETWORK_LOGS`, `RDS_LOGIN_EVENTS`, `RUNTIME_MONITORING`, …) |
| https://docs.aws.amazon.com/securityhub/latest/userguide/guardduty-controls.html | GuardDuty.1 and feature controls |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/securityhub_account | `enable_default_standards` default true, `control_finding_generator` |
| https://aws.amazon.com/security-hub/pricing/ | Security Hub CSPM pricing |
| https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/accessanalyzer_analyzer | Analyzer `type` values |
