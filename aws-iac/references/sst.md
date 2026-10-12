# SST v3 (Ion) — `sst.config.ts`

Rules SST-001 – SST-018. SST v3 deploys through Pulumi using Terraform-bridged providers
(`aws.*` resources in `sst.config.ts` are Pulumi AWS resources); state lives in an
`sst-state-<hash>` bucket in the home region with its passphrase in SSM.

---

### SST-001 — Set `removal` and `protect` per stage, and match the real stage names
- **Severity:** high
- **Category:** reliability
- **Applies to:** SST
- **Rule:** `app(input)` returns `removal: "retain"` (or `"retain-all"`) and `protect: true` for production stages and `removal: "remove"` for personal/PR stages, and the stage string it compares against is the one CI actually deploys (`--stage prod` vs `"production"`).
- **Why:** `removal` applies both to `sst remove` and to resources deleted from the config during `sst deploy`/`sst dev`; with `"remove"` on prod, deleting a component line deletes its data. A comparison against `"production"` while CI deploys `--stage prod` makes the ternary fall through to `"remove"` and `protect: false` on the real prod.
- **Detect:** `removal: "remove"` unconditionally; `removal:`/`protect:` ternaries on `input?.stage === "<x>"` where `<x>` does not appear in `sst deploy --stage` lines in `.github/workflows/*`, `package.json` scripts or `Makefile`; no `protect` key at all.
- **Fix:**
  ```ts
  app(input) {
    const isProd = ["prod"].includes(input?.stage ?? "");
    return {
      name: "orders",
      home: "aws",
      removal: isProd ? "retain" : "remove",
      protect: isProd,
    };
  },
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/reference/config/
- **Last verified:** 2026-10-12

### SST-002 — Protect production databases beyond `removal: "retain"`
- **Severity:** critical
- **Category:** reliability
- **Applies to:** SST
- **Rule:** In production, `retain` only keeps resources like S3 buckets and DynamoDB tables and removes everything else; stages holding Aurora, Postgres, Redis, OpenSearch or other stateful components use `"retain-all"`, or enable deletion protection on those resources (`deletionProtection: true` on `sst.aws.Dynamo`, `transform` on database components).
- **Why:** With the default `retain`, removing an `sst.aws.Aurora`/`Postgres` line from the config, renaming it, or running `sst remove` on a misnamed stage deletes the cluster and its data.
- **Detect:** `new sst.aws.Aurora(`, `new sst.aws.Postgres(`, `new sst.aws.Redis(`, `new sst.aws.OpenSearch(`, `new sst.aws.Efs(` in an app whose prod `removal` is `"retain"` (or omitted, since `"retain"` is the default) and with no deletion protection in `transform`; `sst.aws.Dynamo` in prod without `deletionProtection: true`.
- **Fix:**
  ```ts
  removal: isProd ? "retain-all" : "remove",
  // and per resource:
  const db = new sst.aws.Aurora("Db", {
    engine: "postgres",
    // `cluster` transform key is documented by SST; `deletionProtection` is the Pulumi AWS rds.Cluster arg
    transform: { cluster: (args) => { args.deletionProtection = isProd; } },
  });
  const table = new sst.aws.Dynamo("Orders", { /* ... */ deletionProtection: isProd });
  ```
- **Volatile:** yes
- **Source:** https://sst.dev/docs/reference/config/ , https://sst.dev/docs/component/aws/dynamo/ , https://sst.dev/docs/components/
- **Last verified:** 2026-10-12

### SST-003 — Never rename a deployed stateful component
- **Severity:** critical
- **Category:** reliability
- **Applies to:** SST
- **Rule:** The first argument of `new sst.aws.<Component>("<Name>", ...)` is its identity; renaming it (or moving it under a conditional that changes the name per stage) removes the old resources and creates new ones.
- **Why:** SST documents that renaming a component is a remove-and-recreate, not an update; for a bucket, table or database that is data loss (under `remove`) or an orphan plus empty new resource (under `retain`), and linked code switches to the empty one.
- **Detect:** in a diff, `new sst.aws.Dynamo("Orders"` → `new sst.aws.Dynamo("OrdersTable"`, same for `Bucket`, `Aurora`, `Postgres`, `Redis`, `Vpc`, `Cluster`; names built from variables (`` `${$app.stage}Orders` ``) or from changing data.
- **Fix:** keep the original name (rename only the TypeScript variable); if the rename is required, plan an explicit data migration and confirm with `sst diff`.
- **Volatile:** no
- **Source:** https://sst.dev/docs/components/
- **Last verified:** 2026-10-12

### SST-004 — Read `sst diff` for deletions before deploying protected stages
- **Severity:** high
- **Category:** reliability
- **Applies to:** SST
- **Rule:** CI for production runs `sst diff --stage <prod>` and a human (or a check) reviews deletes and replaces before `sst deploy`; `protect: true` is documented only as making `sst remove` error out, so do not rely on it against deletions caused by config changes.
- **Why:** SST applies `removal` when a resource is removed from `sst.config.ts` and you run `sst deploy`; removing or renaming a component, or a `transform` that changes an immutable argument, deletes or replaces resources on the next deploy, and `protect` does not claim to stop that.
- **Detect:** workflows running `sst deploy --stage prod` with no preceding `sst diff`; `sst diff` output (when provided) listing deletes or replaces of DynamoDB tables, S3 buckets, RDS clusters/instances or other data stores (Pulumi type tokens such as `aws:dynamodb/table`, `aws:s3/bucket*`, `aws:rds/*`).
- **Fix:** add a `sst diff --stage prod` job whose output is attached to the PR and gate the deploy job on approval.
- **Volatile:** no
- **Source:** https://sst.dev/docs/reference/cli/ , https://sst.dev/docs/reference/config/
- **Last verified:** 2026-10-12

### SST-005 — Use `link` instead of hand-wired environment variables and IAM
- **Severity:** medium
- **Category:** simplicity
- **Applies to:** SST, TypeScript, Go
- **Rule:** Give functions and services access to SST resources with `link: [table, bucket, queue]` and read them with `Resource.<Name>` (Node) or `resource.Get("<Name>", "name")` (Go), not with `environment: { TABLE: table.name }` plus a hand-written `permissions` list.
- **Why:** Manual env + IAM drifts: a new operation is added in code but not in `permissions` (AccessDenied in prod only), or permissions are widened to `"*"`. Environment variables also cap at 4 KB total, while `link` grants scoped permissions and typed access in one place.
- **Detect:** `environment: { ... : <component>.name | .arn | .url }` together with `permissions: [{ actions: [...], resources: [<component>.arn] }]` for the same SST component; code reading `process.env.TABLE_NAME` for a component that could be linked.
- **Fix:**
  ```ts
  const table = new sst.aws.Dynamo("Orders", { fields: { pk: "string" }, primaryIndex: { hashKey: "pk" } });
  new sst.aws.Function("Api", { handler: "src/api.handler", link: [table] });
  ```
  ```ts
  import { Resource } from "sst";
  await ddb.send(new GetCommand({ TableName: Resource.Orders.name, Key: { pk } }));
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/linking/ , https://sst.dev/docs/component/aws/function/ , https://sst.dev/docs/reference/sdk/
- **Last verified:** 2026-10-12

### SST-006 — Keep secrets in `sst.Secret`, linked, never in `environment`
- **Severity:** high
- **Category:** security
- **Applies to:** SST, TypeScript
- **Rule:** Define secrets with `new sst.Secret("Name")`, set them per stage with `sst secret set`, and `link` them; do not pass `process.env.X` from the deploying machine or literals through `environment`, and use `placeholder` only for non-sensitive values.
- **Why:** `environment` values are plaintext in the Lambda configuration (visible to anyone with `lambda:GetFunctionConfiguration` and in the console) and come from whatever shell ran the deploy, so a missing var deploys an empty key silently; linked secrets are encrypted in the bundle and decrypted at start.
- **Detect:** `environment: { ...: process.env.` in `sst.config.ts`; `environment` keys named `*_KEY`, `*_SECRET`, `*_TOKEN`, `*PASSWORD*`, `DATABASE_URL`; string literals like `sk_live_`; `new sst.Secret("X", "<real-looking value>")` used as placeholder.
- **Fix:**
  ```ts
  const stripeKey = new sst.Secret("StripeKey");
  new sst.aws.Function("Checkout", { handler: "src/checkout.handler", link: [stripeKey] });
  // code: Resource.StripeKey.value
  // CLI:  sst secret set StripeKey sk_live_... --stage prod
  ```
  Use `sst secret set ... --fallback` for auto-deployed PR stages.
- **Volatile:** no
- **Source:** https://sst.dev/docs/component/secret/ , https://sst.dev/docs/linking/
- **Last verified:** 2026-10-12

### SST-007 — Do not import provider packages at the top of `sst.config.ts`
- **Severity:** low
- **Category:** reliability
- **Applies to:** SST
- **Rule:** `sst.config.ts` has no top-level `import` of provider packages (`@pulumi/aws`, `@pulumi/cloudflare`); use the injected globals (`aws.`, `sst.`) and dynamic `await import("./infra/api")` inside `run()`.
- **Why:** SST documents that it manages importing provider packages and recommends no imports in `sst.config.ts`; a top-level provider import can resolve a different package copy than the one SST installed for the pinned provider version, and resources must be created inside `run()`, not in `app()`.
- **Detect:** `^import .* from "@pulumi/` or `import * as aws from` at the top of `sst.config.ts`; infra modules imported statically at the top instead of inside `async run()`.
- **Fix:**
  ```ts
  async run() {
    const { api } = await import("./infra/api");
    return { api: api.url };
  }
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/reference/config/
- **Last verified:** 2026-10-12

### SST-008 — Combine Outputs with `$interpolate`, `.apply()` or `$resolve()`, not template literals
- **Severity:** high
- **Category:** bug
- **Applies to:** SST
- **Rule:** Component properties are `Output<T>` resolved at deploy time; build strings from them with `` $interpolate`...` `` or `.apply()`, and wait on several with `$resolve([...])`.
- **Why:** A plain template literal or `+` concatenation stringifies the Output object instead of its value, so the env var, URL or policy ARN ends up as an error message string rather than the real value and fails only at runtime.
- **Detect:** `` `${<component>.url}` ``, `` `${<component>.arn}/*` ``, `` `https://${<component>.domain}` ``, `<component>.name + "..."` in `sst.config.ts` or `infra/*.ts` outside `$interpolate`/`.apply`.
- **Fix:**
  ```ts
  environment: { WEBHOOK_URL: $interpolate`${api.url}/webhooks/stripe` },
  resources: [$interpolate`${bucket.arn}/*`],
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/components/
- **Last verified:** 2026-10-12

### SST-009 — Pin the SST version and provider versions
- **Severity:** low
- **Category:** reliability
- **Applies to:** SST
- **Rule:** `app()` sets `version` (exact or a `>=` range; the CLI fails when it does not match) and pins provider versions with the documented string form (`aws: "<x.y.z>"`), with `sst install` run after changes.
- **Why:** An unpinned CLI in CI upgrades SST and its providers between two deploys, producing unexpected diffs or failures on prod deploys that nobody changed.
- **Detect:** `app()` without `version`; `providers: { aws: true }`; CI installing `sst@latest` without a lockfile pin. An object form (`aws: { profile, region }`) is valid configuration; only report it as unpinned when the repo has no `version` and no lockfile pin either.
- **Fix:** `version: "3.x.y"` and `providers: { aws: "6.x.y" }` (exact versions; check current ones in the SST docs and `package.json`), then `sst install`.
- **Volatile:** yes
- **Source:** https://sst.dev/docs/reference/config/
- **Last verified:** 2026-10-12

### SST-010 — Map stages to accounts in config
- **Severity:** medium
- **Category:** reliability
- **Applies to:** SST
- **Rule:** Production deploys to its own AWS account, selected in `providers.aws.profile` (or role) by stage, not by whichever credentials the shell happens to have.
- **Why:** With one implicit account, a personal stage and prod share quotas, IAM and blast radius, and a `sst deploy --stage prod` from a laptop with the dev profile creates a second "prod" in dev.
- **Detect:** no `providers.aws.profile`/role logic in `app()`; workflows setting `AWS_PROFILE` for all stages identically; personal stages and `prod` in one account in docs/CI.
- **Fix:**
  ```ts
  providers: { aws: { profile: input?.stage === "prod" ? "acme-prod" : "acme-dev" } },
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/iam-credentials/
- **Last verified:** 2026-10-12

### SST-011 — Share only expensive, always-on resources across dev stages with `.get()`
- **Severity:** medium
- **Category:** cost
- **Applies to:** SST
- **Rule:** Personal and PR stages reuse a shared `Vpc`, `Aurora`/`Postgres` cluster or `Cluster` from a long-lived dev stage via `sst.aws.<C>.get(...)`; keep pay-per-use resources (Functions, Dynamo, Buckets, queues) per stage.
- **Why:** Each stage with `new sst.aws.Vpc("Vpc", { nat: "managed" })` adds NAT Gateways (about $65/month for two AZs per SST's docs) and each Aurora/Postgres adds always-on compute; ten developers multiply it by ten. Sharing pay-per-use resources instead only adds coupling.
- **Detect:** `new sst.aws.Vpc(` with `nat: "managed"`, `new sst.aws.Aurora(`/`Postgres(`/`Cluster(` created unconditionally for every stage; no `$app.stage` branch with `.get(`.
- **Fix:**
  ```ts
  const vpc = $app.stage === "prod" || $app.stage === "dev"
    ? new sst.aws.Vpc("Vpc", { nat: "ec2" })
    : sst.aws.Vpc.get("Vpc", "vpc-0abc123"); // id of the dev stage VPC
  ```
  Price check → `aws-cost`.
- **Volatile:** yes
- **Source:** https://sst.dev/docs/share-across-stages/ , https://sst.dev/docs/component/aws/vpc/
- **Last verified:** 2026-10-12

### SST-012 — Customize components with `transform`, not parallel raw resources
- **Severity:** low
- **Category:** simplicity
- **Applies to:** SST
- **Rule:** Change the underlying resources of a component through its `transform` (or app-wide `$transform`, declared before the components it should affect) instead of creating duplicate `aws.*` resources or attachments that fight the component.
- **Why:** A separate `aws.s3.BucketPolicy` or `aws.iam.RolePolicy` on a component-owned resource overwrites or is overwritten by the component on the next deploy, giving perpetual diffs or lost settings; a `$transform` placed after the components silently applies to none.
- **Detect:** `new aws.<service>.<Resource>(` targeting `<component>.nodes.<x>` ids (bucket policy, role policy, log group) that the component already manages; `$transform(` calls after `new sst.aws.` calls of that type.
- **Fix:**
  ```ts
  $transform(sst.aws.Function, (args) => { args.architecture ??= "arm64"; });
  new sst.aws.Bucket("Uploads", { transform: { bucket: (args) => { args.forceDestroy = !isProd; } } });
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/components/
- **Last verified:** 2026-10-12

### SST-013 — Function URLs default to no auth
- **Severity:** high
- **Category:** security
- **Applies to:** SST
- **Rule:** `sst.aws.Function` with `url: true` gets authorization `"none"`; set `url: { authorization: "iam" }` or put it behind `sst.aws.Router`/an API with auth unless the endpoint is meant to be public and verifies requests itself.
- **Why:** An internal admin or worker handler becomes callable by anyone on the internet, and every call is billed invocation time.
- **Detect:** `url: true` or `url: { cors: ... }` without `authorization: "iam"` on functions whose handler has no signature or token check.
- **Fix:** `url: { authorization: "iam" }`, or keep `"none"` only for webhooks that verify a signature in code. Exposure review → `aws-security`.
- **Volatile:** yes
- **Source:** https://sst.dev/docs/component/aws/function/
- **Last verified:** 2026-10-12

### SST-014 — Remove PR and personal stages when they are done
- **Severity:** medium
- **Category:** cost
- **Applies to:** SST
- **Rule:** Auto-deployed PR stages run `sst remove --stage pr-<n>` when the PR closes, and those stages use `removal: "remove"` so data stores go too.
- **Why:** Abandoned stages keep NAT gateways, databases, log groups and retained buckets alive indefinitely; with the default `"retain"`, even `sst remove` leaves buckets and tables behind.
- **Detect:** a workflow with `sst deploy --stage pr-${{ github.event.number }}` (or similar) and no `pull_request: types: [closed]` job running `sst remove`; ephemeral stages not covered by the `removal: "remove"` branch.
- **Fix:** add a `closed` job: `npx sst remove --stage pr-${{ github.event.number }}`; make the `app()` ternary treat every non-prod stage as `remove`.
- **Volatile:** no
- **Source:** https://sst.dev/docs/reference/cli/ , https://sst.dev/docs/reference/config/
- **Last verified:** 2026-10-12

### SST-015 — Keep SST state healthy: no automatic unlock, no manual console edits
- **Severity:** medium
- **Category:** reliability
- **Applies to:** SST
- **Rule:** Run `sst unlock` only after confirming no deploy is running; never delete the `/sst/passphrase/<app>/<stage>` SSM parameter or the state bucket; after out-of-band console changes, run `sst refresh` before deploying.
- **Why:** An unconditional `sst unlock` before `sst deploy` in CI lets two deploys write the same state; losing the passphrase makes the stage's state unreadable and undeployable; console edits drift from state and the next deploy reverts or fails.
- **Detect:** `sst unlock` in CI scripts or `package.json` predeploy hooks; IaC or scripts deleting `/sst/passphrase/*` parameters or `sst-state-*` buckets; runbooks instructing console changes to SST-managed resources.
- **Fix:** remove automatic `sst unlock`; use workflow `concurrency: { group: sst-${{ stage }}, cancel-in-progress: false }`; document `sst refresh --stage <s>` after manual fixes.
- **Volatile:** no
- **Source:** https://sst.dev/docs/state/ , https://sst.dev/docs/reference/cli/
- **Last verified:** 2026-10-12

### SST-016 — Wrap non-SST resources with `sst.Linkable` instead of manual env + IAM
- **Severity:** low
- **Category:** simplicity
- **Applies to:** SST
- **Rule:** For raw `aws.*` resources or external values, use `new sst.Linkable(...)` or `sst.Linkable.wrap(aws.<Type>, ...)` so they can be linked like components; use `sst.Linkable.env([...])` for compute SST does not manage.
- **Why:** Mixing linked SST components with hand-wired `aws.*` resources gives two access patterns in code and two permission paths to keep in sync.
- **Detect:** `new aws.dynamodb.Table(`/`new aws.sqs.Queue(` in `sst.config.ts` passed to functions through `environment` and `permissions`.
- **Fix:**
  ```ts
  sst.Linkable.wrap(aws.dynamodb.Table, (t) => ({
    properties: { name: t.name },
    include: [sst.aws.permission({ actions: ["dynamodb:*"], resources: [t.arn] })],
  }));
  ```
  then `link: [legacyTable]`.
- **Volatile:** no
- **Source:** https://sst.dev/docs/linking/ , https://sst.dev/docs/component/linkable/
- **Last verified:** 2026-10-12

### SST-017 — Read linked resources through the SDK, not hardcoded names
- **Severity:** medium
- **Category:** bug
- **Applies to:** SST, TypeScript, Go
- **Rule:** Handler code gets resource names from `Resource.<Name>` (Node, `import { Resource } from "sst"`) or `resource.Get("<Name>", "name")` (Go, `github.com/sst/sst/v3/sdk/golang/resource`), and the function links that resource.
- **Why:** SST generates names per app and stage (`orders-dev-orderstable-abc123`); a literal name in code makes every stage hit the same table (usually prod) or fail with `ResourceNotFoundException`.
- **Detect:** TS `TableName: "`, `Bucket: "`, `QueueUrl: "https://` in `@aws-sdk/client-*` inputs in an SST repo; Go `aws.String("<name>")` in `TableName`/`Bucket`/`QueueUrl` fields; `Resource.X` used in a function whose `link` omits X (type error in `sst-env.d.ts`, runtime undefined).
- **Fix:**
  ```go
  name, err := resource.Get("Orders", "name")
  if err != nil { return err }
  _, err = client.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(name.(string)), Item: item})
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/reference/sdk/ , https://sst.dev/docs/linking/
- **Last verified:** 2026-10-12

### SST-018 — Always pass the stage explicitly in CI
- **Severity:** high
- **Category:** reliability
- **Applies to:** SST
- **Rule:** Every `sst deploy`, `sst remove`, `sst diff` and `sst secret` in CI, scripts and `package.json` passes `--stage <name>` or sets `SST_STAGE`.
- **Why:** Without a stage the CLI uses the personal stage: the machine's username (stored in `.sst/stage`). On a CI runner that is the runner user (`runner`, `ubuntu`), so the pipeline deploys a parallel stack nobody expects instead of updating prod, `removal`/`protect` stage checks evaluate against the wrong name, and `sst remove` without a stage targets that stray stage.
- **Detect:** `sst deploy`, `npx sst deploy`, `sst remove`, `sst diff` in `.github/workflows/*`, `buildspec.yml`, `Makefile` or `package.json` scripts with no `--stage` and no `SST_STAGE` in the job's `env`.
- **Fix:** `npx sst deploy --stage prod` (or `env: { SST_STAGE: prod }` on the job), and the same stage string the `app()` checks compare against (SST-001).
- **Volatile:** no
- **Source:** https://sst.dev/docs/reference/cli/
- **Last verified:** 2026-10-12
