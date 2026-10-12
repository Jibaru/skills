import { BatchProcessor, EventType, processPartialResponse } from "@aws-lambda-powertools/batch";
import { IdempotencyConfig, makeIdempotent } from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
import type { Context, SQSEvent, SQSRecord } from "aws-lambda";
import { createShipment } from "./shipping";

const processor = new BatchProcessor(EventType.SQS);
const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: process.env.ORDERS_TABLE!,
  keyAttr: "pk",
});
const config = new IdempotencyConfig({ eventKeyJmesPath: "messageId" });

const handleRecord = makeIdempotent(
  async (record: SQSRecord) => {
    const order = JSON.parse(record.body) as { orderId: string; address: string };
    await createShipment(order.orderId, order.address);
  },
  { persistenceStore, config },
);

export const handler = async (event: SQSEvent, context: Context) => {
  config.registerLambdaContext(context);
  return processPartialResponse(event, handleRecord, processor, { context });
};
