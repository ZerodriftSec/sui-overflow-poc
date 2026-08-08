import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
 * Upload a file buffer to S3.
 *
 * @param bucket  - Bucket name (use S3_BUCKETS.UPLOADS)
 * @param key     - Full object key including folder prefix (e.g. "dispute-proofs/customer/abc.pdf")
 * @param body    - File content as Buffer
 * @param contentType - MIME type (e.g. "application/pdf")
 */
export async function uploadToS3(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Private by default — access only via presigned URLs
      ACL: 'private' as const,
    }),
  );
}

/**
 * Delete an object from S3. Silently ignores missing objects.
 */
export async function deleteFromS3(bucket: string, key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Build a deterministic S3 object key.
 *
 * @param folder    - e.g. S3_FOLDERS.DISPUTE_PROOF_CUSTOMER
 * @param id        - Record identifier (dispute id, payment-link id, etc.)
 * @param filename  - Original or derived filename
 */
export function buildS3Key(folder: string, id: string, filename: string): string {
  // Sanitise filename: keep only safe characters
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return `${folder}/${id}/${safe}`;
}
