import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import Stripe from "stripe";
import { Resource } from "sst";

const stripe = new Stripe(process.env.STRIPE_KEY!);
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const evt = JSON.parse(event.body ?? "{}") as Stripe.Event;
  if (evt.type !== "checkout.session.completed") return { statusCode: 200 };
  const session = await stripe.checkout.sessions.retrieve((evt.data.object as { id: string }).id);
  await ddb.send(
    new UpdateCommand({
      TableName: Resource.Orders.name,
      Key: { pk: session.client_reference_id },
      UpdateExpression: "SET #s = :paid",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":paid": "PAID" },
    }),
  );
  return { statusCode: 200 };
};
