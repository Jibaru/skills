import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TableName = process.env.ORDERS_TABLE!;

export interface ImportedOrder {
  orderId: string;
  customerId: string;
  total: number;
  status: string;
  createdAt: string;
}

export async function importOrders(orders: ImportedOrder[]): Promise<number> {
  const unique = [...new Map(orders.map((o) => [o.orderId, o])).values()];

  for (let i = 0; i < unique.length; i += 25) {
    const chunk = unique.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableName]: chunk.map((o) => ({
            PutRequest: {
              Item: {
                pk: `CUSTOMER#${o.customerId}`,
                sk: `ORDER#${o.orderId}`,
                total: o.total,
                status: o.status,
                createdAt: o.createdAt,
              },
            },
          })),
        },
      }),
    );
  }

  return unique.length;
}
