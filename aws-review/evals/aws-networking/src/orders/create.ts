import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Resource } from "sst";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface CreateOrderBody {
  customerId: string;
  totalCents: number;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const body = JSON.parse(event.body ?? "{}") as CreateOrderBody;
  const id = randomUUID();

  await ddb.send(
    new PutCommand({
      TableName: Resource.Orders.name,
      Item: {
        pk: `ORDER#${id}`,
        sk: "META",
        customerId: body.customerId,
        totalCents: body.totalCents,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );

  return { statusCode: 201, body: JSON.stringify({ id }) };
};
