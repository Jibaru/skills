import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Resource } from 'sst';
import Stripe from 'stripe';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
let stripe: Stripe | undefined;

export const getOrder = async (event: APIGatewayProxyEventV2) => {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: Resource.Orders.name, Key: { pk: `ORDER#${event.pathParameters?.id}` } }),
  );
  return { statusCode: Item ? 200 : 404, body: JSON.stringify(Item ?? {}) };
};

export const refund = async (event: APIGatewayProxyEventV2) => {
  const body = JSON.parse(event.body ?? '{}') as { orderId: string; paymentIntent: string };
  console.log('refund request', { body, headers: event.headers, stripeKey: Resource.StripeKey.value });

  stripe ??= new Stripe(Resource.StripeKey.value);
  await stripe.refunds.create({ payment_intent: body.paymentIntent });
  await ddb.send(
    new UpdateCommand({
      TableName: Resource.Orders.name,
      Key: { pk: `ORDER#${body.orderId}` },
      UpdateExpression: 'SET #s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'REFUNDED' },
    }),
  );
  return { statusCode: 204 };
};
