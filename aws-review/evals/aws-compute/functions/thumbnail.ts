import type { S3Event } from "aws-lambda";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { resizeToThumbnail } from "./lib/image";

const bucket = process.env.MEDIA_BUCKET!;

export const handler = async (event: S3Event): Promise<void> => {
  const s3 = new S3Client({});

  event.Records.forEach(async (record) => {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    const original = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await original.Body!.transformToByteArray();
    const thumbnail = await resizeToThumbnail(bytes, { width: 320 });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `thumbnails/${key}`,
        Body: thumbnail,
        ContentType: "image/jpeg",
      }),
    );
  });
};
