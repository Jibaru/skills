import type { APIGatewayProxyEventV2, Callback, Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = (event: APIGatewayProxyEventV2, _context: Context, callback: Callback) => {
  const id = event.pathParameters?.id;
  if (!id) {
    callback(null, { statusCode: 400, body: "missing id" });
    return;
  }

  ddb
    .send(new GetCommand({ TableName: process.env.REPORTS_TABLE!, Key: { pk: `REPORT#${id}` } }))
    .then((res) => {
      if (!res.Item) return callback(null, { statusCode: 404, body: "not found" });
      callback(null, { statusCode: 200, body: JSON.stringify(res.Item) });
    })
    .catch((err) => callback(err));
};
