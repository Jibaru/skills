# AWS CDK v2 (TypeScript)

Rules CDK-001 – CDK-023. Current at verification: `aws-cdk-lib` 2.27x, CDK CLI with
`cdk refactor` in preview. CDK deploys through CloudFormation, so "replacement" below means a
CloudFormation resource replacement (create new, then delete old).

---

### CDK-001 — Do not let production data stores be destroyed with the stack
- **Severity:** critical
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** Stateful resources (tables, buckets with data, databases, user pools, KMS keys, ECR repos, EFS) keep the default `RETAIN`/`SNAPSHOT` in production; `RemovalPolicy.DESTROY` and `autoDeleteObjects: true` are allowed only when gated to non-production stages.
- **Why:** CDK's default is to retain, the opposite of CloudFormation's. Flipping it to `DESTROY` unconditionally means a `cdk destroy`, a stack rename or a logical ID change (CDK-003) deletes the table or empties and deletes the bucket in prod.
- **Detect:** `removalPolicy: RemovalPolicy.DESTROY` / `cdk.RemovalPolicy.DESTROY` / `applyRemovalPolicy(RemovalPolicy.DESTROY)` / `RemovalPolicies.of(...).destroy()` / `autoDeleteObjects: true` on `dynamodb.Table`, `dynamodb.TableV2`, `s3.Bucket`, `rds.DatabaseInstance`, `rds.DatabaseCluster`, `cognito.UserPool`, `kms.Key`, `ecr.Repository`, `efs.FileSystem`, `logs.LogGroup` holding audit logs, with no stage condition around it; the same stack class instantiated for prod.
- **Fix:**
  ```ts
  const isProd = props.stage === 'prod';
  new dynamodb.TableV2(this, 'Orders', {
    partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
    removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    deletionProtection: isProd,
  });
  // or scope-wide for ephemeral stacks only:
  if (!isProd) RemovalPolicies.of(this).destroy();
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/resources.html , https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
- **Last verified:** 2026-10-12

### CDK-002 — Pair `DESTROY` on a bucket with `autoDeleteObjects` in throwaway stacks
- **Severity:** low
- **Category:** bug
- **Applies to:** CDK
- **Rule:** A non-production `s3.Bucket` with `removalPolicy: DESTROY` also sets `autoDeleteObjects: true`, or the stack teardown is expected to fail.
- **Why:** CloudFormation will not delete a non-empty bucket even with `DESTROY`; `cdk destroy` of a PR or dev stack ends in `DELETE_FAILED` and the stack name stays blocked until someone empties the bucket by hand.
- **Detect:** `new s3.Bucket(` with `RemovalPolicy.DESTROY` and no `autoDeleteObjects`, in stacks for ephemeral or dev stages.
- **Fix:** `new s3.Bucket(this, 'Uploads', { removalPolicy: RemovalPolicy.DESTROY, autoDeleteObjects: true })` behind the non-prod condition of CDK-001.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/resources.html
- **Last verified:** 2026-10-12

### CDK-003 — Never change the construct ID or tree path of a deployed stateful resource
- **Severity:** critical
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** Renaming a construct ID, wrapping a resource in a new construct, or moving it to another stack changes its logical ID; for stateful resources keep the logical ID (inner ID `Default`, `overrideLogicalId`) or run `cdk refactor` as a separate deployment.
- **Why:** CloudFormation tracks resources by logical ID; a new ID means create-new then delete-old, which for a table or bucket with `DESTROY` loses the data and with `RETAIN` orphans it and fails on the name conflict.
- **Detect:** in a diff, the second argument of `new <Construct>(this, '<id>'` changed for a stateful construct; a stateful construct moved into a new `extends Construct` class with an ID other than `'Default'`; a resource moved between `Stack`s; `cdk diff` showing `[-]` and `[+]` of the same resource type with similar properties.
- **Fix:**
  ```ts
  class OrdersStore extends Construct {
    constructor(scope: Construct, id: string) {
      super(scope, id);
      new dynamodb.TableV2(this, 'Default', { /* ... */ }); // 'Default' keeps the old logical ID
    }
  }
  new OrdersStore(this, 'Orders'); // same id the table had before
  ```
  Or: ship the code move alone and run `cdk refactor --unstable=refactor` before `cdk deploy`. Add a unit test asserting the logical IDs of stateful resources.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/identifiers.html , https://docs.aws.amazon.com/cdk/v2/guide/refactor.html , https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
- **Last verified:** 2026-10-12

### CDK-004 — Derive construct IDs from stable keys, not loop indexes or volatile data
- **Severity:** high
- **Category:** bug
- **Applies to:** CDK
- **Rule:** Constructs created in a loop use an ID from a stable, unique key of the item (`queue.name`), never the array index, a timestamp or a value that changes between synths.
- **Why:** Inserting an item at the head of the list renumbers every following construct, so CloudFormation replaces all of them; `Date.now()` in an ID replaces the resource on every deploy.
- **Detect:** `` new X(this, `Queue${i}` `` or `'Queue' + index` inside `forEach((_, i) =>`/`for (let i`; `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()` in construct IDs.
- **Fix:** `for (const q of queues) new sqs.Queue(this, `Queue-${q.name}`, { ... })`; keep the old index-based IDs for already-deployed items or migrate with `cdk refactor`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/identifiers.html
- **Last verified:** 2026-10-12

### CDK-005 — Let CDK generate physical names
- **Severity:** medium
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** Omit `tableName`, `bucketName`, `functionName`, `roleName`, `queueName`, `clusterIdentifier` unless an external system needs a fixed name; pass `table.tableName` etc. to consumers.
- **Why:** A fixed name blocks every replacement-forcing change (CloudFormation cannot create the new resource while the old one holds the name), and the same stack cannot be deployed twice in one account (PR stacks, a second region).
- **Detect:** `tableName: '`, `bucketName: '`, `functionName: '`, `roleName: '`, `queueName: '`, `topicName: '` literals or templates in L2 props.
- **Fix:** drop the prop and wire `environment: { ORDERS_TABLE: table.tableName }`; if a name is needed, include the stage and keep it off resources whose immutable properties may change.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
- **Last verified:** 2026-10-12

### CDK-006 — Avoid strong cross-stack references that deadlock deploys
- **Severity:** high
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** When stacks in the same app share resources, make references weak (`"@aws-cdk/core:defaultCrossStackReferences": "weak"` in `cdk.json`, or `CrossStackReferences.of(resource).produce(ReferenceStrength.WEAK)`), or pass values through SSM; do not rely on default exports for resources you may remove or move.
- **Why:** A strong reference creates an `Fn::ImportValue`; CloudFormation refuses to delete an export in use, and the consumer cannot stop importing until the export exists ("Export ... cannot be deleted as it is in use by ..."). Removing or moving the shared resource then needs a multi-deploy dance under pressure.
- **Detect:** a stack constructor receiving another stack's construct (`props.table`, `props.bucket`, `props.vpc`) and using it, with no `defaultCrossStackReferences` context key; `Fn.importValue(`; `exportValue(`; cdk diff showing `Outputs` `ExportsOutputRef...`.
- **Fix:**
  ```json
  { "context": { "@aws-cdk/core:defaultCrossStackReferences": "weak" } }
  ```
  For existing strong references, migrate via the transitional `BOTH` strength, deploy both stacks, then switch to `WEAK`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/resources.html
- **Last verified:** 2026-10-12

### CDK-007 — Turn on termination protection for production and stateful stacks
- **Severity:** medium
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** Production stacks, and every stack holding stateful resources, set `terminationProtection: true`; keep stateful resources in their own stack.
- **Why:** `cdk destroy` or a mistaken pipeline step deletes the whole stack; with retained resources the data survives but everything else (and every name) is gone, and with `DESTROY` the data goes too.
- **Detect:** `new <X>Stack(app, '...Prod...'` or stacks with `Table`/`DatabaseCluster`/`Bucket` and no `terminationProtection: true`.
- **Fix:** `new DataStack(app, 'Data-prod', { env: prodEnv, terminationProtection: true })`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html , https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib-readme.html
- **Last verified:** 2026-10-12

### CDK-008 — Give production stacks an explicit environment
- **Severity:** medium
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** Production stacks set `env: { account: '<id>', region: '<region>' }` with literals (or config committed to the repo); `CDK_DEFAULT_ACCOUNT`/`CDK_DEFAULT_REGION` and env-agnostic stacks are for development.
- **Why:** With `CDK_DEFAULT_*` the template depends on whoever runs synth, so a prod deploy from a misconfigured profile targets the wrong account. Env-agnostic stacks cannot use `fromLookup` and see only two AZs, so a VPC silently gets two AZs instead of three.
- **Detect:** prod stack instantiations with `account: process.env.CDK_DEFAULT_ACCOUNT` or with no `env`; `Vpc.fromLookup`/`HostedZone.fromLookup` in stacks without `env`; `if (this.region === ...)` in env-agnostic stacks.
- **Fix:**
  ```ts
  const prod = { account: '123456789012', region: 'us-east-1' };
  new ApiStack(app, 'Api-prod', { env: prod, stage: 'prod' });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/configure-env.html
- **Last verified:** 2026-10-12

### CDK-009 — Keep synthesis deterministic
- **Severity:** medium
- **Category:** reliability
- **Applies to:** CDK, TypeScript
- **Rule:** Commit `cdk.json` and `cdk.context.json`; make no AWS SDK or network calls during synth; read `process.env` only in `bin/` and pass values down as props.
- **Why:** Without the cached context, a new AZ or a new AMI changes the template months later and replaces subnets or instances "for no reason"; SDK calls in synth make every `cdk synth` depend on credentials and on live values.
- **Detect:** `cdk.context.json` in `.gitignore` or missing while `fromLookup`/`availabilityZones`/`MachineImage.lookup` are used; `@aws-sdk/client-*` imported in `lib/**`; `process.env.` inside `lib/**` constructs or stacks; `cdk context --clear` in CI.
- **Fix:** commit both files, refresh a single entry with `cdk context --reset <key>` in a reviewed PR, move SDK lookups to a script that writes a committed file, and accept configuration as props.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html , https://docs.aws.amazon.com/cdk/v2/guide/context.html
- **Last verified:** 2026-10-12

### CDK-010 — Set `runtime` on every `NodejsFunction`
- **Severity:** high
- **Category:** bug
- **Applies to:** CDK
- **Rule:** `NodejsFunction` (and `lambda.Function`) specify `runtime` explicitly with a supported Node.js runtime, unless `cdk.json` enables `@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion` and you accept `NODEJS_LATEST` moving under you.
- **Why:** Without the feature flag the default runtime is `NODEJS_16_X`, deprecated since 2024-06-12 (no security patches; Lambda blocks function create from 2027-07-29 and update from 2027-08-31, after which deploys fail). With `NODEJS_LATEST` the major version changes on a CDK upgrade with no code review.
- **Detect:** `new NodejsFunction(this, '...', {` (or `new nodejs.NodejsFunction`) with no `runtime:`, and `cdk.json` without `"@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion": true`; `Runtime.NODEJS_16_X`, `NODEJS_18_X`, `NODEJS_20_X` (all deprecated by 2026-04-30) anywhere; `NODEJS_22_X` is deprecated 2027-04-30.
- **Fix:** `new NodejsFunction(this, 'Api', { entry: 'src/api.ts', runtime: Runtime.NODEJS_24_X, architecture: Architecture.ARM_64 })`. Runtime lifecycle details → `aws-compute`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html , https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
- **Last verified:** 2026-10-12

### CDK-011 — Choose deliberately whether the AWS SDK is bundled
- **Severity:** low
- **Category:** reliability
- **Applies to:** CDK, TypeScript
- **Rule:** For `NodejsFunction` on an explicit Node 18+ runtime, `@aws-sdk/*` is excluded from the bundle and the runtime's SDK is used; set `bundling: { bundleAwsSDK: true }` when code needs SDK features newer than the runtime's copy, or when you want the version in `package-lock.json` to be the one that runs.
- **Why:** Code tested against the lock-file SDK runs against an older runtime SDK in Lambda; new commands or parameters fail only in production. Lambda recommends packaging the SDK you depend on.
- **Detect:** `NodejsFunction` with `runtime: Runtime.NODEJS_2x_X` and no `bundling.bundleAwsSDK`, while `package.json` pins a recent `@aws-sdk/client-*` and code uses recently added commands or parameters; `externalModules: ['@aws-sdk/*']` set by hand.
- **Fix:** `bundling: { bundleAwsSDK: true, minify: true }` (cold-start trade-offs → `aws-compute`).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html , https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
- **Last verified:** 2026-10-12

### CDK-012 — Never put secret values into the template
- **Severity:** critical
- **Category:** security
- **Applies to:** CDK
- **Rule:** Do not use `SecretValue.unsafePlainText(...)`, `secret.secretValue.unsafeUnwrap()` or `secretValueFromJson(...).unsafeUnwrap()` to feed environment variables or plain-string props; reference the secret and grant read, or pass it to props typed `SecretValue`.
- **Why:** `unsafePlainText` writes the literal into the CloudFormation template (kept in `cdk.out`, the bootstrap bucket and the console). `unsafeUnwrap()` on a Secrets Manager or SSM value writes a dynamic reference into the template, which CloudFormation resolves at deploy into the Lambda environment in plaintext, readable by anyone with `lambda:GetFunctionConfiguration`; the value also goes stale after rotation until something forces CloudFormation to re-read it.
- **Detect:** `unsafePlainText(`, `.unsafeUnwrap()`; `environment: { ...: <secret>.secretValue....unsafeUnwrap() }`; `secretValueFromJson(...).unsafeUnwrap()`. (A `SecretValue` used in a plain string context without `unsafeUnwrap()` fails synth, so it is not a finding.)
- **Fix:**
  ```ts
  const stripe = secretsmanager.Secret.fromSecretNameV2(this, 'Stripe', 'prod/stripe');
  stripe.grantRead(fn);
  fn.addEnvironment('STRIPE_SECRET_ARN', stripe.secretArn); // code fetches and caches it
  ```
  Retrieval and caching in code → `aws-security`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib-readme.html
- **Last verified:** 2026-10-12

### CDK-013 — Use grants instead of hand-written policy statements
- **Severity:** medium
- **Category:** simplicity
- **Applies to:** CDK
- **Rule:** Wire permissions with `resource.grant*()` / `resource.grants.*` (or `XGrants.fromX(cfnResource)` on L1s) rather than `addToRolePolicy(new PolicyStatement({ actions: [...], resources: ['*'] }))`.
- **Why:** Hand-written statements drift from what the code calls, default to `resources: ['*']`, and miss companion permissions (KMS decrypt for an encrypted table); grants produce the minimal set and follow the resource when it is replaced.
- **Detect:** `addToRolePolicy(new iam.PolicyStatement(` or `addToPolicy(` with `dynamodb:`, `s3:`, `sqs:`, `sns:`, `secretsmanager:` actions for resources defined in the same app; `resources: ['*']`.
- **Fix:** `table.grantReadWriteData(fn); bucket.grantRead(fn); queue.grantSendMessages(fn);`. Policy breadth itself → `aws-security`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html , https://docs.aws.amazon.com/cdk/v2/guide/cfn-layer.html
- **Last verified:** 2026-10-12

### CDK-014 — Run cdk-nag and keep suppressions narrow and justified
- **Severity:** medium
- **Category:** security
- **Applies to:** CDK
- **Rule:** Apply a rule pack (`Aspects.of(app).add(new AwsSolutionsChecks())`) so synth fails on violations; suppress per resource with a specific `reason`, not stack-wide blanket suppressions.
- **Why:** Without a gate, missing encryption, public access or wildcard IAM reach prod unnoticed; stack-wide suppressions silence the rule for every future resource too.
- **Detect:** CDK app with no `cdk-nag` dependency or no `AwsSolutionsChecks` aspect; `NagSuppressions.addStackSuppressions(` covering `AwsSolutions-IAM5`/`-S1`/etc.; suppressions with empty or generic `reason` ("not needed").
- **Fix:**
  ```ts
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
  NagSuppressions.addResourceSuppressions(fn.role!, [
    { id: 'AwsSolutions-IAM4', reason: 'AWSLambdaBasicExecutionRole is the AWS-managed log-only policy' },
  ], true);
  ```
- **Volatile:** no
- **Source:** https://aws.amazon.com/blogs/devops/manage-application-security-and-compliance-with-the-aws-cloud-development-kit-and-cdk-nag/ , https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/check-aws-cdk-applications-or-cloudformation-templates-for-best-practices-by-using-cdk-nag-rule-packs.html
- **Last verified:** 2026-10-12

### CDK-015 — Order aspects: mutate first, validate last
- **Severity:** low
- **Category:** bug
- **Applies to:** CDK
- **Rule:** Aspects that change the tree use `{ priority: AspectPriority.MUTATING }`; validators (cdk-nag, custom checks) use `AspectPriority.READONLY`.
- **Why:** Aspects with equal priority run in no guaranteed order, so a validator can pass a tree that a later mutating aspect changes (or flag something a mutator would have fixed), and the result flips between synths.
- **Detect:** `Aspects.of(...).add(new <Mutating>())` and `Aspects.of(...).add(new AwsSolutionsChecks())` both without `priority`; custom `IAspect` that sets properties in `visit()` with no priority.
- **Fix:** `Aspects.of(app).add(new EnforceTags(), { priority: AspectPriority.MUTATING }); Aspects.of(app).add(new AwsSolutionsChecks(), { priority: AspectPriority.READONLY });`
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib-readme.html
- **Last verified:** 2026-10-12

### CDK-016 — Give Lambda logs an explicit log group instead of `logRetention`
- **Severity:** medium
- **Category:** cost
- **Applies to:** CDK
- **Rule:** Create a `logs.LogGroup` with `retention` and pass it as `logGroup`, instead of the legacy `logRetention` prop (implemented with a custom resource) or leaving the default.
- **Why:** With neither prop, Lambda creates the group on first invoke with never-expire retention outside the stack: logs accumulate forever and are orphaned on stack deletion. `logRetention` adds a custom-resource Lambda per stack and cannot be fully managed.
- **Detect:** `logRetention:` on `lambda.Function`/`NodejsFunction`; functions with neither `logRetention` nor `logGroup` and no `@aws-cdk/aws-lambda:useCdkManagedLogGroup` flag in `cdk.json`.
- **Fix:**
  ```ts
  const logGroup = new logs.LogGroup(this, 'ApiLogs', { retention: logs.RetentionDays.ONE_MONTH });
  new NodejsFunction(this, 'Api', { entry: 'src/api.ts', runtime: Runtime.NODEJS_24_X, logGroup });
  ```
  Retention value per workload → `aws-observability`; cost math → `aws-cost`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda-readme.html , https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
- **Last verified:** 2026-10-12

### CDK-017 — Prefer typed props over raw overrides
- **Severity:** low
- **Category:** readability
- **Applies to:** CDK
- **Rule:** Reach for L2 props, Mixins/Facades on L1s, or typed L1 properties via `node.defaultChild as CfnX` before `addOverride`/`addPropertyOverride`.
- **Why:** Raw overrides bypass all typing: a misspelled or wrong-case path (`Properties.versioningConfiguration`) synthesizes fine and fails only at deploy, or overrides something the L2 later relies on.
- **Detect:** `addOverride('Properties.`, `addPropertyOverride(`, `addPropertyDeletionOverride(` where the CfnX class already exposes the property.
- **Fix:** `(bucket.node.defaultChild as s3.CfnBucket).analyticsConfigurations = [...]`; keep raw overrides for properties the L1 truly lacks, with a comment linking the CloudFormation property.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/cfn-layer.html
- **Last verified:** 2026-10-12

### CDK-018 — Keep development-only deploy modes out of production pipelines
- **Severity:** high
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** Production deploy scripts never use `--hotswap`, `--hotswap-fallback`, `--watch`, `--express`, `--no-rollback`, or `--require-approval never` without another approval gate.
- **Why:** Hotswap deliberately introduces drift (it updates Lambda/ECS/Step Functions through service APIs, skipping CloudFormation, and sets ECS minimum healthy percent to 0); express mode reports success before resources stabilize and does not roll back; `--no-rollback` leaves a half-applied stack.
- **Detect:** `cdk deploy` lines in `package.json` scripts, `Makefile`, `.github/workflows/*.yml`, `buildspec.yml` with those flags and a prod stack, `--all`, or `*-prod` selector; `cdk watch` in CI.
- **Fix:** `cdk deploy Api-prod --require-approval broadening` (or `--method=prepare-change-set` reviewed, then `execute-change-set`); after any hotswap in a shared env, `cdk deploy --revert-drift`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-deploy.html
- **Last verified:** 2026-10-12

### CDK-019 — Treat replacements and deletions in `cdk diff` as blockers
- **Severity:** high
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** When `cdk diff` output is in scope, every `[-]` and every replacement on a stateful resource must be explained by the change; generate it with `--method=change-set` (the default `auto` silently falls back to a template diff when the change set cannot be created, and a template diff reports every change to a replacement-requiring property as a replacement).
- **Why:** A `[~]` on an immutable property (table key schema, function name, bucket name) is a replacement; missing it in review deletes data.
- **Detect:** diff lines `[-] AWS::DynamoDB::Table`, `[-] AWS::S3::Bucket`, `[-] AWS::RDS::DB*`, `[-] AWS::Cognito::UserPool`, `[-] AWS::KMS::Key`, `requires replacement`, `may be replaced`, `destroy` next to stateful types; `IAM Statement Changes` with `[+]` broadening (→ `aws-security`).
- **Fix:** revert the ID or immutable change, use `Default`/`cdk refactor` (CDK-003), and add `cdk diff --fail` with an allow-list step in CI for stateful deletions.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-diff.html
- **Last verified:** 2026-10-12

### CDK-020 — Decide at synth time, not with CloudFormation Parameters and Conditions
- **Severity:** low
- **Category:** readability
- **Applies to:** CDK
- **Rule:** Use TypeScript `if`/props for stage differences instead of `CfnParameter`, `CfnCondition`, `Fn.conditionIf`.
- **Why:** Parameters make the template's behavior invisible in the diff and unit tests (values arrive at deploy time), and Conditions cannot express loops or construct choices, pushing logic into unreadable intrinsic chains.
- **Detect:** `new CfnParameter(`, `new CfnCondition(`, `Fn.conditionIf(`, `.valueAsString` used to switch behavior in an app that is not a published template.
- **Fix:** `new ApiStack(app, 'Api-prod', { stage: 'prod', memoryMb: 1024 })` and branch in code.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
- **Last verified:** 2026-10-12

### CDK-021 — Model with constructs, deploy with stacks
- **Severity:** low
- **Category:** simplicity
- **Applies to:** CDK
- **Rule:** Group a feature's resources in a `Construct` and keep stacks few, split by deployment need (stateful vs stateless, account/region), not one stack per resource or per service.
- **Why:** Stack-per-resource layouts multiply cross-stack references (CDK-006), slow deploys, and turn routine refactors into export deadlocks.
- **Detect:** many `extends Stack` classes each holding one or two resources and passing constructs to each other through props; `new XStack(` count far above the number of deployment boundaries.
- **Fix:** turn small stacks into constructs instantiated in one `ServiceStack`, keeping a separate `DataStack` with termination protection (CDK-007).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
- **Last verified:** 2026-10-12

### CDK-022 — Pass generated names to code through props and env, never literals
- **Severity:** medium
- **Category:** bug
- **Applies to:** CDK, TypeScript, Go
- **Rule:** Lambda/ECS code reads resource names from environment set from construct attributes (`table.tableName`, `queue.queueUrl`); handler code never hardcodes names or ARNs.
- **Why:** The generated name differs per stage and changes on replacement; a literal in code either hits prod from dev or breaks with `ResourceNotFoundException` after a deploy.
- **Detect:** CDK: function props without `environment` while handler code uses a table/bucket. TS handler: `TableName: '`, `Bucket: '`, `QueueUrl: 'https://sqs.` literals in `@aws-sdk/client-*` command inputs. Go: `aws.String("<name>")` in `TableName`/`Bucket`/`QueueUrl` fields.
- **Fix:**
  ```ts
  const fn = new NodejsFunction(this, 'Worker', { entry: 'src/worker.ts', runtime: Runtime.NODEJS_24_X,
    environment: { ORDERS_TABLE: table.tableName } });
  table.grantReadWriteData(fn);
  ```
  ```ts
  const TableName = process.env.ORDERS_TABLE!; // read once at module load
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
- **Last verified:** 2026-10-12

### CDK-023 — Never rename a deployed stack's construct ID or `stackName`
- **Severity:** high
- **Category:** reliability
- **Applies to:** CDK
- **Rule:** The ID of a top-level stack (`new XStack(app, '<id>')`) is its CloudFormation stack name unless `stackName` is set; changing either for a deployed stack, or nesting the stack under a new `Stage`/construct, deploys a brand-new stack instead of updating the old one.
- **Why:** The new stack tries to create every resource again: fixed physical names collide with the still-existing old stack, retained tables and buckets stay orphaned in the old stack, and consumers keep pointing at the old resources. Removing the old stack afterwards deletes everything not retained.
- **Detect:** in a diff, the second argument of `new <X>Stack(app, '...')` changed, a `stackName:` added or changed, or a stack moved under `new Stage(` for an app that is already deployed; `cdk diff` listing a stack with every resource as `[+]`.
- **Fix:** keep the old ID (or set `stackName: '<old name>'` explicitly when moving the stack in the tree); to split or regroup stacks, move resources with `cdk refactor` (CDK-003) in a dedicated deployment.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.Stack.html , https://docs.aws.amazon.com/cdk/v2/guide/identifiers.html
- **Last verified:** 2026-10-12
