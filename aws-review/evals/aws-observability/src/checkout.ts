import { Logger } from "@aws-lambda-powertools/logger";
import { search, correlationPaths } from "@aws-lambda-powertools/logger/correlationId";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import middy from "@middy/core";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";

const logger = new Logger({ correlationIdSearchFn: search });
const metrics = new Metrics();
const tracer = new Tracer();
const ddb = DynamoDBDocumentClient.from(tracer.captureAWSv3Client(new DynamoDBClient({})));

type CheckoutRequest = { customerId: string; items: { sku: string; qty: number; price: number }[] };

const lambdaHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const body = JSON.parse(event.body ?? "{}") as CheckoutRequest;
  logger.appendKeys({ customerId: body.customerId });

  const orderId = randomUUID();
  const total = body.items.reduce((sum, item) => sum + item.qty * item.price, 0);

  await ddb.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: { pk: `ORDER#${orderId}`, customerId: body.customerId, total, status: "PLACED" },
    }),
  );

  metrics.addDimension("customerId", body.customerId);
  metrics.addMetric("OrderPlaced", MetricUnit.Count, 1);
  metrics.addMetadata("orderId", orderId);
  logger.info("order placed", { orderId, total });

  return { statusCode: 201, body: JSON.stringify({ orderId }) };
};

export const handler = middy(lambdaHandler)
  .use(captureLambdaHandler(tracer))
  .use(injectLambdaContext(logger, { logEvent: true, correlationIdPath: correlationPaths.API_GATEWAY_HTTP }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }));
