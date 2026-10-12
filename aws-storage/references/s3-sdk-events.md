# S3: SDK usage, event notifications and request performance

Application code that talks to S3 (AWS SDK for JavaScript v3, aws-sdk-go-v2) and the event
wiring around buckets. Lambda configuration itself (timeouts, memory, concurrency) is
`aws-compute`'s lane; queue/DLQ design behind S3 events is `aws-messaging`'s.

### S3-025 — Paginate ListObjectsV2
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Every listing that can exceed 1,000 keys uses the SDK paginator (or loops on `IsTruncated`/`NextContinuationToken`).
- **Why:** One `ListObjectsV2` call returns at most 1,000 keys. Code that calls it once silently processes only the first 1,000: cleanups skip files, exports are truncated, "count" endpoints lie once the prefix grows.
- **Detect:** TS `new ListObjectsV2Command(` sent once with no loop on `ContinuationToken`/`IsTruncated` and no `paginateListObjectsV2`; Go `client.ListObjectsV2(ctx, ...)` without `NewListObjectsV2Paginator` or a `for` on `IsTruncated`. Same for `ListObjectVersions`, `ListMultipartUploads`, `ListParts`.
- **Fix:**
  ```ts
  import { paginateListObjectsV2 } from "@aws-sdk/client-s3";
  for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket, Prefix })) {
    for (const obj of page.Contents ?? []) { /* ... */ }
  }
  ```
  ```go
  p := s3.NewListObjectsV2Paginator(client, &s3.ListObjectsV2Input{Bucket: aws.String(bucket), Prefix: aws.String(prefix)})
  for p.HasMorePages() {
      page, err := p.NextPage(ctx)
      if err != nil { return err }
      for _, o := range page.Contents { _ = o }
  }
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
- **Last verified:** 2026-10-12

### S3-026 — Always consume or close the GetObject body
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** In TS, read `Body` to completion (`transformToString()`, `transformToByteArray()`, pipe) or call `Body.destroy()`; in Go, `defer out.Body.Close()` right after a successful `GetObject`.
- **Why:** An unconsumed stream holds its socket. The JS SDK v3 Node handler defaults to 50 sockets per client; after 50 leaked bodies (for example, a `GetObject` used only to read `ContentType`/`Metadata`, or an early `return` on a validation error) every later S3 call queues and the function hangs until timeout. In Go an unclosed body leaks the connection and file descriptors.
- **Detect:** TS `await s3.send(new GetObjectCommand(...))` whose result's `Body` is never read or destroyed on some path; `GetObjectCommand` used only for metadata (should be `HeadObjectCommand`). Go `client.GetObject(` with no `Body.Close()` in the same function.
- **Fix:**
  ```ts
  const out = await s3.send(new GetObjectCommand({ Bucket, Key }));
  const text = await out.Body!.transformToString();
  ```
  ```go
  out, err := client.GetObject(ctx, &s3.GetObjectInput{Bucket: &bucket, Key: &key})
  if err != nil { return err }
  defer out.Body.Close()
  ```
  Use `HeadObjectCommand` when only metadata is needed.
- **Volatile:** yes (50-socket default)
- **Source:** https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/CLIENTS.md ; https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
- **Last verified:** 2026-10-12

### S3-027 — Use the managed uploader for large or streamed bodies
- **Severity:** medium
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Upload objects that can exceed ~100 MB, or streams of unknown length, with `Upload` from `@aws-sdk/lib-storage` (TS) or `feature/s3/transfermanager` (Go); don't buffer whole files in memory for `PutObject`.
- **Why:** A single `PutObject` tops out at 5 GB, retries resend the whole body, and buffering (`readFileSync`, `io.ReadAll`) a large file OOM-kills a Lambda/container. Multipart parts are 5 MiB–5 GiB, max 10,000 parts, and AWS recommends multipart from 100 MB. The Go `feature/s3/manager` uploader/downloader are marked `Deprecated: superceded by feature/s3/transfermanager` (GA January 30, 2026).
- **Detect:** TS `PutObjectCommand({ Body: fs.readFileSync(...) | await file.arrayBuffer() | Buffer.concat(chunks) })` for user files/exports; `PutObjectCommand` with a stream `Body` and no `ContentLength`; Go `io.ReadAll(` feeding `PutObject`, imports of `github.com/aws/aws-sdk-go-v2/feature/s3/manager`.
- **Fix:**
  ```ts
  import { Upload } from "@aws-sdk/lib-storage";
  await new Upload({ client: s3, params: { Bucket, Key, Body: stream }, queueSize: 4, partSize: 8 * 1024 * 1024 }).done();
  ```
  ```go
  tm := transfermanager.New(client)
  _, err := tm.UploadObject(ctx, &transfermanager.UploadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key), Body: f})
  ```
  Pair with S3-013 so abandoned parts are aborted.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html ; https://github.com/aws/aws-sdk-go-v2/tree/main/feature/s3/transfermanager ; https://github.com/aws/aws-sdk-go-v2/discussions/3306
- **Last verified:** 2026-10-12

### S3-028 — URL-decode object keys from S3 event notifications
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Decode `s3.object.key` as `application/x-www-form-urlencoded` (`+` → space, then percent-decode) before using it in an SDK call.
- **Why:** The key in the event is URL-encoded: `red flower.jpg` arrives as `red+flower.jpg`. Passing it straight to `GetObject` returns `NoSuchKey`/403 for any key with spaces, accents or special characters, so uploads from real users fail while test files named `test.jpg` pass.
- **Detect:** TS `record.s3.object.key` (or `Records[0].s3.object.key`) used directly as `Key:`; `decodeURIComponent(key)` without replacing `+` first. Go `record.S3.Object.Key` used without `url.QueryUnescape` (`events.S3Object.URLDecodedKey` is already decoded with `url.QueryUnescape` when the event is unmarshalled, so code using it is correct).
- **Fix:**
  ```ts
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  ```
  ```go
  key, err := url.QueryUnescape(record.S3.Object.Key) // or record.S3.Object.URLDecodedKey
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html ; https://github.com/aws/aws-lambda-go/blob/main/events/s3.go
- **Last verified:** 2026-10-12

