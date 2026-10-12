import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Resource } from "sst";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = JSON.parse(event.body ?? "{}");
  await ddb.send(
    new PutCommand({
      TableName: Resource.Orders.name,
      Item: { pk: body.id, status: "PENDING" },
    }),
  );
  return { statusCode: 201, body: JSON.stringify({ id: body.id }) };
};
