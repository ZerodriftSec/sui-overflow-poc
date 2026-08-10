/**
 * Dispute Routes
 *
 * Three sections:
 * 1. Customer Portal — OTP-protected routes for customers to view
 *    their payments and raise disputes (with optional PDF proof).
 * 2. Merchant — JWT-protected routes for merchants to view and respond
 *    to disputes filed against their apps (with optional PDF proof).
 * 3. Admin — JWT + ADMIN-role protected routes for resolving disputes.
 */

import express, { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateJwt,
  requireAdmin,
  requirePermission,
  success,
  created,
  paginated,
} from '@noderails/service-base';
import { ValidationError, QUEUE_NAMES } from '@noderails/common';
import {
  configureSes,
  sendEmail,
  renderOtpEmail,
  generateReceiptPdf,
} from '@noderails/common/email';
import { getRedis } from '@noderails/redis';
import { queueRegistry } from '@noderails/queue';
import type { EmailSendJob } from '@noderails/queue';
import {
  uploadToS3,
  buildS3Key,
  S3_BUCKETS,
  S3_FOLDERS,
  STORAGE_LIMITS,
} from '@noderails/storage';
import { env } from '../../config.js';
import * as disputeService from './dispute.service.js';

const router: express.Router = Router();

// ── Multer setup — memory storage, PDF only, max 10 MB ──
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STORAGE_LIMITS.MAX_PROOF_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new ValidationError('Only PDF files are accepted for proof upload') as unknown as null, false);
    }
  },
});

// ── OTP config ──
const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes
const MAX_SENDS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60; // 24 hours
const CUSTOMER_JWT_EXPIRY_SECONDS = 24 * 60 * 60; // 24-hour JWT session

function customerOtpKey(email: string): string {
  return `customer-otp:${email}`;
}
function customerRateLimitKey(email: string): string {
  return `customer-otp:rate:${email}`;
}

function generateOtp(): string {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

// ══════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL (unauthenticated — OTP-protected)
// ══════════════════════════════════════════════════════════════════════

// ── GET /disputes/customer/window/:paymentIntentId ──
// Public — check if dispute window is open for a payment

router.get(
  '/customer/window/:paymentIntentId',
  asyncHandler(async (req, res) => {
    const info = await disputeService.getDisputeWindow(req.params.paymentIntentId);
    success(res, info);
  }),
);

// ── POST /disputes/customer/send-otp ──
// Send a 6-digit OTP to the customer email for portal login

const sendOtpSchema = z.object({
  email: z.string().email(),
});

router.post(
  '/customer/send-otp',
  validate(sendOtpSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const redis = getRedis();

    // Rate limit check
    const rKey = customerRateLimitKey(email);
    const currentCount = await redis.get(rKey);
    const count = currentCount ? parseInt(currentCount, 10) : 0;
    if (count >= MAX_SENDS_PER_WINDOW) {
      throw new ValidationError('Too many verification attempts. Please try again later.');
    }

    // Generate OTP
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    // Store in Redis
    await redis.set(
      customerOtpKey(email),
      JSON.stringify({ code, email }),
      'EX',
      OTP_EXPIRY_SECONDS,
    );

    // Increment rate limit
    const newCount = await redis.incr(rKey);
    if (newCount === 1) {
      await redis.expire(rKey, RATE_LIMIT_WINDOW_SECONDS);
    }

    // Send email via SES
    configureSes({
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      fromEmail: env.SES_FROM_EMAIL,
    });

    const html = renderOtpEmail({ code, expiresInMinutes: OTP_EXPIRY_SECONDS / 60 });
    await sendEmail({
      to: email,
      subject: `${code} - NodeRails Customer Portal Verification`,
      html,
    });

    success(res, { expiresAt: expiresAt.toISOString() });
  }),
);

// ── POST /disputes/customer/verify-otp ──
// Verify OTP and return a session token

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(OTP_LENGTH),
});

