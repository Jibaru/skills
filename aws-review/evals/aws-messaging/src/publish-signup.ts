import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Resource } from "sst";

const sns = new SNSClient({});

export const handler: APIGatewayProxyHandlerV2 = async (req) => {
  const { userId, email } = JSON.parse(req.body ?? "{}") as { userId: string; email: string };

  await sns.send(
    new PublishCommand({
      TopicArn: Resource.Signups.arn,
      Message: JSON.stringify({ eventType: "signup", userId, email }),
    }),
  );

  return { statusCode: 201, body: JSON.stringify({ userId }) };
};
