# Step Functions rules

State machines (Standard and Express), Amazon States Language (JSONPath and JSONata), service
integrations, Map/Distributed Map, and callers using `@aws-sdk/client-sfn` or
`github.com/aws/aws-sdk-go-v2/service/sfn`. Definitions appear as ASL JSON/YAML files,
`definition = jsonencode(...)` / `templatefile(...)` in Terraform, CDK `DefinitionBody.fromChainable`
chains, or SST `sst.aws.StepFunctions` chains.

### SFN-001 — Pick Standard or Express from volume, duration and semantics
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** High-volume, short (< 5 min), idempotent workflows run as Express; long-running, human-in-the-loop, `.sync`/callback or exactly-once workflows run as Standard (or Standard parent with Express children).
- **Why:** Standard bills $0.025 per 1,000 state transitions (retries count). 10M executions/month × 6 transitions = 60M transitions = **$1,500/month**. The same as Express at 64 MB and 1 s average: 10M × $1.00/M = $10 + 10M × 1 s × 0.0625 GB = 173.6 GB-h × $0.06 = **≈ $20.42/month** (us-east-1). Express executions log only to CloudWatch Logs, which adds its own cost.
- **Detect:** `aws_sfn_state_machine` without `type` (default `STANDARD`), CDK `StateMachine` without `stateMachineType` (default Standard), SST `StepFunctions` without `type: "express"` (default `"standard"`), started per API request / per message (`StartExecutionCommand` in a handler, Pipes/EventBridge target per event), with short definitions and no `.sync`/`.waitForTaskToken`.
- **Fix:** `type = "EXPRESS"` (CDK `stateMachineType: sfn.StateMachineType.EXPRESS`; SST `type: "express"`). The type is immutable, so this replaces the state machine.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html ; https://aws.amazon.com/step-functions/pricing/ ; https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html#cost-opt-exp-workflows
- **Last verified:** 2026-10-12

### SFN-002 — Keep non-idempotent steps out of asynchronous Express workflows
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** Payments, emails, counters and other non-idempotent actions run in Standard workflows or are made idempotent before they run in Express.
- **Why:** Asynchronous Express is at-least-once: the whole execution can run more than once and starting twice with the same name runs both. A charge step in an Express workflow can bill a customer twice.
- **Detect:** Express state machine (`type = "EXPRESS"`, `StateMachineType.EXPRESS`, SST `type: "express"`) started with `StartExecution` (async) whose tasks call payment APIs, `sns:publish` of customer messages, `dynamodb:updateItem` with `ADD`, or Lambda functions doing those without an idempotency key.
- **Fix:** Move the step to a Standard parent, or pass an idempotency key (`$$.Execution.Name`, business ID) and use conditional writes / Powertools idempotency in the task.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html#express-at-least-once-execution
- **Last verified:** 2026-10-12

### SFN-003 — Don't use .sync, callbacks, Distributed Map or activities in Express
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** Express workflows use only Request Response integrations, inline Map and finish within 5 minutes.
- **Why:** Express does not support `.sync` (Run a Job), `.waitForTaskToken` (callback), Distributed Map or activities; deployment fails or the design cannot work, and anything waiting beyond 5 minutes ends in `States.Timeout`.
- **Detect:** Express definition containing `Resource` ending in `.sync`, `.sync:2` or `.waitForTaskToken`; CDK tasks with `integrationPattern: sfn.IntegrationPattern.RUN_JOB | WAIT_FOR_TASK_TOKEN` (`$$.Task.Token`, `JsonPath.taskToken`) or `DistributedMap`; `Wait` states summing over 300 s.
- **Fix:** Switch to Standard, or nest: Standard parent waits on the callback, Express child does the fast work.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html ; https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html
- **Last verified:** 2026-10-12

