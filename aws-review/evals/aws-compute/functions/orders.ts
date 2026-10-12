import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ORDERS_TABLE!;

type Order = { orderId: string; customerId: string; totalCents: number };

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const order = JSON.parse(record.body) as Order;
      await ddb.send(
        new PutCommand({
          TableName: tableName,
          Item: { pk: `ORDER#${order.orderId}`, ...order },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
    } catch (err) {
      if ((err as Error).name === "ConditionalCheckFailedException") continue;
      console.error("order failed", { messageId: record.messageId, err });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
