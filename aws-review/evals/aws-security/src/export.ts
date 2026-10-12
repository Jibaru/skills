import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { LambdaFunctionURLEvent } from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: LambdaFunctionURLEvent) => {
  const tenantId = event.queryStringParameters?.tenantId;
  if (!tenantId) {
    return { statusCode: 400, body: 'tenantId required' };
  }

  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `TENANT#${tenantId}` },
    }),
  );

  await fetch('https://partner.example.com/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.PARTNER_API_KEY! },
    body: JSON.stringify(Items ?? []),
  });

  return { statusCode: 200, body: JSON.stringify(Items ?? []) };
};
