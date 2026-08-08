import bcrypt from 'bcrypt';
import crypto from 'crypto';
import {
  AUTH_CONFIG,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@noderails/common';
import { configureSes, sendEmail } from '@noderails/common/email';
import { getDatabaseClient } from '@noderails/database';
import { getRedis } from '@noderails/redis';
import { createLogger } from '@noderails/service-base';
import { signTokenPair, verifyRefreshToken } from './token.service.js';
import { teamLogin } from '../team/team-auth.service.js';
import { env } from '../../config.js';

const logger = createLogger('auth-service');
const PASSWORD_RESET_TOKEN_TTL_SECONDS = 30 * 60;
const PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const PASSWORD_RESET_MAX_EMAILS_PER_WINDOW = 5;

function passwordResetTokenKey(tokenHash: string): string {
  return `pwdreset:token:${tokenHash}`;
}

function passwordResetMerchantKey(merchantId: string): string {
  return `pwdreset:merchant:${merchantId}`;
}

function passwordResetRateKey(email: string): string {
  return `pwdreset:rate:${email.toLowerCase()}`;
}

function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getDashboardBaseUrl(): string {
  return env.DASHBOARD_URL || 'http://localhost:3001';
}

function renderPasswordResetEmail(resetLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:30px 36px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">NodeRails</h1>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">Password Reset</p>
          </td>
        </tr>
        <tr>
          <td style="padding:34px 36px;">
            <p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">
              We received a request to reset your merchant account password.
            </p>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
              Click the button below to set a new password. This link expires in <strong>30 minutes</strong>.
            </p>
            <div style="text-align:center;margin:0 0 24px;">
              <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px;">Reset Password</a>
            </div>
            <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;word-break:break-all;">
              If the button does not work, use this link:<br />
              <a href="${resetLink}" style="color:#4f46e5;">${resetLink}</a>
            </p>
            <p style="margin:18px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
              If you did not request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Register ──

interface RegisterInput {
  email: string;
  password: string;
  merchantType?: 'BUSINESS' | 'INDIVIDUAL';
  businessName?: string;
  individualName?: string;
  orgName?: string;
}

export async function register(input: RegisterInput) {
  const db = getDatabaseClient();

  const existing = await db.merchant.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(input.password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
  const merchantType = input.merchantType ?? 'BUSINESS';
  const businessName = input.businessName?.trim() || null;
  const individualName = input.individualName?.trim() || null;
  const fallbackOrgName = merchantType === 'BUSINESS' ? businessName : individualName;
  const orgName = input.orgName?.trim() || fallbackOrgName;

  const merchant = await db.merchant.create({
    data: {
      email: input.email,
      passwordHash,
      merchantType,
      businessName,
      individualName,
      orgName,
    },
    select: {
      id: true,
      email: true,
      role: true,
      merchantType: true,
      businessName: true,
      individualName: true,
      orgName: true,
      isSuspended: true,
      suspendedReason: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  const tokens = signTokenPair(merchant.id, merchant.email, merchant.role, env.JWT_SECRET, env.JWT_REFRESH_SECRET);
  return { merchant, ...tokens };
}

// ── Login ──

interface LoginInput {
  email: string;
  password: string;
}

export async function login(input: LoginInput) {
  const db = getDatabaseClient();

  const merchant = await db.merchant.findUnique({ where: { email: input.email } });

  // If no merchant found, try team member login
  if (!merchant) {
    return teamLogin(input.email, input.password);
  }

  if (!merchant.passwordHash) {
    throw new AuthenticationError('Invalid email or password');
  }

  const valid = await bcrypt.compare(input.password, merchant.passwordHash);
  if (!valid) {
    throw new AuthenticationError('Invalid email or password');
  }

  const tokens = signTokenPair(merchant.id, merchant.email, merchant.role, env.JWT_SECRET, env.JWT_REFRESH_SECRET);
  return {
    merchant: {
      id: merchant.id,
      email: merchant.email,
      role: merchant.role,
      merchantType: merchant.merchantType,
      businessName: merchant.businessName,
      individualName: merchant.individualName,
      orgName: merchant.orgName,
      isSuspended: merchant.isSuspended,
      suspendedReason: merchant.suspendedReason,
      emailVerified: merchant.emailVerified,
      createdAt: merchant.createdAt,
    },
    ...tokens,
  };
}

// ── Refresh ──

export async function refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = verifyRefreshToken(refreshToken, env.JWT_REFRESH_SECRET);

  const db = getDatabaseClient();
  const merchant = await db.merchant.findUnique({ where: { id: payload.sub } });
  if (!merchant) {
    throw new AuthenticationError('Merchant not found');
  }

  return signTokenPair(merchant.id, merchant.email, merchant.role, env.JWT_SECRET, env.JWT_REFRESH_SECRET);
}

// ── Get Profile ──

export async function getProfile(merchantId: string) {
  const db = getDatabaseClient();

  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      email: true,
      role: true,
      merchantType: true,
      businessName: true,
      individualName: true,
      orgName: true,
      isSuspended: true,
      suspendedReason: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!merchant) {
    throw new NotFoundError('Merchant', merchantId);
  }

  return merchant;
}

// ── Update Profile ──

interface UpdateProfileInput {
  email?: string;
  merchantType?: 'BUSINESS' | 'INDIVIDUAL';
  businessName?: string;
  individualName?: string;
  orgName?: string;
  currentPassword?: string;
  newPassword?: string;
}

export async function updateProfile(merchantId: string, input: UpdateProfileInput) {
  const db = getDatabaseClient();

  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) {
    throw new NotFoundError('Merchant', merchantId);
  }

  const data: Record<string, unknown> = {};

  const nextMerchantType = input.merchantType ?? merchant.merchantType;

  if (input.merchantType !== undefined) {
    data.merchantType = input.merchantType;
  }

  if (input.businessName !== undefined) {
    data.businessName = input.businessName.trim();
  }

  if (input.individualName !== undefined) {
    data.individualName = input.individualName.trim();
  }

  if (input.orgName !== undefined) {
    data.orgName = input.orgName.trim();
  } else {
    const nextBusinessName = (input.businessName ?? merchant.businessName ?? '').trim();
    const nextIndividualName = (input.individualName ?? merchant.individualName ?? '').trim();
    data.orgName = nextMerchantType === 'BUSINESS' ? nextBusinessName || null : nextIndividualName || null;
  }

  if (input.email && input.email !== merchant.email) {
    const existing = await db.merchant.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictError('Email already in use');
    }
    data.email = input.email;
    data.emailVerified = false;
  }

  if (input.newPassword) {
    if (!input.currentPassword || !merchant.passwordHash) {
      throw new ValidationError('Current password is required');
    }
    const valid = await bcrypt.compare(input.currentPassword, merchant.passwordHash);
    if (!valid) {
      throw new AuthenticationError('Current password is incorrect');
    }
    data.passwordHash = await bcrypt.hash(input.newPassword, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
  }

  if (Object.keys(data).length === 0) {
    return { id: merchant.id, email: merchant.email };
  }

  const updated = await db.merchant.update({
    where: { id: merchantId },
    data,
    select: {
      id: true,
      email: true,
      merchantType: true,
      businessName: true,
      individualName: true,
      orgName: true,
      isSuspended: true,
      suspendedReason: true,
      emailVerified: true,
      updatedAt: true,
    },
  });

  return updated;
}

// ── Forgot / Reset Password ──

export async function requestPasswordReset(email: string): Promise<void> {
  const db = getDatabaseClient();
  const redis = getRedis();

  const merchant = await db.merchant.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true },
  });

  // Always return success behavior. If account does not exist, do nothing.
  if (!merchant) return;

  const rateKey = passwordResetRateKey(merchant.email);
  const sendCount = await redis.incr(rateKey);
  if (sendCount === 1) {
    await redis.expire(rateKey, PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS);
  }

  // Soft-drop extra requests to avoid enumeration and mail abuse.
  if (sendCount > PASSWORD_RESET_MAX_EMAILS_PER_WINDOW) {
    logger.warn('Password reset rate limit exceeded', { email: merchant.email });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashPasswordResetToken(rawToken);

  const tokenKey = passwordResetTokenKey(tokenHash);
  const merchantKey = passwordResetMerchantKey(merchant.id);

  const oldTokenHash = await redis.get(merchantKey);
  if (oldTokenHash) {
    await redis.del(passwordResetTokenKey(oldTokenHash));
  }

  await redis.set(tokenKey, merchant.id, 'EX', PASSWORD_RESET_TOKEN_TTL_SECONDS);
  await redis.set(merchantKey, tokenHash, 'EX', PASSWORD_RESET_TOKEN_TTL_SECONDS);

  configureSes({
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    fromEmail: env.SES_FROM_EMAIL,
  });

  const resetLink = new URL('/reset-password', getDashboardBaseUrl());
  resetLink.searchParams.set('token', rawToken);

  await sendEmail({
    to: merchant.email,
    subject: 'Reset your NodeRails merchant password',
    html: renderPasswordResetEmail(resetLink.toString()),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const db = getDatabaseClient();
  const redis = getRedis();

  const tokenHash = hashPasswordResetToken(token);
  const tokenKey = passwordResetTokenKey(tokenHash);

  const merchantId = await redis.get(tokenKey);
  if (!merchantId) {
    throw new ValidationError('Invalid or expired reset token');
  }

  const latestTokenHash = await redis.get(passwordResetMerchantKey(merchantId));
  if (!latestTokenHash || latestTokenHash !== tokenHash) {
    throw new ValidationError('Invalid or expired reset token');
  }

  const merchant = await db.merchant.findUnique({ where: { id: merchantId }, select: { id: true } });
  if (!merchant) {
    throw new ValidationError('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(newPassword, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);

  await db.merchant.update({
    where: { id: merchant.id },
    data: { passwordHash },
  });

  await redis.del(tokenKey);
  await redis.del(passwordResetMerchantKey(merchant.id));
}