### S3-029 — Don't let an S3-triggered function write back into its trigger scope
- **Severity:** critical
- **Category:** bug
- **Applies to:** Terraform, CDK, SST, TypeScript, Go
- **Rule:** A function triggered by `ObjectCreated` on a bucket writes its output to another bucket, or to a prefix/suffix the trigger filter excludes.
- **Why:** Writing into the triggering scope re-triggers the function on its own output: an infinite loop that scales to account concurrency and bills invocations, PUTs and storage. Lambda's recursive-loop detection stops it after ~16 iterations per chain only for supported SDK versions; every original upload still costs ~16 invocations and objects, and other compute (ECS consumers via SQS) has no such guard.
- **Detect:** Notification with no `filter_prefix`/`filterPrefix` (or a prefix that also covers the output) and handler code calling `PutObjectCommand`/`CopyObjectCommand`/`Upload`/Go `PutObject` with `Bucket` equal to the event's bucket (`record.s3.bucket.name`, `Resource.X.name` of the same bucket). E.g. trigger on `uploads/`, write to `uploads/thumbs/`.
- **Fix:** Trigger on `incoming/`, write to `processed/` (disjoint prefixes), or use two buckets:
  ```ts
  bucket.notify({ notifications: [{ name: "Resize", function: "src/resize.handler", events: ["s3:ObjectCreated:*"], filterPrefix: "incoming/" }] });
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html ; https://docs.aws.amazon.com/lambda/latest/dg/with-s3.html ; https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html
- **Last verified:** 2026-10-12

### S3-030 — Make S3 event handlers idempotent and order-aware
- **Severity:** medium
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Handlers tolerate duplicate deliveries and out-of-order events; when maintaining an index of objects, compare and store the `sequencer` per key.
- **Why:** S3 notifications are at-least-once and not ordered. A handler that charges, emails or increments a counter per event does it twice on a duplicate; an index updated by a late `ObjectCreated` after an `ObjectRemoved` resurrects a deleted object.
- **Detect:** Handlers on S3 events that perform non-idempotent side effects (`sendEmail`, `UpdateItem` with `ADD`, payments) without a dedupe key (`eTag`+`key`+`versionId`, or `sequencer`), and DynamoDB/SQL index writers that ignore `record.s3.object.sequencer`.
- **Fix:** Conditional write keyed on `bucket/key/versionId` or `sequencer` (DynamoDB `ConditionExpression: "attribute_not_exists(pk) OR #seq < :seq"`), or Powertools idempotency. Compare sequencers by left-padding to equal length.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html
- **Last verified:** 2026-10-12

### S3-031 — One notification configuration per bucket; use EventBridge for many consumers
- **Severity:** high
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** A bucket's notifications are declared in a single place (one `aws_s3_bucket_notification` with all destinations); when several teams/stacks need the same events, enable EventBridge on the bucket and give each consumer its own rule.
- **Why:** `PutBucketNotificationConfiguration` replaces the whole configuration. Two `aws_s3_bucket_notification` resources (or Terraform plus a CDK/SST stack on the same bucket) overwrite each other on every apply; one consumer silently stops receiving events. Overlapping prefix/suffix filters for the same event type are rejected.
- **Detect:** More than one `aws_s3_bucket_notification` with the same `bucket`; a bucket imported into CDK (`Bucket.fromBucketName`) with `addEventNotification` while Terraform also manages notifications; SST deprecated `bucket.subscribe`/`subscribeQueue`/`subscribeTopic` (no longer documented; `notify` is the documented method) mixed with `notify`, or `notify` called more than once on the same bucket.
- **Fix:** Terraform `aws_s3_bucket_notification { eventbridge = true }` + `aws_cloudwatch_event_rule` per consumer; CDK `eventBridgeEnabled: true`; SST one `bucket.notify({ notifications: [...] })` call.
- **Volatile:** no
- **Source:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_notification ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventBridge.html ; https://sst.dev/docs/component/aws/bucket/
- **Last verified:** 2026-10-12

### S3-032 — Send S3 notifications to a standard SQS queue that accepts 64 KB messages
- **Severity:** medium
- **Category:** bug
- **Applies to:** Terraform, CDK, SST
- **Rule:** SQS destinations are standard queues (FIFO only through EventBridge) with `MaximumMessageSize` ≥ 64 KB, and the queue policy allows `s3.amazonaws.com` with `aws:SourceArn` = the bucket.
- **Why:** FIFO queues are not a supported destination (the configuration fails). If an event exceeds the queue's `MaximumMessageSize`, SQS rejects it and the event is lost without error on your side.
- **Detect:** `aws_s3_bucket_notification { queue { queue_arn = aws_sqs_queue.x.arn } }` where `x` has `fifo_queue = true` or `max_message_size` < 65536; CDK `new s3n.SqsDestination(queue)` on a `fifo: true` queue or `maxMessageSizeBytes` < 65536.
- **Fix:** Standard queue with default max message size, DLQ on the queue (hand off to `aws-messaging`); for ordering, route via EventBridge to FIFO.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html
- **Last verified:** 2026-10-12

### S3-033 — Use conditional writes instead of check-then-put
- **Severity:** high
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** To create-if-absent use `IfNoneMatch: "*"` on `PutObject`/`CompleteMultipartUpload`/`CopyObject`; to update-if-unchanged use `IfMatch: <etag>`. Handle `412 PreconditionFailed` (and `409` on concurrent delete).
- **Why:** `HeadObject` → "not found" → `PutObject` is a race: two writers both see "absent" and the last one silently overwrites the first (S3 is last-writer-wins and has no locks). Typical victims: idempotency markers, "claim this job" files, lock objects, user-chosen filenames.
- **Detect:** `HeadObjectCommand`/`GetObjectCommand` in a `try` whose `NotFound`/`NoSuchKey` branch then sends `PutObjectCommand` for the same key; Go `HeadObject` followed by `PutObject` on the same key; comments like "check if exists".
- **Fix:**
  ```ts
  try {
    await s3.send(new PutObjectCommand({ Bucket, Key, Body, IfNoneMatch: "*" }));
  } catch (e) {
    if ((e as { name?: string }).name === "PreconditionFailed") return "already-exists";
    throw e;
  }
  ```
  Go: `IfNoneMatch: aws.String("*")` in `s3.PutObjectInput`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel
- **Last verified:** 2026-10-12

### S3-034 — Remove sleeps and retry loops that wait for S3 consistency
- **Severity:** low
- **Category:** simplicity
- **Applies to:** TypeScript, Go
- **Rule:** Read-after-write, overwrite and delete followed by GET/LIST are strongly consistent; delete code that sleeps or polls for an object it just wrote.
- **Why:** Waits written for the pre-2020 eventual-consistency model add latency and Lambda duration for nothing, and polling loops add billed GET/HEAD/LIST requests.
- **Detect:** `setTimeout`/`await sleep(`/`time.Sleep(` adjacent to S3 put/get; `waitUntilObjectExists` right after a successful `PutObject` by the same code; retry loops on `NoSuchKey` immediately after writing.
- **Fix:** Drop the wait; read immediately after the successful PUT response. (Bucket configuration changes, like enabling versioning, are still eventually consistent.)
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel
- **Last verified:** 2026-10-12

### S3-035 — Batch deletes with DeleteObjects and check its per-key errors
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** Delete many keys with `DeleteObjects` (≤ 1,000 keys per call), then inspect `Errors` in the response; or let a lifecycle expiration do bulk deletes.
- **Why:** `DeleteObjects` returns HTTP 200 even when some keys failed (e.g., `AccessDenied`); code that only awaits the call reports success while objects remain. Looping `DeleteObject` one key at a time is up to 1,000× more calls and slower.
- **Detect:** `DeleteObjectsCommand`/`client.DeleteObjects` whose result's `Errors` is never read; `for ... await s3.send(new DeleteObjectCommand(...))` over a list; batches built without chunking to 1,000.
- **Fix:**
  ```ts
  const out = await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: chunk.map(Key => ({ Key })), Quiet: true } }));
  if (out.Errors?.length) throw new Error(`failed to delete ${out.Errors.length} keys: ${out.Errors[0].Code}`);
  ```
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
- **Last verified:** 2026-10-12

### S3-036 — Spread hot keys across prefixes and let the SDK retry 503 Slow Down
- **Severity:** medium
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Design keys so high-rate workloads spread over many prefixes, and keep SDK retries on (never `maxAttempts: 1` for bulk jobs).
- **Why:** S3 scales per partitioned prefix (at least 3,500 PUT/COPY/POST/DELETE and 5,500 GET/HEAD per second) and scales gradually, returning `503 Slow Down` meanwhile. A batch writing 20,000 objects/s under one date prefix (`2026/10/12/...`) with retries disabled drops writes.
- **Detect:** Keys built as `${date}/${id}` or a single constant prefix in high-throughput writers (`Promise.all` over thousands of `PutObject`, Go worker pools); `new S3Client({ maxAttempts: 1 })`, Go `retry.AddWithMaxAttempts(..., 1)` or `aws.NopRetryer`.
- **Fix:** Put a high-cardinality component early (`${tenantId}/${date}/...` or a hash shard), keep default/standard or adaptive retry mode, and bound concurrency.
- **Volatile:** yes
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html
- **Last verified:** 2026-10-12

### S3-037 — Let S3 move the bytes: presigned URLs and CopyObject
- **Severity:** medium
- **Category:** performance
- **Applies to:** TypeScript, Go
- **Rule:** Clients upload/download directly with presigned URLs (or via CloudFront) instead of streaming files through Lambda/API Gateway; server-side copies use `CopyObject`/`UploadPartCopy`, not `GetObject` + `PutObject`.
- **Why:** Proxying through Lambda pays duration for every byte, hits payload limits (API Gateway and Lambda response size caps) and doubles transfer; `GetObject`+`PutObject` to copy pulls data into compute and back for no reason.
- **Detect:** Handlers that `GetObject` and return `Body` base64-encoded in the HTTP response; handlers receiving multipart file uploads and calling `PutObjectCommand`; `GetObjectCommand` immediately followed by `PutObjectCommand` with the same `Body` to another key/bucket.
- **Fix:** Return `getSignedUrl(...)` (S3-006/S3-007) or a CloudFront URL; use `new CopyObjectCommand({ Bucket, Key, CopySource: \`${srcBucket}/${encodeURIComponent(srcKey)}\` })` (multipart copy above 5 GB). Hand off API Gateway limits to `aws-networking`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html ; https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html
- **Last verified:** 2026-10-12

### S3-038 — Use SST `link` instead of hand-wired bucket names and IAM
- **Severity:** low
- **Category:** simplicity
- **Applies to:** SST, TypeScript
- **Rule:** In SST v3, pass the bucket with `link: [bucket]` and read `Resource.<Name>.name` in code, instead of an `environment` variable plus a hand-written `permissions` block.
- **Why:** Manual env + IAM drifts: renames break the env var, the IAM statement is often `s3:*` on `*` or misses `/*` (S3-009), and typos only fail at runtime. `link` scopes permissions to that one bucket (not `*`) and gives typed access. It is not least-privilege inside the bucket; if a function must only read, hand-write a narrow statement instead and hand off the IAM review to `aws-security`.
- **Detect:** In an SST v3 app, `sst.aws.Function`/`sst.aws.Nextjs`/etc. in `sst.config.ts` with `environment: { BUCKET: bucket.name }` and `permissions: [{ actions: ["s3:..."], resources: [...] }]`, and the handler it points to reading that env var. Don't flag `process.env.*` in code that no `sst.config.ts` component deploys (plain Lambda, CDK, Terraform).
- **Fix:**
  ```ts
  // sst.config.ts
  new sst.aws.Function("Api", { handler: "src/api.handler", link: [bucket] });
  // src/api.ts
  import { Resource } from "sst";
  await s3.send(new GetObjectCommand({ Bucket: Resource.Uploads.name, Key }));
  ```
- **Volatile:** no
- **Source:** https://sst.dev/docs/component/aws/bucket/ ; https://sst.dev/docs/linking/
- **Last verified:** 2026-10-12

### S3-039 — Encode the copy source key
- **Severity:** medium
- **Category:** bug
- **Applies to:** TypeScript, Go
- **Rule:** `CopySource` is `bucket/key` with the key URL-encoded.
- **Why:** Keys with spaces, `+`, `#`, `?` or non-ASCII characters produce `NoSuchKey` or copy the wrong object when concatenated raw, so moves of user-named files fail intermittently.
- **Detect:** TS `CopySource: \`${bucket}/${key}\``; Go `CopySource: aws.String(bucket + "/" + key)` without `url.PathEscape`/`url.QueryEscape` on the key.
- **Fix:** TS `CopySource: \`${bucket}/${encodeURIComponent(key)}\``; Go `aws.String(bucket + "/" + url.PathEscape(key))`.
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html
- **Last verified:** 2026-10-12

### S3-040 — Map NoSuchKey/NotFound explicitly instead of swallowing every error
- **Severity:** medium
- **Category:** reliability
- **Applies to:** TypeScript, Go
- **Rule:** Treat "object missing" by its error type (`NoSuchKey` from GetObject, `NotFound` from HeadObject; Go `*types.NoSuchKey` / `*types.NotFound` via `errors.As`) and rethrow everything else.
- **Why:** A blanket `catch { return null }` turns `AccessDenied`, throttling (`SlowDown`) and network errors into "file not found", so a permissions regression shows up as missing data or as duplicates being recreated.
- **Detect:** `try { await s3.send(new GetObjectCommand|HeadObjectCommand(...)) } catch { return null | false | undefined }` with no check of `e.name`/`$metadata.httpStatusCode`; Go `if err != nil { return nil, nil }` after `GetObject`/`HeadObject`.
- **Fix:**
  ```go
  var nsk *types.NoSuchKey
  if errors.As(err, &nsk) { return nil, ErrNotFound }
  if err != nil { return nil, err }
  ```
  TS: `if (e instanceof NoSuchKey) return null; throw e;` (import `NoSuchKey` from `@aws-sdk/client-s3`).
- **Volatile:** no
- **Source:** https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html ; https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
- **Last verified:** 2026-10-12
