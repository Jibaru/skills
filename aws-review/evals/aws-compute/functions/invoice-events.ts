import { BatchProcessor, EventType, processPartialResponse } from "@aws-lambda-powertools/batch";
import type { SQSEvent, SQSRecord, Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const processor = new BatchProcessor(EventType.SQS);
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type InvoiceEvent = { invoiceId: string; status: "issued" | "paid" | "void"; at: string };

const recordHandler = async (record: SQSRecord): Promise<void> => {
  const evt = JSON.parse(record.body) as InvoiceEvent;
  try {
    await ddb.send(
      new PutCommand({
        TableName: Resource.Invoices.name,
        Item: { pk: `INVOICE#${evt.invoiceId}#${evt.status}`, at: evt.at, messageId: record.messageId },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") return;
    throw err;
  }
};

export const handler = async (event: SQSEvent, context: Context) =>
  processPartialResponse(event, recordHandler, processor, { context });