### SFN-004 — Put timeouts on tasks and heartbeats on callbacks
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Every `Task` that waits on something external sets `TimeoutSeconds`; callback (`.waitForTaskToken`) and activity tasks also set `HeartbeatSeconds`.
- **Why:** ASL has no default task timeout. A lost task token or crashed worker leaves a Standard execution waiting up to a year (SST's default is 99,999,999 s), holding concurrency and hiding the failure.
- **Detect:** `Task` states without `TimeoutSeconds`/`TimeoutSecondsPath`; CDK tasks without `taskTimeout` (and without `heartbeatTimeout` on `WAIT_FOR_TASK_TOKEN`); SST `StepFunctions.task(...)` / `lambdaInvoke(...)` without `timeout`.
- **Fix:**
  ```ts
  new tasks.SqsSendMessage(this, "AwaitApproval", {
    queue, integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
    messageBody: sfn.TaskInput.fromObject({ token: sfn.JsonPath.taskToken }),
    taskTimeout: sfn.Timeout.duration(Duration.hours(24)),
    heartbeatTimeout: sfn.Timeout.duration(Duration.minutes(10)),
  });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html#sfn-stuck-execution
- **Last verified:** 2026-10-12

### SFN-005 — Retry Lambda service errors with backoff and jitter
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Lambda tasks retry `Lambda.ServiceException`, `Lambda.AWSLambdaException`, `Lambda.SdkClientException`, `Lambda.ClientExecutionTimeoutException` and `Lambda.TooManyRequestsException` with exponential backoff, `MaxDelaySeconds` and `JitterStrategy: FULL`.
- **Why:** Transient Lambda service errors and throttles otherwise fail the whole execution. CDK `LambdaInvoke` adds service-exception retries by default (`retryOnServiceExceptions: true`) but not throttling; raw ASL in Terraform and SST chains get nothing unless written.
- **Detect:** ASL `Task` with `arn:aws:states:::lambda:invoke` or a function ARN and no `Retry`; CDK `retryOnServiceExceptions: false`; SST `lambdaInvoke(...)` without `.retry(...)`.
- **Fix:**
  ```json
  "Retry": [{
    "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException",
                    "Lambda.SdkClientException", "Lambda.TooManyRequestsException"],
    "IntervalSeconds": 2, "MaxAttempts": 6, "BackoffRate": 2,
    "MaxDelaySeconds": 30, "JitterStrategy": "FULL"
  }]
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html#bp-lambda-serviceexception ; https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions_tasks.LambdaInvoke.html
- **Last verified:** 2026-10-12

### SFN-006 — Keep the state input when catching errors
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** In JSONPath workflows, give each `Catch` a `ResultPath` such as `$.error` so the fallback state still sees the original input; in JSONata, assign the error into a variable or `Output` that keeps the needed fields.
- **Why:** Without `ResultPath` a catcher defaults to `$`, replacing the whole input with `{Error, Cause}`. Compensation steps then lack `orderId`/`paymentId` and fail, or refund nothing.
- **Detect:** ASL `"Catch": [{ "ErrorEquals": [...], "Next": "..." }]` without `ResultPath` where the `Next` state reads `$.orderId`-style paths; CDK `.addCatch(handler)` without `{ resultPath: "$.error" }`.
- **Fix:** `"ResultPath": "$.error"`; CDK `.addCatch(compensate, { resultPath: "$.error" })`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html#error-handling-fallback-states ; https://docs.aws.amazon.com/step-functions/latest/dg/input-output-resultpath.html
- **Last verified:** 2026-10-12

### SFN-007 — Order catchers and retriers correctly; States.ALL is last and alone
- **Severity:** low
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** `States.ALL` appears alone and in the last retrier/catcher; specific errors come first; `States.DataLimitExceeded` is handled explicitly when payloads can grow.
- **Why:** `States.ALL` elsewhere is a definition error; a broad retrier first swallows specific handling (e.g. retries a non-retryable validation error 3×). `States.ALL` does not catch `States.DataLimitExceeded` or `States.Runtime`.
- **Detect:** `"ErrorEquals": ["States.ALL", "X"]`, `States.ALL` retrier before others, catchers without a terminal fallback in workflows passing large data.
- **Fix:** Specific errors first, `{"ErrorEquals": ["States.ALL"]}` last.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html
- **Last verified:** 2026-10-12

