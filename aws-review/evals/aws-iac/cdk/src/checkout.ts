import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TableName = process.env.ORDERS_TABLE!;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = JSON.parse(event.body ?? '{}');
  await ddb.send(new PutCommand({ TableName, Item: { pk: body.id, status: 'PENDING' } }));
  return { statusCode: 201, body: JSON.stringify({ id: body.id }) };
};
