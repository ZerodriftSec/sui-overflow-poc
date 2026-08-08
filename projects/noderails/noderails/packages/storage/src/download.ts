import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
  }
  return _client;
}

/**
 * Generate a time-limited presigned URL for downloading a private S3 object.
 *
 * @param bucket          - Bucket name
 * @param key             - Object key
 * @param expirySeconds   - How long the URL is valid (default 1 hour)
 */
export async function getPresignedDownloadUrl(
  bucket: string,
  key: string,
  expirySeconds = 3600,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expirySeconds });
}
