import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { KinesisStreamBatchResponse, KinesisStreamEvent } from "aws-lambda";
import { Resource } from "sst";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Click = { clickId: string; userId: string; path: string; at: string };

async function storeClick(click: Click): Promise<void> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: Resource.Clicks.name,
        Item: { pk: `CLICK#${click.clickId}`, userId: click.userId, path: click.path, at: click.at },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  } catch (err) {
    if (!(err instanceof ConditionalCheckFailedException)) throw err;
  }
}

export const handler = async (event: KinesisStreamEvent): Promise<KinesisStreamBatchResponse> => {
  for (const record of event.Records) {
    try {
      const click = JSON.parse(Buffer.from(record.kinesis.data, "base64").toString("utf8")) as Click;
      await storeClick(click);
    } catch (err) {
      console.error("click failed", { seq: record.kinesis.sequenceNumber, err });
      return { batchItemFailures: [{ itemIdentifier: record.kinesis.sequenceNumber }] };
    }
  }
  return { batchItemFailures: [] };
};
