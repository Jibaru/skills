import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const cloudwatch = new CloudWatchClient({});
const secrets = new SecretsManagerClient({});
const sfn = new SFNClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body ?? "{}");
  const userId: string = body.userId;

  const secret = await secrets.send(
    new GetSecretValueCommand({ SecretId: process.env.PAYMENT_SECRET_ID }),
  );
  const apiKey = JSON.parse(secret.SecretString ?? "{}").apiKey;

  const preauth = await fetch("https://payments.example.com/v1/preauth", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, amount: body.amount }),
  });
  if (!preauth.ok) {
    return { statusCode: 402, body: JSON.stringify({ error: "payment declined" }) };
  }

  const execution = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: process.env.CHECKOUT_FLOW_ARN,
      input: JSON.stringify({ userId, items: body.items }),
    }),
  );

  await cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: "Orders/Checkout",
      MetricData: [
        {
          MetricName: "CheckoutStarted",
          Value: 1,
          Unit: "Count",
          Dimensions: [
            { Name: "Service", Value: "checkout" },
            { Name: "UserId", Value: userId },
          ],
        },
      ],
    }),
  );

  return { statusCode: 202, body: JSON.stringify({ executionArn: execution.executionArn }) };
};
