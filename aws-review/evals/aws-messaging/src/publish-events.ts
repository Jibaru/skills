import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

const eb = new EventBridgeClient({});
const BUS_NAME = process.env.ORDERS_BUS_NAME!;

type PlacedOrder = { orderId: string; customerId: string; total: number };

export const handler: APIGatewayProxyHandlerV2 = async (req) => {
  const orders = JSON.parse(req.body ?? "[]") as PlacedOrder[];

  for (let i = 0; i < orders.length; i += 10) {
    const chunk = orders.slice(i, i + 10);
    await eb.send(
      new PutEventsCommand({
        Entries: chunk.map((order) => ({
          EventBusName: BUS_NAME,
          Source: "com.shop.orders",
          DetailType: "OrderPlaced",
          Detail: JSON.stringify(order),
        })),
      }),
    );
  }

  return { statusCode: 202, body: JSON.stringify({ accepted: orders.length }) };
};
