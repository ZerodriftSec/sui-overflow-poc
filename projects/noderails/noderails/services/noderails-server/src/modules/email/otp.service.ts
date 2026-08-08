/**
 * OTP Service
 *
 * Generates, sends, and verifies 6-digit email OTP codes for merchant
 * email verification using Redis with TTL for ephemeral storage.
 *
 * Rate limiting:
 *   - Max 5 OTP sends per email within a 24-hour rolling window
 *   - After 5 sends the endpoint returns an error asking to retry later
 *
 * OTP lifetime: 10 minutes
 *
 * Redis key patterns:
 *   otp:{merchantId}       → JSON { code, email }  (TTL = 10 min)
 *   otp:rate:{email}       → counter               (TTL = 24 h)
 */

import crypto from 'crypto';
import { getDatabaseClient } from '@noderails/database';
import { getRedis } from '@noderails/redis';
import { ValidationError, NotFoundError } from '@noderails/common';
import {
  configureSes,
  sendEmail,
  renderOtpEmail,
} from '@noderails/common/email';
import { env } from '../../config.js';

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes
const MAX_SENDS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60; // 24 hours

/** Redis key for the active OTP of a merchant */
function otpKey(merchantId: string): string {
  return `otp:${merchantId}`;
}

/** Redis key for the rate-limit counter for an email */
function rateLimitKey(email: string): string {
  return `otp:rate:${email}`;
}

/** Generate a cryptographically-random numeric OTP. */
function generateOtp(): string {
  const num = crypto.randomInt(100_000, 1_000_000);
  return num.toString();
}

// ── Send OTP ──

export interface SendOtpResult {
  /** When the OTP expires (epoch ms) */
  expiresAt: Date;
}

/**
 * Send an OTP email to the merchant.
 * Enforces a rate limit of 5 sends per 24 hours per email address.
 */
export async function sendOtp(merchantId: string): Promise<SendOtpResult> {
  const db = getDatabaseClient();
  const redis = getRedis();

  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!merchant) throw new NotFoundError('Merchant', merchantId);

  if (merchant.emailVerified) {
    throw new ValidationError('Email is already verified');
  }

  // ── Rate limit check ──
  const rKey = rateLimitKey(merchant.email);
  const currentCount = await redis.get(rKey);
  const count = currentCount ? parseInt(currentCount, 10) : 0;

  if (count >= MAX_SENDS_PER_WINDOW) {
    const ttl = await redis.ttl(rKey);
    const retryAfterMs = ttl > 0 ? ttl * 1000 : RATE_LIMIT_WINDOW_SECONDS * 1000;
    const retryAfter = new Date(Date.now() + retryAfterMs);
    throw new ValidationError(
      `Too many verification attempts. Please try again after ${retryAfter.toISOString()}`,
    );
  }

  // ── Generate & store OTP ──
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

  // Store OTP in Redis with 10 min TTL
  await redis.set(
    otpKey(merchantId),
    JSON.stringify({ code, email: merchant.email }),
    'EX',
    OTP_EXPIRY_SECONDS,
  );

  // Increment rate limit counter; set TTL only on first increment
  const newCount = await redis.incr(rKey);
  if (newCount === 1) {
    await redis.expire(rKey, RATE_LIMIT_WINDOW_SECONDS);
  }

  // ── Configure SES (idempotent if already configured) ──
  configureSes({
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    fromEmail: env.SES_FROM_EMAIL,
  });

  // ── Send email ──
  const html = renderOtpEmail({ code, expiresInMinutes: OTP_EXPIRY_SECONDS / 60 });

  await sendEmail({
    to: merchant.email,
    subject: `${code} - Verify your NodeRails email`,
    html,
  });

  return { expiresAt };
}

// ── Verify OTP ──

/**
 * Verify an OTP code and mark the merchant's email as verified.
 */
export async function verifyOtp(merchantId: string, code: string): Promise<void> {
  const db = getDatabaseClient();
  const redis = getRedis();

  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!merchant) throw new NotFoundError('Merchant', merchantId);

  if (merchant.emailVerified) {
    throw new ValidationError('Email is already verified');
  }

  // Fetch the stored OTP from Redis
  const stored = await redis.get(otpKey(merchantId));

  if (!stored) {
    throw new ValidationError('No valid OTP found. Please request a new code.');
  }

  const otpData = JSON.parse(stored) as { code: string; email: string };

  if (otpData.code !== code) {
    throw new ValidationError('Invalid verification code');
  }

  // Delete the OTP key (single-use)
  await redis.del(otpKey(merchantId));

  // Mark email as verified in the database
  await db.merchant.update({
    where: { id: merchant.id },
    data: { emailVerified: true },
  });
}
