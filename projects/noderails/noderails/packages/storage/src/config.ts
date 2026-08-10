/**
 * Storage configuration — single source of truth for all S3 buckets and folder paths.
 *
 * To add a new upload category:
 *  1. Add an entry to S3_FOLDERS below.
 *  2. Use that folder key when calling uploadToS3 / getPresignedDownloadUrl.
 *
 * Bucket names are read from env vars so they can differ between staging and
 * production without code changes.
 */

// ── Buckets ──────────────────────────────────────────────────────────────────

export const S3_BUCKETS = {
  /**
   * Single private bucket that holds all app-related uploads.
   * Override with S3_UPLOADS_BUCKET env var for staging/prod isolation.
   */
  UPLOADS: process.env.S3_UPLOADS_BUCKET ?? 'noderails-uploads',
} as const;

export type S3BucketKey = keyof typeof S3_BUCKETS;

// ── Folders (key prefixes inside a bucket) ────────────────────────────────────

export const S3_FOLDERS = {
  /** PDF proofs uploaded by customers when raising a dispute */
  DISPUTE_PROOF_CUSTOMER: 'dispute-proofs/customer',
  /** PDF proofs uploaded by merchants when responding to a dispute */
  DISPUTE_PROOF_MERCHANT: 'dispute-proofs/merchant',
  /** Images attached to payment links by merchants */
  PAYMENT_LINK_IMAGES: 'payment-link-images',
} as const;

export type S3FolderKey = keyof typeof S3_FOLDERS;

// ── Limits ────────────────────────────────────────────────────────────────────

export const STORAGE_LIMITS = {
  /** Maximum allowed proof PDF size (10 MB) */
  MAX_PROOF_BYTES: 10 * 1024 * 1024,
  /** Maximum allowed payment-link image size (5 MB) */
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  /** Presigned URL expiry for proof downloads (1 hour) */
  PROOF_URL_EXPIRY_SECONDS: 60 * 60,
  /** Presigned URL expiry for payment-link image downloads (24 hours) */
  IMAGE_URL_EXPIRY_SECONDS: 24 * 60 * 60,
} as const;
