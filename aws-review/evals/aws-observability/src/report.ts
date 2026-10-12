import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";

const cloudwatch = new CloudWatchClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  console.log("cold start config", { env: process.env, requestId: context.awsRequestId });

  const customerId = event.pathParameters?.customerId;
  if (!customerId) {
    return { statusCode: 400, body: JSON.stringify({ message: "customerId is required" }) };
  }

  const started = Date.now();
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: "byCustomer",
      KeyConditionExpression: "customerId = :c",
      ExpressionAttributeValues: { ":c": customerId },
    }),
  );

  await cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: "Shop/Reports",
      MetricData: [
        { MetricName: "ReportLatency", Unit: "Milliseconds", Value: Date.now() - started },
      ],
    }),
  );

  console.info("report served", { customerId, orders: result.Items?.length ?? 0 });
  return { statusCode: 200, body: JSON.stringify(result.Items ?? []) };
};
