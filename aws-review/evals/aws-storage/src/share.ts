import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";

const s3 = new S3Client({});
const Bucket = process.env.UPLOADS_BUCKET!;

const SEVEN_DAYS = 7 * 24 * 60 * 60;

export const createShareLink: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims.sub as string;
  const fileId = event.pathParameters!.id!;

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket, Key: `uploads/${userId}/${fileId}` }),
    { expiresIn: SEVEN_DAYS },
  );

  return { statusCode: 201, body: JSON.stringify({ url, expiresInDays: 7 }) };
};

export const createUploadUrl: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const { fileName, contentType } = JSON.parse(event.body ?? "{}");

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket, Key: fileName, ContentType: contentType }),
    { expiresIn: 300 },
  );

  return { statusCode: 200, body: JSON.stringify({ url }) };
};
