import express, { Router } from 'express';
import { z } from 'zod';
import { AUTH_CONFIG } from '@noderails/common';
import { asyncHandler, validate, authenticateJwt, requirePermission, success, created } from '@noderails/service-base';
import * as authService from './auth.service.js';
import { sendOtp, verifyOtp } from '../email/otp.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

// ── Schemas ──

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  merchantType: z.enum(['BUSINESS', 'INDIVIDUAL']).default('BUSINESS'),
  businessName: z.string().min(1).max(200).optional(),
  individualName: z.string().min(1).max(200).optional(),
  orgName: z.string().min(1).max(200).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  merchantType: z.enum(['BUSINESS', 'INDIVIDUAL']).optional(),
  businessName: z.string().min(1).max(200).optional(),
  individualName: z.string().min(1).max(200).optional(),
  orgName: z.string().min(1).max(200).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
}).superRefine((data, ctx) => {
  const effectiveType = data.merchantType;
  if (effectiveType === 'BUSINESS' && data.businessName !== undefined && !data.businessName.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['businessName'],
      message: 'Business name cannot be empty',
    });
  }
  if (effectiveType === 'INDIVIDUAL' && data.individualName !== undefined && !data.individualName.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['individualName'],
      message: 'Individual name cannot be empty',
    });
  }
});

// ── POST /auth/register ──

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);

    res.cookie(AUTH_CONFIG.REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    created(res, { merchant: result.merchant, accessToken: result.accessToken });
  }),
);

// ── POST /auth/login ──

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);

    // Team member login returns { tokens, member } shape
    if ('tokens' in result) {
      res.cookie(AUTH_CONFIG.TEAM_REFRESH_COOKIE_NAME, result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      success(res, { member: result.member, accessToken: result.tokens.accessToken, isTeamMember: true });
      return;
    }

    // Merchant login
    res.cookie(AUTH_CONFIG.REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    success(res, { merchant: result.merchant, accessToken: result.accessToken });
  }),
);

// ── POST /auth/refresh ──

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[AUTH_CONFIG.REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      res.status(401).json({ success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token' } });
      return;
    }

    const tokens = await authService.refresh(refreshToken);

    res.cookie(AUTH_CONFIG.REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    success(res, { accessToken: tokens.accessToken });
  }),
);

// ── POST /auth/logout ──

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_CONFIG.REFRESH_COOKIE_NAME);
  success(res, { message: 'Logged out' });
});

// ── GET /auth/me ──

router.get(
  '/me',
  authenticateJwt(env.JWT_SECRET),
  asyncHandler(async (req, res) => {
    const profile = await authService.getProfile(req.merchant!.id);
    success(res, profile);
  }),
);

// ── PUT /auth/me ──

router.put(
  '/me',
  authenticateJwt(env.JWT_SECRET),
  requirePermission('SETTINGS_MANAGE'),
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const updated = await authService.updateProfile(req.merchant!.id, req.body);
    success(res, updated);
  }),
);

const verifyOtpSchema = z.object({
  code: z.string().length(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(40).max(200),
  newPassword: z.string().min(8).max(128),
});

// ── POST /auth/send-otp ──

router.post(
  '/send-otp',
  authenticateJwt(env.JWT_SECRET),
  asyncHandler(async (req, res) => {
    const result = await sendOtp(req.merchant!.id);
    success(res, { expiresAt: result.expiresAt.toISOString() });
  }),
);

// ── POST /auth/verify-otp ──

router.post(
  '/verify-otp',
  authenticateJwt(env.JWT_SECRET),
  validate(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    await verifyOtp(req.merchant!.id, req.body.code);
    success(res, { verified: true });
  }),
);

// ── POST /auth/forgot-password ──

router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.requestPasswordReset(req.body.email);
    success(res, {
      message: 'If an account exists for this email, a password reset link has been sent.',
    });
  }),
);

// ── POST /auth/reset-password ──

router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.newPassword);
    success(res, { reset: true });
  }),
);

export default router;
