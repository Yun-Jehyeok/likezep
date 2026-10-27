import { S3Client, GetObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

export const s3 = new S3Client({ region: config.AWS_VIDEOS_REGION });

const BUCKET = config.S3_VIDEOS_BUCKET;

export async function getVideoSignedUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getDownloadSignedUrl(key: string, filename: string, expiresIn = 600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getUploadSignedUrl(key: string, contentType: string, expiresIn = 600) {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** 썸네일 URL: CDN base URL이 설정돼 있으면 CDN URL, 없으면 presigned URL */
export async function getThumbnailUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  if (config.VIDEOS_CDN_URL) return `${config.VIDEOS_CDN_URL}/${key}`;
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 86400 });
}
