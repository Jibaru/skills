import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.ORDERS_TABLE!;

type Order = { orderId: string; customerId: string; total: number };

async function saveOrder(record: SQSRecord): Promise<void> {
  const order = JSON.parse(record.body) as Order;
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: `ORDER#${order.orderId}`, customerId: order.customerId, total: order.total },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return; // already stored
    throw err;
  }
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];
  for (const record of event.Records) {
    try {
      await saveOrder(record);
    } catch (err) {
      console.error("order failed", { messageId: record.messageId, err });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
