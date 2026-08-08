import express, { Router } from 'express';
import { z } from 'zod';
import { AUTH_CONFIG, VALID_PERMISSIONS } from '@noderails/common';
import { asyncHandler, validate, authenticateJwt, requirePermission, success, created, noContent } from '@noderails/service-base';
import * as teamService from './team.service.js';
import * as teamAuth from './team-auth.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

// ── Schemas ──

const permissionEnum = z.enum(VALID_PERMISSIONS as [string, ...string[]]);

const addMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
  permissions: z.array(permissionEnum).default([]),
  allAppsAccess: z.boolean().default(false),
  appIds: z.array(z.string().uuid()).optional(),
});

const updateMemberSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  permissions: z.array(permissionEnum).optional(),
  allAppsAccess: z.boolean().optional(),
  appIds: z.array(z.string().uuid()).optional(),
});

const acceptInviteSchema = z.object({
  inviteToken: z.string().min(1),
  password: z.string().min(8).max(128),
});

const teamLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ── Public routes (no auth required) ──

// GET /team/invite?token=xxx — Get invite info (public)
router.get(
  '/invite',
  asyncHandler(async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ success: false, error: { message: 'Missing invite token' } });
      return;
    }
    const info = await teamAuth.getInviteInfo(token);
    success(res, info);
  }),
);

// POST /team/accept-invite — Accept invite + set password (public)
router.post(
  '/accept-invite',
  validate(acceptInviteSchema),
  asyncHandler(async (req, res) => {
    const result = await teamAuth.acceptInvite(req.body.inviteToken, req.body.password);

    res.cookie(AUTH_CONFIG.TEAM_REFRESH_COOKIE_NAME, result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    success(res, { member: result.member, accessToken: result.tokens.accessToken });
  }),
);

// POST /team/login — Team member login (public)
router.post(
  '/login',
  validate(teamLoginSchema),
  asyncHandler(async (req, res) => {
    const result = await teamAuth.teamLogin(req.body.email, req.body.password);

    res.cookie(AUTH_CONFIG.TEAM_REFRESH_COOKIE_NAME, result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    success(res, { member: result.member, accessToken: result.tokens.accessToken });
  }),
);

// POST /team/refresh — Refresh team member token (public, uses cookie)
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[AUTH_CONFIG.TEAM_REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      res.status(401).json({ success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token' } });
      return;
    }

    const tokens = await teamAuth.teamRefresh(refreshToken);

    res.cookie(AUTH_CONFIG.TEAM_REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    success(res, { accessToken: tokens.accessToken });
  }),
);

// POST /team/logout — Clear team refresh cookie
router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_CONFIG.TEAM_REFRESH_COOKIE_NAME);
  success(res, { message: 'Logged out' });
});

// ── Authenticated routes (merchant owner or team member with TEAM_MANAGE) ──

router.use(authenticateJwt(env.JWT_SECRET));

// ── GET /team ──

router.get(
  '/',
  requirePermission('TEAM_MANAGE'),
  asyncHandler(async (req, res) => {
    const members = await teamService.listMembers(req.merchant!.id);
    success(res, members);
  }),
);

// ── POST /team ──

router.post(
  '/',
  requirePermission('TEAM_MANAGE'),
  validate(addMemberSchema),
  asyncHandler(async (req, res) => {
    const member = await teamService.addMember({
      merchantId: req.merchant!.id,
      ...req.body,
    });
    created(res, member);
  }),
);

// ── POST /team/:memberId/resend-invite ──

router.post(
  '/:memberId/resend-invite',
  requirePermission('TEAM_MANAGE'),
  asyncHandler(async (req, res) => {
    await teamAuth.resendInvite(req.merchant!.id, req.params.memberId);
    success(res, { message: 'Invite resent' });
  }),
);

// ── GET /team/:memberId ──

router.get(
  '/:memberId',
  requirePermission('TEAM_MANAGE'),
  asyncHandler(async (req, res) => {
    const member = await teamService.getMember(req.merchant!.id, req.params.memberId);
    success(res, member);
  }),
);

// ── PUT /team/:memberId ──

router.put(
  '/:memberId',
  requirePermission('TEAM_MANAGE'),
  validate(updateMemberSchema),
  asyncHandler(async (req, res) => {
    const member = await teamService.updateMember({
      merchantId: req.merchant!.id,
      memberId: req.params.memberId,
      ...req.body,
    });
    success(res, member);
  }),
);

// ── DELETE /team/:memberId ──

router.delete(
  '/:memberId',
  requirePermission('TEAM_MANAGE'),
  asyncHandler(async (req, res) => {
    await teamService.removeMember(req.merchant!.id, req.params.memberId);
    noContent(res);
  }),
);

export default router;
