import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, paginateQuery } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TableName = process.env.ORDERS_TABLE!;

export async function exportShippedSince(since: string): Promise<string> {
  const lines = ["customerId,total,createdAt"];

  const pages = paginateQuery(
    { client: ddb, pageSize: 500 },
    {
      TableName,
      IndexName: "byStatus",
      KeyConditionExpression: "#status = :status AND createdAt >= :since",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "SHIPPED", ":since": since },
    },
  );

  for await (const page of pages) {
    for (const item of page.Items ?? []) {
      lines.push(`${item.customerId},${item.total},${item.createdAt}`);
    }
  }

  return lines.join("\n");
}
