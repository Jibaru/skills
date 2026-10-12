import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { Resource } from "sst";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SESSION_TTL_MS = 30 * 60 * 1000;

export const handler = async (event: APIGatewayProxyEventV2) => {
  const { userId } = JSON.parse(event.body ?? "{}");
  const sessionId = randomUUID();

  await ddb.send(
    new PutCommand({
      TableName: Resource.Sessions.name,
      Item: {
        pk: `SESSION#${sessionId}`,
        userId,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );

  return { statusCode: 201, body: JSON.stringify({ sessionId }) };
};
