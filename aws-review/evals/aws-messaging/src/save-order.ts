import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Input = { orderId: string; customerId: string; total: number };

export const handler = async (input: Input): Promise<Input> => {
  await ddb.send(
    new PutCommand({
      TableName: process.env.ORDERS_TABLE,
      Item: {
        pk: `ORDER#${input.orderId}`,
        customerId: input.customerId,
        total: input.total,
        status: "RECEIVED",
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
  return input;
};
