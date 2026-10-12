import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { S3Handler } from "aws-lambda";
import { Resource } from "sst";

const s3 = new S3Client({});

function parseCsv(text: string): Record<string, string>[] {
  const [header, ...lines] = text.trim().split("\n");
  const columns = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? ""]));
  });
}

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const key = record.s3.object.key;

    const object = await s3.send(
      new GetObjectCommand({ Bucket: Resource.Imports.name, Key: key }),
    );
    const rows = parseCsv(await object.Body!.transformToString());

    await s3.send(
      new PutObjectCommand({
        Bucket: Resource.Imports.name,
        Key: `${key}.json`,
        Body: JSON.stringify(rows),
        ContentType: "application/json",
      }),
    );
  }
};