### SFN-008 — Keep state payloads under 256 KiB
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Pass S3 references for large data and trim task outputs (`ResultSelector`, `OutputPath`, CDK `payloadResponseOnly`/`resultSelector`, JSONata `Output`) to the fields later states need.
- **Why:** Any state input/output or execution input above 256 KiB fails with `States.DataLimitExceeded`, which `States.ALL` cannot catch. It typically appears in production when a list grows (all line items, a full API response, Lambda metadata wrappers).
- **Detect:** Lambda tasks returning whole query results/arrays; `StartExecutionCommand({ input: JSON.stringify(bigObject) })`; `ResultPath` merging full API responses (`$.response`) into the state; Map `ResultPath` collecting all item outputs.
- **Fix:** Write the payload to S3 and pass `{ bucket, key }`; add `"ResultSelector": { "id.$": "$.Payload.id" }` or `"ResultPath": null` where the output is not needed.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html#service-limits-task-executions ; https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html#avoid-exec-failures
- **Last verified:** 2026-10-12

### SFN-009 — Call AWS services directly instead of through Lambda glue
- **Severity:** medium
- **Category:** simplicity
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A Task whose Lambda only performs one AWS API call (DynamoDB `PutItem`/`GetItem`/`UpdateItem`, SQS `SendMessage`, SNS `Publish`, EventBridge `PutEvents`, S3 `GetObject`, `StartExecution`) becomes an optimized or AWS SDK integration.
- **Why:** The function adds cold starts, per-invocation cost, code, IAM and logs, and an extra state transition of failure surface, for nothing a direct integration doesn't do.
- **Detect:** A Lambda referenced from the state machine whose handler body is a single `client.send(new PutItemCommand(...))` / `PutCommand` / `SendMessageCommand` / `PublishCommand` / Go `client.PutItem(...)` with input mapping only.
- **Fix:**
  ```ts
  new tasks.DynamoPutItem(this, "SaveOrder", {
    table,
    item: { pk: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.orderId")) },
    conditionExpression: "attribute_not_exists(pk)",
  });
  ```
  ASL: `"Resource": "arn:aws:states:::dynamodb:putItem"` or `"arn:aws:states:::aws-sdk:<service>:<apiAction>"`; SST `StepFunctions.task({ resource: "arn:aws:states:::dynamodb:putItem", ... })`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/integrate-optimized.html ; https://docs.aws.amazon.com/step-functions/latest/dg/supported-services-awssdk.html ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions_tasks.DynamoPutItem.html
- **Last verified:** 2026-10-12

### SFN-010 — Replace Wait + poll loops with .sync or callbacks
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** In Standard workflows, wait for jobs with the `.sync` pattern (ECS, Batch, Glue, CodeBuild, nested Step Functions) or `.waitForTaskToken`, not a `Wait` → check-status Lambda → `Choice` loop.
- **Why:** Each loop iteration bills three or more state transitions plus a Lambda invocation and eats into the 25,000-event history; a job polled every 10 s for an hour is ~1,080 transitions per execution.
- **Detect:** `Wait` state → Task (`getStatus`/`describe*`) → `Choice` that loops back to the `Wait`.
- **Fix:** `"Resource": "arn:aws:states:::ecs:runTask.sync"` (CDK `integrationPattern: sfn.IntegrationPattern.RUN_JOB`) or a callback with a task token.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html ; https://aws.amazon.com/step-functions/pricing/
- **Last verified:** 2026-10-12

### SFN-011 — Use Distributed Map for large or highly parallel item sets
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Map over more than a few hundred items, or needing more than 40 concurrent iterations, uses Distributed mode (child executions, `ItemReader` from S3, `ToleratedFailurePercentage`, `ResultWriter`).
- **Why:** Inline Map runs at most 40 iterations concurrently and writes every iteration's events into the parent history, which fails at 25,000 events; its input must fit in 256 KiB.
- **Detect:** ASL `"Type": "Map"` without `ProcessorConfig.Mode: "DISTRIBUTED"` (CDK `sfn.Map` instead of `sfn.DistributedMap`) whose `ItemsPath` points at arrays loaded from a DB/S3 listing or loops over "all customers/files".
- **Fix:** CDK `new sfn.DistributedMap(this, "ProcessFiles", { itemReader: new sfn.S3JsonItemReader({ bucket, key }), maxConcurrency: 100, toleratedFailurePercentage: 5 })`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/state-map-inline.html ; https://docs.aws.amazon.com/step-functions/latest/dg/state-map-distributed.html ; https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html
- **Last verified:** 2026-10-12

