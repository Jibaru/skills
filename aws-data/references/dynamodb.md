# DynamoDB rules

Key design, access patterns, capacity, data protection and SDK usage for Amazon DynamoDB.
Limits quoted here: item 400 KB; Query/Scan page 1 MB; BatchWriteItem 25 puts/deletes and
16 MB; BatchGetItem 100 items and 16 MB; transactions 100 items and 4 MB; per-partition
3,000 read units/s and 1,000 write units/s.

### DDB-001 — Paginate Query and Scan until LastEvaluatedKey is absent
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Every Query or Scan whose result can exceed one page must loop on `LastEvaluatedKey` → `ExclusiveStartKey`, or use the SDK paginator. A single call returns at most 1 MB (or `Limit` items) of evaluated data.
- **Why:** Code that reads `Items` from one call silently drops everything after the first 1 MB. It passes tests with small data and returns partial results in production (missing orders, wrong totals, incomplete exports).
- **Detect:** TS: `new QueryCommand(` / `new ScanCommand(` sent once, then `.Items` used, with no `LastEvaluatedKey`, `ExclusiveStartKey`, `paginateQuery` or `paginateScan` in the function. Go: `client.Query(ctx,` / `client.Scan(ctx,` called once with no `NewQueryPaginator`/`NewScanPaginator` and no `out.LastEvaluatedKey` check. A deliberate single page is fine only when the caller returns the cursor to its client (API pagination).
- **Fix:** Use the paginator.
  ```ts
  import { paginateQuery } from "@aws-sdk/lib-dynamodb";
  const items = [];
  for await (const page of paginateQuery({ client: ddb }, { TableName, KeyConditionExpression: "pk = :pk", ExpressionAttributeValues: { ":pk": pk } })) {
    items.push(...(page.Items ?? []));
  }
  ```
  ```go
  p := dynamodb.NewQueryPaginator(client, &dynamodb.QueryInput{TableName: aws.String(table), KeyConditionExpression: aws.String("pk = :pk"), ExpressionAttributeValues: vals})
  for p.HasMorePages() {
      page, err := p.NextPage(ctx)
      if err != nil { return err }
      items = append(items, page.Items...)
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html#Scan.Pagination
- **Last verified:** 2026-10-12

### DDB-002 — Retry UnprocessedItems and UnprocessedKeys with backoff
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** After `BatchWriteItem` resend `UnprocessedItems`, and after `BatchGetItem` resend `UnprocessedKeys`, in a loop with exponential backoff until empty (or fail loudly).
- **Why:** A batch call returns HTTP 200 even when some puts, deletes or reads were throttled; they come back in `UnprocessedItems`/`UnprocessedKeys`. Ignoring them loses writes silently and returns partial reads.
- **Detect:** TS: `BatchWriteCommand`/`BatchWriteItemCommand`/`BatchGetCommand` whose response is not read for `UnprocessedItems`/`UnprocessedKeys`. Go: `client.BatchWriteItem(` / `client.BatchGetItem(` with `out.UnprocessedItems`/`out.UnprocessedKeys` never checked.
- **Fix:**
  ```ts
  let req = { RequestItems: chunk };
  for (let attempt = 0; ; attempt++) {
    const out = await ddb.send(new BatchWriteCommand(req));
    const left = out.UnprocessedItems ?? {};
    if (Object.keys(left).length === 0) break;
    if (attempt === 8) throw new Error("unprocessed items after retries");
    await sleep(Math.random() * 50 * 2 ** attempt); // full jitter
    req = { RequestItems: left };
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ErrorHandling.html#Programming.Errors.BatchOperations
- **Last verified:** 2026-10-12

### DDB-003 — Chunk batches to the API limits and dedupe keys
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Split `BatchWriteItem` into chunks of at most 25 requests and `BatchGetItem` into at most 100 keys, and never put the same key twice in one batch.
- **Why:** DynamoDB rejects the whole batch with `ValidationException` when it has more than 25 writes, two operations on the same key, an item over 400 KB, or more than 16 MB. A code path that works for 10 records breaks the day a caller sends 26.
- **Detect:** An array of arbitrary length mapped straight into `RequestItems: { [table]: items.map(...) }` with no chunking (`slice(i, i + 25)`, `chunk(`, a `for i := 0; i < len(x); i += 25` loop). Duplicates: input not deduplicated by key before batching.
- **Fix:** Chunk by 25 (writes) / 100 (gets), dedupe by key, then apply DDB-002 per chunk.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html#limits-api
- **Last verified:** 2026-10-12

### DDB-004 — Query by key instead of scanning on a request path
- **Severity:** high
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Request-path reads must use `GetItem`/`Query` on the table or a GSI. Reserve `Scan` for offline jobs, and use Export to S3 or zero-ETL for analytics.
- **Why:** A Scan reads every item, and you pay for every item read even when a filter discards it. Latency and cost grow with table size: a 10 GB table costs about 10 GB / 4 KB / 2 ≈ 1.3 M read units per eventually consistent full scan, about $0.16 on on-demand at $0.125 per million reads, on every request.
- **Detect:** `ScanCommand`/`client.Scan(` inside an API handler, resolver or per-message consumer, especially with a `FilterExpression` on an attribute that could be a key (`userId`, `tenantId`, `email`, `status`).
- **Fix:** Add a GSI whose partition key is the filtered attribute, then `Query` it.
  ```ts
  await ddb.send(new QueryCommand({ TableName, IndexName: "byEmail", KeyConditionExpression: "email = :e", ExpressionAttributeValues: { ":e": email } }));
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html ; https://aws.amazon.com/dynamodb/pricing/on-demand/
- **Last verified:** 2026-10-12

### DDB-005 — Do not rely on Limit with FilterExpression to return N matches
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** `Limit` caps items *evaluated*, before the filter. A filter does not reduce capacity consumed. To get N matches, keep paginating until N are collected, or redesign the key so the condition is in `KeyConditionExpression`.
- **Why:** `Limit: 20` with a filter can return 0 items plus a `LastEvaluatedKey`; UIs show empty pages and callers stop early. Capacity is billed for all evaluated items.
- **Detect:** `Limit:` together with `FilterExpression:` in the same Query/Scan input, and the caller treats `Items.length < Limit` (or an empty page) as "no more data".
- **Fix:** Move the condition into the sort key (`begins_with(sk, :prefix)`, `BETWEEN`) or a sparse GSI, or loop until enough matches or no `LastEvaluatedKey`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html#Scan.Limit
- **Last verified:** 2026-10-12

### DDB-006 — Never request strongly consistent reads from a GSI
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Omit `ConsistentRead` (or set it to false) on any Query or Scan that sets `IndexName` for a global secondary index. If read-after-write matters, read the base table by key.
- **Why:** GSIs support eventually consistent reads only. `ConsistentRead: true` with a GSI returns `ValidationException`, so every call on that path fails.
- **Detect:** A Query/Scan input with both `IndexName:` (naming a GSI) and `ConsistentRead: true`; Go `IndexName: aws.String(...)` with `ConsistentRead: aws.Bool(true)`.
- **Fix:** Drop `ConsistentRead`, or `GetItem` the base table with `ConsistentRead: true` after the index lookup.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html#DDB-Query-request-ConsistentRead
- **Last verified:** 2026-10-12

### DDB-007 — Guard creates with attribute_not_exists
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** A `PutItem` that creates a new entity (signup, order, idempotency record, unique email claim) must carry `ConditionExpression: "attribute_not_exists(pk)"` and handle `ConditionalCheckFailedException`.
- **Why:** `PutItem` replaces any existing item with the same key. Without the condition a retry, a duplicate event or a colliding ID silently overwrites existing data, and a uniqueness check done with a prior `GetItem` races.
- **Detect:** `PutCommand`/`PutItemCommand`/`client.PutItem(` with no `ConditionExpression` in functions named `create*`, `register*`, `claim*`, `reserve*`, or after a `GetItem` existence check. Missing `ConditionalCheckFailedException` (TS) / `*types.ConditionalCheckFailedException` via `errors.As` (Go) handling.
- **Fix:**
  ```ts
  try {
    await ddb.send(new PutCommand({ TableName, Item: order, ConditionExpression: "attribute_not_exists(pk)" }));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) return { status: 409 };
    throw e;
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html#WorkingWithItems.ConditionalUpdate
- **Last verified:** 2026-10-12

### DDB-008 — Replace read-modify-write with an atomic or conditional update
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Never `GetItem`, change a value in code, then `PutItem`/`UpdateItem` it back unconditionally. Use `UpdateExpression` arithmetic (`SET qty = qty - :n`) with a guard condition, or optimistic locking on a `version` attribute.
- **Why:** Two concurrent requests read the same value and the second write wins: lost updates, oversold stock, double-spent balances.
- **Detect:** A `GetCommand`/`GetItem` followed in the same function by `PutCommand`/`UpdateCommand` that writes a value computed from the read (`item.balance - amount`, `count + 1`) with no `ConditionExpression` referencing the read value or a version.
- **Fix:**
  ```ts
  await ddb.send(new UpdateCommand({
    TableName, Key: { pk },
    UpdateExpression: "SET stock = stock - :n",
    ConditionExpression: "stock >= :n",
    ExpressionAttributeValues: { ":n": n },
  }));
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html#WorkingWithItems.ConditionalUpdate ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_ImplementingVersionControl.html
- **Last verified:** 2026-10-12

### DDB-009 — Make writes from at-least-once consumers idempotent
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Counters (`ADD`, `SET x = x + :n`) and appends driven by SQS, SNS, EventBridge, Kinesis or DynamoDB Streams consumers must be deduplicated: a conditional write on an event ID, `TransactWriteItems` with an idempotency item, or Powertools idempotency.
- **Why:** Atomic counters are not idempotent, and those event sources deliver at least once. Each redelivery or Lambda retry double-counts revenue, stock or quotas.
- **Detect:** `UpdateExpression` containing `ADD ` or `= <attr> + :` or `list_append(` inside a handler typed `SQSEvent`, `DynamoDBStreamEvent`, `KinesisStreamEvent`, `EventBridgeEvent` (TS) or `events.SQSEvent`, `events.DynamoDBEvent` (Go), with no dedup key condition.
- **Fix:** Record the event ID and apply the increment in one transaction, conditional on the ID being new.
  ```ts
  await ddb.send(new TransactWriteCommand({ TransactItems: [
    { Put: { TableName, Item: { pk: `EVT#${eventId}`, sk: "EVT", ttl }, ConditionExpression: "attribute_not_exists(pk)" } },
    { Update: { TableName, Key: { pk: `ACC#${id}`, sk: "ACC" }, UpdateExpression: "ADD total :amt", ExpressionAttributeValues: { ":amt": amt } } },
  ]}));
  ```
  Or wrap the handler with `@aws-lambda-powertools/idempotency` backed by a DynamoDB table.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html#WorkingWithItems.AtomicCounters ; https://docs.powertools.aws.dev/lambda/typescript/latest/features/idempotency/
- **Last verified:** 2026-10-12

### DDB-010 — Use transactions only when atomicity is required, and make retries idempotent
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Use `TransactWriteItems` only when several items must change atomically. Pass a `ClientRequestToken` when the call can be retried, keep each transaction within 100 items and 4 MB, and never target the same item twice.
- **Why:** Transactional writes cost 2 write units per 1 KB and reads 2 read units per 4 KB, double the normal price. Wrapping a single write or independent writes in a transaction doubles the bill for nothing. Retrying without a token can apply the transaction twice. Two actions on the same key cancel the whole transaction.
- **Detect:** `TransactWriteCommand`/`TransactWriteItemsCommand`/`client.TransactWriteItems(` with exactly one item, or with items that do not depend on each other; no `ClientRequestToken` in a retried path; the same `Key` appearing twice in `TransactItems`.
- **Fix:** Use a plain `PutItem`/`UpdateItem` (with a condition) for single-item changes. For multi-item atomic changes add `ClientRequestToken: requestId` (valid for 10 minutes).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html ; https://aws.amazon.com/dynamodb/pricing/on-demand/
- **Last verified:** 2026-10-12

### DDB-011 — Store TTL as a Number in epoch seconds
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go, Terraform, CDK, SST
- **Rule:** The attribute named in the table's TTL setting must be written as a Number holding Unix epoch **seconds**.
- **Why:** Items whose TTL attribute is not a Number are ignored by TTL, and a value in milliseconds is a date tens of thousands of years away. Either way nothing expires: storage grows forever and sessions, locks or OTP codes never go away.
- **Detect:** Find the TTL attribute name (`ttl { attribute_name = "..." }`, `timeToLiveAttribute: "..."`, SST `ttl: "..."`), then find writes to it: `Date.now()` without `/ 1000`, `new Date(...).getTime()`, `toISOString()`, `String(`, Go `time.Now().UnixMilli()`, `.Format(`, or a Go struct field typed `time.Time`/`string` with `dynamodbav:"<ttl attr>"`.
- **Fix:**
  ```ts
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 3600;
  ```
  ```go
  ExpiresAt int64 `dynamodbav:"expiresAt"` // time.Now().Add(24 * time.Hour).Unix()
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/howitworks-ttl.html
- **Last verified:** 2026-10-12

### DDB-012 — Filter expired items when expiry affects correctness
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** When an expired item must not be honoured (sessions, tokens, locks, reservations), check the TTL attribute on read (`FilterExpression: "#ttl > :now"` or a check in code). TTL deletes expired items only "typically within a few days".
- **Why:** An expired session or one-time code stays readable until the background delete runs, so code that trusts its presence accepts expired credentials or keeps holding a lock.
- **Detect:** A table with TTL enabled whose `GetItem`/`Query` results are used for auth, locking or quota decisions without comparing the TTL attribute to the current time.
- **Fix:** `if (item.expiresAt <= Math.floor(Date.now() / 1000)) treatAsMissing();`
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/howitworks-ttl.html
- **Last verified:** 2026-10-12

### DDB-013 — Choose a high-cardinality partition key
- **Severity:** high
- **Category:** performance
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** The partition key of the table and of each GSI must spread traffic across many values. Constant, date-only, status or boolean keys concentrate traffic on one partition; shard them (`STATUS#OPEN#<0..N>`) or pick another key.
- **Why:** Each partition serves at most 3,000 read units and 1,000 write units per second. A hot key throttles at those numbers no matter what the table's capacity or on-demand mode is, so traffic spikes cause throttling errors and timeouts.
- **Detect:** Terraform table `hash_key` or GSI `key_schema { attribute_name = "..." key_type = "HASH" }` (deprecated GSI `hash_key`), CDK `partitionKey: { name: ... }`, SST `primaryIndex: { hashKey }` / `globalIndexes.*.hashKey` named `status`, `type`, `date`, `day`, `isActive`, `country`, `entity`; or code writing a constant partition key (`pk: "ORDERS"`, `pk: "ALL"`, `pk: today`).
- **Fix:** Use an entity ID as partition key. For "list all X by status/date", add write sharding: `gsi1pk = \`STATUS#${status}#${hash(id) % 10}\``, and query the shards in parallel.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html
- **Last verified:** 2026-10-12

### DDB-014 — Enable point-in-time recovery on tables holding data you cannot rebuild
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Turn on PITR for production tables that are a source of truth.
- **Why:** Without PITR a bad deploy, a buggy migration or a `DeleteItem` loop is unrecoverable. PITR restores to any second in the last 1–35 days (default 35). It costs $0.20/GB-month in us-east-1, so a 50 GB table costs $10/month to protect.
- **Detect:** Terraform `aws_dynamodb_table` with no `point_in_time_recovery { enabled = true }` (default is off). CDK `TableV2`/`Table` without `pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }` (the older `pointInTimeRecovery: true` prop is deprecated). SST `sst.aws.Dynamo` hard-codes `pointInTimeRecovery: { enabled: true }` in the component (the sst.dev page does not document it); flag only a `transform.table` that sets `pointInTimeRecovery.enabled = false`.
- **Fix:**
  ```hcl
  point_in_time_recovery {
    enabled = true
  }
  ```
  ```ts
  new dynamodb.TableV2(this, "Orders", { partitionKey, pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true } });
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table#point_in_time_recovery ; https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_dynamodb.TablePropsV2.html ; https://aws.amazon.com/dynamodb/pricing/on-demand/
- **Last verified:** 2026-10-12

### DDB-015 — Protect stateful tables from deletion
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** Production tables need deletion protection on the resource, and the IaC must not destroy them on stack/stage removal or replacement.
- **Why:** A rename of a force-new attribute (`hash_key`, `range_key`, table name), a `cdk destroy`, or `sst remove` on the wrong stage deletes the table and all data. Deletion protection makes the API refuse.
- **Detect:** Terraform `deletion_protection_enabled` absent or false (default false), and no `lifecycle { prevent_destroy = true }`. CDK `TableV2`/`Table` without `deletionProtection: true`, or `removalPolicy: RemovalPolicy.DESTROY`. SST `sst.aws.Dynamo` without `deletionProtection: true` in a production stage, and `sst.config.ts` `removal` not `"retain"` for production.
- **Fix:**
  ```hcl
  deletion_protection_enabled = true
  lifecycle { prevent_destroy = true }
  ```
  ```ts
  new sst.aws.Dynamo("Orders", { fields, primaryIndex, deletionProtection: $app.stage === "production" });
  ```
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table#deletion_protection_enabled ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.Basics.html#WorkingWithTables.Basics.DeletionProtection ; https://sst.dev/docs/component/aws/dynamo
- **Last verified:** 2026-10-12

### DDB-016 — Project only the attributes each GSI's queries need
- **Severity:** medium
- **Category:** cost
- **Applies to:** Terraform, CDK, SST
- **Rule:** Prefer `KEYS_ONLY` or `INCLUDE` projections. Use `ALL` only when the index's queries really need most attributes.
- **Why:** Every write that touches projected attributes is also written (and billed) in the GSI, and the index stores its own copy plus 100 bytes per item. `ALL` on a large-item table roughly doubles storage and adds a full write per GSI per update.
- **Detect:** Terraform `global_secondary_index { projection_type = "ALL" }`; CDK `globalSecondaryIndexes: [{ ... projectionType: ProjectionType.ALL }]` or no `projectionType` (CDK default ALL); SST `globalIndexes: { X: { hashKey } }` without `projection` (SST default `"all"`).
- **Fix:**
  ```ts
  globalIndexes: { byStatus: { hashKey: "status", rangeKey: "createdAt", projection: ["orderId", "total"] } }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html#GSI.Projections ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html#GSI.StorageConsiderations ; https://sst.dev/docs/component/aws/dynamo
- **Last verified:** 2026-10-12

### DDB-017 — Use on-demand unless the load is steady, and never provision without auto scaling
- **Severity:** medium
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** On-demand is the default and recommended mode for most workloads. A provisioned table (and each of its GSIs) needs auto scaling on reads and writes.
- **Why:** A fixed provisioned capacity throttles on the first spike and wastes money in quiet hours. In Terraform, omitting `billing_mode` creates a **provisioned** table, often with the `read_capacity = 5` copied from an example.
- **Detect:** Terraform `aws_dynamodb_table` without `billing_mode = "PAY_PER_REQUEST"` (default `PROVISIONED`) and no `aws_appautoscaling_target` with `scalable_dimension = "dynamodb:table:WriteCapacityUnits"`/`ReadCapacityUnits` (and `dynamodb:index:*` for GSIs). CDK `billing: Billing.provisioned({ readCapacity: Capacity.fixed(...) })` or `Table` with `billingMode: PROVISIONED` and no `autoScaleReadCapacity`/`autoScaleWriteCapacity`.
- **Fix:** `billing_mode = "PAY_PER_REQUEST"`; or provisioned with `Capacity.autoscaled({ maxCapacity })` / an `aws_appautoscaling_policy` of type `TargetTrackingScaling` at ~70% utilization.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table#billing_mode ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/AutoScaling.html
- **Last verified:** 2026-10-12

### DDB-018 — Give provisioned GSIs at least the table's write capacity
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK
- **Rule:** On provisioned tables, each GSI's write capacity (fixed or auto-scaled max) must be at least the base table's.
- **Why:** If a GSI cannot absorb the writes, DynamoDB throttles writes to the base table, so an under-sized reporting index takes down the write path.
- **Detect:** Terraform `global_secondary_index { write_capacity = N }` with N lower than the table's `write_capacity`, or index autoscaling missing while the table has it. CDK `TableV2` provisioned with GSI `writeCapacity` lower than the table's.
- **Fix:** Match or exceed the table's write capacity on every GSI, or switch to on-demand.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html#GSI.ThroughputConsiderations
- **Last verified:** 2026-10-12

### DDB-019 — Keep items far below 400 KB; move unbounded data out
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Do not append to unbounded lists or maps inside one item, and do not store blobs (files, HTML, base64 images, large JSON) in items. Model one item per child, or store the payload in S3 and keep the key.
- **Why:** The 400 KB limit counts names and values. When an item crosses it, every later write to that item fails with `ValidationException`. Large items also burn capacity: a 100 KB item costs 100 write units per write and 25 read units per strongly consistent read.
- **Detect:** `list_append(` or `SET #items[...]` on a list that grows per event (comments, history, logs, events); attributes holding `Buffer`, base64 strings, `JSON.stringify(` of request bodies or documents; Go `[]byte` fields marshalled into items.
- **Fix:** One item per child (`pk = ORDER#1`, `sk = EVENT#<ts>`), queried by prefix; large payloads in S3 with `s3Key` in the item (hand off bucket settings to `aws-storage`).
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html#limits-items ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-use-s3-too.html
- **Last verified:** 2026-10-12

### DDB-020 — Build expressions with placeholders, never by string concatenation
- **Severity:** high
- **Category:** security
- **Applies to:** TypeScript, Go
- **Rule:** Put every value in `ExpressionAttributeValues` and every dynamic or reserved attribute name in `ExpressionAttributeNames`. In Go, use `feature/dynamodb/expression`.
- **Why:** Interpolating user input into `ConditionExpression`, `FilterExpression` or `UpdateExpression` lets a caller change the expression (skip a condition, update other attributes). Reserved words (`status`, `name`, `date`, `size`) used raw fail with `ValidationException`.
- **Detect:** Template strings or `+` / `fmt.Sprintf` building `*Expression` fields from variables: `` FilterExpression: `status = '${s}'` ``, `UpdateExpression: "SET " + field + " = :v"`; attribute names from request input without an allow-list.
- **Fix:**
  ```go
  cond := expression.Name("status").Equal(expression.Value(status))
  expr, _ := expression.NewBuilder().WithFilter(cond).Build()
  // pass expr.Filter(), expr.Names(), expr.Values()
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ExpressionAttributeValues.html ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html ; https://github.com/aws/aws-sdk-go-v2/tree/main/feature/dynamodb/expression
- **Last verified:** 2026-10-12

### DDB-021 — Bound retries on DynamoDB Streams consumers
- **Severity:** high
- **Category:** reliability
- **Applies to:** Terraform, CDK, SST
- **Rule:** A Lambda event source mapping on a DynamoDB stream needs `MaximumRetryAttempts`, `MaximumRecordAgeInSeconds`, `BisectBatchOnFunctionError`, an on-failure destination and `ReportBatchItemFailures` with partial-batch handling in code.
- **Why:** With defaults, a single poison record blocks its shard for up to one day (the stream's retention), while all later changes for those keys wait. When the record expires it is dropped with no trace.
- **Detect:** Terraform `aws_lambda_event_source_mapping` whose `event_source_arn` is a `stream_arn` and lacks `maximum_retry_attempts`, `destination_config { on_failure { ... } }`, `function_response_types = ["ReportBatchItemFailures"]`. CDK `new DynamoEventSource(table, {...})` without `retryAttempts`, `onFailure`, `bisectBatchOnError`, `reportBatchItemFailures`. SST `table.subscribe(...)` without `transform.eventSourceMapping` setting those fields.
- **Fix:**
  ```ts
  fn.addEventSource(new DynamoEventSource(table, {
    startingPosition: StartingPosition.LATEST, retryAttempts: 3, bisectBatchOnError: true,
    maxRecordAge: Duration.hours(1), reportBatchItemFailures: true, onFailure: new SqsDlq(dlq),
  }));
  ```
  Hand off generic event-source tuning to `aws-messaging`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/lambda/latest/dg/services-dynamodb-errors.html ; https://docs.aws.amazon.com/lambda/latest/dg/services-ddb-batchfailurereporting.html
- **Last verified:** 2026-10-12

### DDB-022 — Use the Document client and SDK marshallers instead of hand-built AttributeValues
- **Severity:** low
- **Category:** readability
- **Applies to:** TypeScript, Go
- **Rule:** In TS use `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb` (with `marshallOptions: { removeUndefinedValues: true }` when objects may hold `undefined`). In Go use `attributevalue.MarshalMap`/`UnmarshalListOfMaps` with `dynamodbav` tags.
- **Why:** Hand-written `{ S: ... }`/`{ N: String(x) }` maps are verbose and error-prone: wrong types break GSI keys (type mismatch → `ValidationException`), and numbers lose precision when converted by hand.
- **Detect:** TS `@aws-sdk/client-dynamodb` commands with literal `{ S: `, `{ N: `, `{ BOOL: ` objects across many fields; Go `&types.AttributeValueMemberS{Value: ...}` built field by field for whole items.
- **Fix:**
  ```ts
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html ; https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-dynamodb ; https://github.com/aws/aws-sdk-go-v2/tree/main/feature/dynamodb/attributevalue
- **Last verified:** 2026-10-12

### DDB-023 — Wire table access with SST link instead of env vars plus hand-written IAM
- **Severity:** low
- **Category:** simplicity
- **Applies to:** SST, TypeScript
- **Rule:** In SST v3 pass tables to functions with `link: [table]` and read `Resource.<Name>.name` in code.
- **Why:** Manual `environment: { TABLE: table.name }` plus `permissions: [{ actions: [...], resources: [...] }]` drifts: the env var survives a rename while the policy points to the old ARN, or the policy forgets `${arn}/index/*` and GSI queries fail with `AccessDeniedException`. `link` grants table and index access and injects the name together.
- **Detect:** `new sst.aws.Function(` / `sst.aws.ApiGatewayV2` routes with `environment:` holding `<table>.name` and `permissions:` listing `dynamodb:` actions for the same table; code reading `process.env.TABLE_NAME`.
- **Fix:**
  ```ts
  const table = new sst.aws.Dynamo("Orders", { fields, primaryIndex });
  new sst.aws.Function("Api", { handler: "src/api.handler", link: [table] });
  // src/api.ts
  import { Resource } from "sst";
  const TableName = Resource.Orders.name;
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/linking ; https://sst.dev/docs/component/aws/dynamo
- **Last verified:** 2026-10-12

### DDB-024 — Move storage-heavy, rarely read tables to Standard-IA
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** When a table's storage cost exceeds about 50% of its read/write cost (logs, history, archives), use the Standard-IA table class.
- **Why:** Standard-IA storage is $0.10/GB-month vs $0.25 in us-east-1, with higher request prices. A 2 TB audit table read rarely saves about 2,048 × $0.15 ≈ $307/month.
- **Detect:** Terraform `aws_dynamodb_table` for `*log*`, `*audit*`, `*history*`, `*archive*` tables without `table_class = "STANDARD_INFREQUENT_ACCESS"`; CDK without `tableClass: TableClass.STANDARD_INFREQUENT_ACCESS`. Flag only with evidence of size or access pattern; at most two class changes per 30 days.
- **Fix:** `table_class = "STANDARD_INFREQUENT_ACCESS"`. Hand off account-wide cost review to `aws-cost`.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.tableclasses.html ; https://aws.amazon.com/dynamodb/pricing/on-demand/
- **Last verified:** 2026-10-12

### DDB-025 — Use strongly consistent reads only where stale reads are wrong
- **Severity:** low
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** Leave `ConsistentRead` off by default; turn it on only for read-after-write paths that need it (for example right after a conditional write the caller depends on).
- **Why:** A strongly consistent read costs twice an eventually consistent one, and so does a consistent Scan. Setting it on a shared client wrapper doubles every read bill.
- **Detect:** `ConsistentRead: true` set in a shared helper, a default params object, or on high-volume list/Scan endpoints.
- **Fix:** Remove the default; pass `ConsistentRead: true` only at the call sites that need it.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html ; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html#Scan.ReadConsistency
- **Last verified:** 2026-10-12

### DDB-026 — Cap on-demand throughput on tables exposed to untrusted traffic
- **Severity:** low
- **Category:** cost
- **Applies to:** Terraform, CDK
- **Rule:** For on-demand tables behind public endpoints, set a maximum read/write request rate so a bug or abuse cannot scale the bill without bound.
- **Why:** On-demand scales with traffic, so a retry storm or a scraper scales the bill too. A max throughput turns that into throttling you can alarm on.
- **Detect:** `billing_mode = "PAY_PER_REQUEST"` with no `on_demand_throughput { max_read_request_units, max_write_request_units }`; CDK `Billing.onDemand()` without `maxReadRequestUnits`/`maxWriteRequestUnits`, for tables reached from public APIs.
- **Fix:**
  ```hcl
  on_demand_throughput {
    max_read_request_units  = 2000
    max_write_request_units = 500
  }
  ```
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/on-demand-capacity-mode-max-throughput.html ; https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table#on_demand_throughput
- **Last verified:** 2026-10-12

### DDB-027 — Read from a GSI only the attributes it projects
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** Code that queries a GSI may use only the table keys, the index keys and the attributes the index projects. If it needs more, add them to the projection (`INCLUDE`) or `GetItem` the base table by the returned keys.
- **Why:** Global secondary index queries cannot fetch attributes from the base table (unlike local secondary indexes). Non-projected attributes are simply absent, so the code reads `undefined`/zero values with no error: empty columns in exports, `NaN` totals, wrong authorization decisions. A `ProjectionExpression` that names a non-projected attribute returns nothing for it either.
- **Detect:** A Query/Scan with `IndexName: "<gsi>"` whose results are used as `item.<attr>` (TS) or unmarshalled into a struct with `dynamodbav:"<attr>"` fields (Go), where `<attr>` is neither a table key, an index key, nor in the index's projection: Terraform `projection_type = "KEYS_ONLY"` or `INCLUDE` with `non_key_attributes` not listing it; CDK `projectionType: ProjectionType.KEYS_ONLY`/`INCLUDE` with `nonKeyAttributes`; SST `projection: "keys-only"` or an attribute list. `ALL` projections are never affected.
- **Fix:**
  ```hcl
  projection_type    = "INCLUDE"
  non_key_attributes = ["total", "customerId", "currency"] # add what the query code reads
  ```
  Or, for rarely needed fields, `BatchGetItem` the base table with the keys the index returned (apply DDB-002).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html ; https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html#DDB-Query-request-Select
- **Last verified:** 2026-10-12

### DDB-028 — Let the sort key and Limit pick the newest or top-N items
- **Severity:** medium
- **Category:** cost
- **Applies to:** TypeScript, Go
- **Rule:** When only the latest (or first) N items of an item collection are needed, query with `ScanIndexForward: false` (or `true`) and `Limit: N` on a sort key that orders them. Do not read the whole collection and sort or slice it in code.
- **Why:** Query results are already ordered by sort key, and capacity is billed for every item read. Reading a customer's 5,000 orders to show the last 10 pays for 5,000 item reads per request and grows with the collection, and it silently breaks at the 1 MB page boundary if the code does not paginate (DDB-001).
- **Detect:** A `QueryCommand`/`paginateQuery`/`client.Query(` with no `Limit` whose result is then `.sort(`ed, `.slice(-N)`/`.slice(0, N)`, `.at(-1)`, `Items[Items.length - 1]`, `.reverse()`, or Go `sort.Slice(` followed by `[:N]`, on a key condition that already uses the sort key (`begins_with(sk, ...)`, `sk BETWEEN ...`).
- **Fix:**
  ```ts
  const { Items } = await ddb.send(new QueryCommand({
    TableName, KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)",
    ExpressionAttributeValues: { ":pk": pk, ":p": "ORDER#" },
    ScanIndexForward: false, Limit: 10,
  }));
  ```
  The sort key must sort the way you need (ISO-8601 timestamps or zero-padded numbers inside string keys).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html#DDB-Query-request-ScanIndexForward
- **Last verified:** 2026-10-12