router.post(
  '/customer/verify-otp',
  validate(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const { email, code } = req.body;
    const redis = getRedis();

    const stored = await redis.get(customerOtpKey(email));
    if (!stored) {
      throw new ValidationError('No valid OTP found. Please request a new code.');
    }

    const otpData = JSON.parse(stored) as { code: string; email: string };
    if (otpData.code !== code) {
      throw new ValidationError('Invalid verification code');
    }

    // Delete OTP (single-use)
    await redis.del(customerOtpKey(email));

    // Issue a 24-hour JWT for the customer dispute session
    const sessionToken = jwt.sign(
      { email, scope: 'customer-dispute' },
      env.JWT_SECRET,
      { expiresIn: CUSTOMER_JWT_EXPIRY_SECONDS },
    );

    // Set JWT as httpOnly cookie
    res.cookie('nr_dispute_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: CUSTOMER_JWT_EXPIRY_SECONDS * 1000,
      path: '/disputes/customer',
    });

    success(res, {
      expiresAt: new Date(Date.now() + CUSTOMER_JWT_EXPIRY_SECONDS * 1000).toISOString(),
    });
  }),
);

// ── Middleware: Authenticate customer session ──

async function authenticateCustomerSession(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) {
  const token = req.cookies?.nr_dispute_token;
  if (!token) {
    next(new ValidationError('Session not found. Please verify your email again.'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { email: string; scope: string };
    if (payload.scope !== 'customer-dispute') {
      next(new ValidationError('Invalid session token'));
      return;
    }
    (req as any).customerEmail = payload.email;
    next();
  } catch {
    next(new ValidationError('Session expired or invalid. Please verify your email again.'));
  }
}

// ── GET /disputes/customer/payments ──
// List customer's payments (requires valid session)

router.get(
  '/customer/payments',
  authenticateCustomerSession,
  asyncHandler(async (req, res) => {
    const email = (req as any).customerEmail as string;
    const payments = await disputeService.getCustomerPayments(email);
    success(res, { payments });
  }),
);

// ── GET /disputes/customer/receipt/:paymentIntentId ──
// Download PDF receipt for a payment (requires valid session)

router.get(
  '/customer/receipt/:paymentIntentId',
  authenticateCustomerSession,
  asyncHandler(async (req, res) => {
    const email = (req as any).customerEmail as string;
    const receiptData = await disputeService.getPaymentReceiptData(email, req.params.paymentIntentId);
    const pdfBuffer = await generateReceiptPdf(receiptData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${receiptData.receiptId}.pdf"`);
    res.send(pdfBuffer);
  }),
);

// ── POST /disputes/customer/raise ──
// Raise a dispute for a payment intent (multipart/form-data; optional proof PDF)

const raiseDisputeSchema = z.object({
  paymentIntentId: z.string().uuid(),
  reason: z.string().min(10).max(1000),
});

router.post(
  '/customer/raise',
  authenticateCustomerSession,
  proofUpload.single('proof'),
  asyncHandler(async (req, res) => {
    const email = (req as any).customerEmail as string;

    const parsed = raiseDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    // Upload proof PDF to S3 if provided
    let customerProofKey: string | undefined;
    if (req.file) {
      customerProofKey = buildS3Key(
        S3_FOLDERS.DISPUTE_PROOF_CUSTOMER,
        parsed.data.paymentIntentId,
        req.file.originalname,
      );
      await uploadToS3(S3_BUCKETS.UPLOADS, customerProofKey, req.file.buffer, 'application/pdf');
    }

    const dispute = await disputeService.initiateDispute({
      paymentIntentId: parsed.data.paymentIntentId,
      reason: parsed.data.reason,
      customerEmail: email,
      customerProofKey,
    });

    // Enqueue dispute raised notification email
    const queue = queueRegistry.getOrCreateQueue<EmailSendJob>(QUEUE_NAMES.EMAIL_SEND);
    await queue.add(`dispute-raised-${dispute.id}`, {
      templateId: 'dispute-raised',
      to: email,
      variables: {
        paymentIntentId: dispute.paymentIntentId,
        disputeId: dispute.id,
        reason: dispute.reason,
        deadline: dispute.deadline,
      },
    });

    created(res, dispute);
  }),
);

// ══════════════════════════════════════════════════════════════════════
// MERCHANT ROUTES (JWT-authenticated — merchant role)
// ══════════════════════════════════════════════════════════════════════

// Merchant JWT middleware — requires a valid merchant JWT (same as dashboard)
router.use('/merchant', authenticateJwt(env.JWT_SECRET), requirePermission('DISPUTES_VIEW'));

// ── GET /disputes/merchant ──
// List all disputes across the merchant's apps

const listMerchantDisputesSchema = z.object({
  appId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'RESOLVED_MERCHANT', 'RESOLVED_PAYER']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

router.get(
  '/merchant',
  validate(listMerchantDisputesSchema, 'query'),
  asyncHandler(async (req, res) => {
    const merchantId = req.merchant!.id;
    const result = await disputeService.getMerchantDisputes({
      merchantId,
      appId: req.query.appId as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    paginated(res, result.disputes, result.total, result.page, result.pageSize);
  }),
);

// ── GET /disputes/merchant/:disputeId ──
// Get dispute detail with presigned proof download URLs

router.get(
  '/merchant/:disputeId',
  asyncHandler(async (req, res) => {
    const merchantId = req.merchant!.id;
    const dispute = await disputeService.getMerchantDispute(merchantId, req.params.disputeId);
    success(res, dispute);
  }),
);

// ── POST /disputes/merchant/:disputeId/respond ──
// Submit merchant response with optional PDF proof (multipart/form-data)

const respondDisputeSchema = z.object({
  response: z.string().min(10).max(2000),
});

router.post(
  '/merchant/:disputeId/respond',
  requirePermission('DISPUTES_MANAGE'),
  proofUpload.single('proof'),
  asyncHandler(async (req, res) => {
    const merchantId = req.merchant!.id;

    const parsed = respondDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    // Upload proof PDF to S3 if provided
    let proofKey: string | undefined;
    if (req.file) {
      proofKey = buildS3Key(
        S3_FOLDERS.DISPUTE_PROOF_MERCHANT,
        req.params.disputeId,
        req.file.originalname,
      );
      await uploadToS3(S3_BUCKETS.UPLOADS, proofKey, req.file.buffer, 'application/pdf');
    }

    const result = await disputeService.respondToDispute({
      disputeId: req.params.disputeId,
      merchantId,
      response: parsed.data.response,
      proofKey,
    });

    success(res, result);
  }),
);

// ══════════════════════════════════════════════════════════════════════
// ADMIN ROUTES (JWT + ADMIN role required)
// ══════════════════════════════════════════════════════════════════════

// Admin middleware
router.use('/admin', authenticateJwt(env.JWT_SECRET));
router.use('/admin', requireAdmin());

// ── GET /disputes/admin ──

const listDisputesSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED_MERCHANT', 'RESOLVED_PAYER']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

router.get(
  '/admin',
  validate(listDisputesSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await disputeService.listDisputes(req.query as any);
    paginated(res, result.disputes, result.total, result.page, result.pageSize);
  }),
);

// ── GET /disputes/admin/:disputeId ──

router.get(
  '/admin/:disputeId',
  asyncHandler(async (req, res) => {
    const dispute = await disputeService.getDispute(req.params.disputeId);
    success(res, dispute);
  }),
);

// ── POST /disputes/admin/:disputeId/resolve ──

const resolveDisputeSchema = z.object({
  winner: z.enum(['MERCHANT', 'CUSTOMER']),
});

router.post(
  '/admin/:disputeId/resolve',
  validate(resolveDisputeSchema),
  asyncHandler(async (req, res) => {
    const result = await disputeService.resolveDispute({
      disputeId: req.params.disputeId,
      winner: req.body.winner,
    });

    success(res, result);
  }),
);

export default router;