### SFN-012 — Avoid the 25,000-event history limit in long loops
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Standard workflows that loop (pagination, retries over days, per-item sequential processing) continue as a new execution or delegate to child executions before nearing 25,000 history events.
- **Why:** When event 25,000 is not `ExecutionSucceeded` the execution fails, typically weeks into production when the data set grows.
- **Detect:** `Choice` → back-edge loops processing pages/items one by one; long `Retry` with large `MaxAttempts` inside loops.
- **Fix:** After N iterations call `arn:aws:states:::states:startExecution` with the cursor and end the current execution, or use Distributed Map.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html#bp-history-limit
- **Last verified:** 2026-10-12

### SFN-013 — Limit Map concurrency toward rate-limited downstreams
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Map states that call throttled APIs, databases or third parties set `MaxConcurrency`.
- **Why:** The default `0` runs iterations as concurrently as possible; Distributed Map can start up to 10,000 child executions. The downstream throttles, retries amplify the load, and the Map fails.
- **Detect:** `Map` without `MaxConcurrency`/`maxConcurrency` whose iterator calls RDS-backed Lambdas, external HTTP (`arn:aws:states:::http:invoke`), or APIs with known TPS limits.
- **Fix:** `"MaxConcurrency": 10` (CDK `maxConcurrency: 10`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/state-map-inline.html ; https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html
- **Last verified:** 2026-10-12

### SFN-014 — Turn on logging for Express workflows, without full payloads at volume
- **Severity:** low
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Express state machines log to CloudWatch Logs at least at `ERROR`; avoid `ALL` with `include_execution_data = true` on high-volume machines. Log group naming and retention → `aws-observability`/`aws-cost`.
- **Why:** Express keeps no execution history: without logs a failed execution leaves no trace. With `ALL` + execution data every state's payload is ingested, which can cost more than the workflow itself.
- **Detect:** `type = "EXPRESS"` without `logging_configuration`; CDK Express without `logs`; SST `logging: false`; `level = "ALL"` + `include_execution_data = true` on Express machines started per request.
- **Fix:**
  ```hcl
  logging_configuration {
    level                  = "ERROR"
    include_execution_data = false
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
  }
  ```
  Name log groups `/aws/vendedlogs/states/...`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/cw-logs.html ; https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html#bp-cwl
- **Last verified:** 2026-10-12

### SFN-015 — Use a deterministic execution name to deduplicate Standard starts
- **Severity:** medium
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Producers that may retry `StartExecution` for the same business event pass `name` derived from it (e.g. `order-${orderId}`) on Standard workflows.
- **Why:** Without a name each retry starts a new execution (double fulfilment). Standard treats a start with the name of a running execution idempotently and names stay unique while history is retained (90 days). Express does not deduplicate names (SFN-002).
- **Detect:** `new StartExecutionCommand({ stateMachineArn, input })` / `sfn.StartExecutionInput{...}` without `name`/`Name` in message handlers or webhooks, or with `name: randomUUID()`.
- **Fix:** `new StartExecutionCommand({ stateMachineArn, name: \`order-${order.id}\`, input })`; treat `ExecutionAlreadyExists` as success.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html#express-at-least-once-execution ; https://docs.aws.amazon.com/step-functions/latest/apireference/API_StartExecution.html
- **Last verified:** 2026-10-12

### SFN-016 — Prefer JSONata and variables over Pass-state plumbing
- **Severity:** low
- **Category:** readability
- **Applies to:** Terraform, CDK, SST
- **Rule:** New or heavily edited definitions use `"QueryLanguage": "JSONata"` with `Arguments`/`Output`/`Assign` instead of chains of `Pass` states and `InputPath`/`Parameters`/`ResultPath` juggling to carry values forward.
- **Why:** JSONPath plumbing spreads one data flow across many states and is where payload-size and overwritten-input bugs (SFN-006, SFN-008) creep in; variables keep values available without threading them through every state.
- **Detect:** Several consecutive `Pass` states that only reshape or copy fields; `ResultPath` gymnastics to preserve earlier outputs.
- **Fix:** Use JSONata expressions and `Assign` variables; SST tasks accept JSONata (`"{% ... %}"`) arguments.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/step-functions/latest/dg/transforming-data.html ; https://sst.dev/docs/component/aws/step-functions/
- **Last verified:** 2026-10-12
