import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TableName = process.env.ORDERS_TABLE!;

export interface CustomerSummary {
  customerId: string;
  orderCount: number;
  lifetimeTotal: number;
}

export async function getCustomerSummary(customerId: string): Promise<CustomerSummary> {
  const result = await ddb.send(
    new QueryCommand({
      TableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :order)",
      ExpressionAttributeValues: {
        ":pk": `CUSTOMER#${customerId}`,
        ":order": "ORDER#",
      },
    }),
  );

  const orders = result.Items ?? [];
  const lifetimeTotal = orders.reduce((sum, o) => sum + Number(o.total), 0);

  return { customerId, orderCount: orders.length, lifetimeTotal };
}
