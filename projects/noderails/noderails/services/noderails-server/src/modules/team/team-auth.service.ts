import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  AUTH_CONFIG,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  resolveMerchantDisplayName,
} from '@noderails/common';
import { sendEmail } from '@noderails/common/email';
import { getDatabaseClient } from '@noderails/database';
import { createLogger } from '@noderails/service-base';
import type { JwtPayload } from '@noderails/service-base';
import { env } from '../../config.js';
import { MERCHANT_BRANDING_SELECT } from '../../lib/checkout-app-branding.js';

const logger = createLogger('team-auth');

// ── Generate Invite Token ──

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function inviteExpiryDate(): Date {
  return new Date(Date.now() + AUTH_CONFIG.INVITE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

// ── Send Invite Email ──

export async function sendInviteEmail(opts: {
  to: string;
  inviteToken: string;
  orgName: string | null;
}) {
  const dashboardUrl = env.DASHBOARD_URL?.trim();
  if (!dashboardUrl) {
    throw new ValidationError('DASHBOARD_URL is not configured for invite emails');
  }
  const normalizedDashboardUrl = dashboardUrl.replace(/\/+$/, '');
  const inviteLink = `${normalizedDashboardUrl}/invite?token=${opts.inviteToken}`;
  const orgLabel = opts.orgName ?? 'a NodeRails merchant';

  await sendEmail({
    to: opts.to,
    subject: `You've been invited to ${orgLabel} on NodeRails`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">You're invited!</h2>
        <p style="color: #475569; line-height: 1.6;">
          You've been invited to join <strong>${orgLabel}</strong> on NodeRails.
        </p>
        <a href="${inviteLink}" style="display: inline-block; margin: 24px 0; padding: 12px 28px; background: #635bff; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Accept Invite
        </a>
        <p style="color: #94a3b8; font-size: 13px;">
          This link expires in ${AUTH_CONFIG.INVITE_TOKEN_EXPIRY_DAYS} days. If you didn't expect this, you can safely ignore it.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">NodeRails | Crypto Payment Infrastructure</p>
      </div>
    `,
  });
}

// ── Create Invite (called from addMember) ──

export async function createInvite(teamMemberId: string): Promise<string> {
  const db = getDatabaseClient();

  const member = await db.teamMember.findUnique({
    where: { id: teamMemberId },
    select: { id: true, email: true, permissions: true, merchantId: true, merchant: { select: { orgName: true } } },
  });
  if (!member) throw new NotFoundError('TeamMember', teamMemberId);

  const inviteToken = generateInviteToken();
  const inviteExpiresAt = inviteExpiryDate();

  await db.teamMember.update({
    where: { id: teamMemberId },
    data: { inviteToken, inviteExpiresAt, status: 'PENDING' },
  });

  try {
    await sendInviteEmail({
      to: member.email,
      inviteToken,
      orgName: member.merchant.orgName,
    });
    logger.info('Invite email sent', { email: member.email });
  } catch (err) {
    logger.error('Failed to send invite email — token still valid', { err: String(err), email: member.email });
  }

  return inviteToken;
}

// ── Resend Invite ──

export async function resendInvite(merchantId: string, memberId: string): Promise<void> {
  const db = getDatabaseClient();

  const member = await db.teamMember.findUnique({
    where: { id: memberId },
    select: { id: true, merchantId: true, status: true },
  });
  if (!member) throw new NotFoundError('TeamMember', memberId);
  if (member.merchantId !== merchantId) throw new AuthenticationError('Not your team member');
  if (member.status === 'ACTIVE') throw new ValidationError('Member has already accepted the invite');

  await createInvite(memberId);
}

// ── Validate Invite Token ──

export async function getInviteInfo(inviteToken: string) {
  const db = getDatabaseClient();

  const member = await db.teamMember.findUnique({
    where: { inviteToken },
    select: {
      id: true,
      email: true,
      name: true,
      permissions: true,
      status: true,
      inviteExpiresAt: true,
      merchant: { select: { orgName: true } },
    },
  });

  if (!member) throw new NotFoundError('Invite', 'invalid');
  if (member.status === 'ACTIVE') throw new ValidationError('Invite has already been accepted');
  if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) {
    throw new ValidationError('Invite has expired. Ask the org owner to resend.');
  }

  return {
    email: member.email,
    name: member.name,
    permissions: member.permissions,
    orgName: member.merchant.orgName,
  };
}

// ── Accept Invite (set password) ──

export async function acceptInvite(inviteToken: string, password: string) {
  const db = getDatabaseClient();

  const member = await db.teamMember.findUnique({
    where: { inviteToken },
    select: {
      id: true,
      email: true,
      merchantId: true,
      permissions: true,
      allAppsAccess: true,
      status: true,
      inviteExpiresAt: true,
      appAccess: { select: { appId: true } },
      merchant: { select: MERCHANT_BRANDING_SELECT },
    },
  });

  if (!member) throw new NotFoundError('Invite', 'invalid');
  if (member.status === 'ACTIVE') throw new ValidationError('Invite has already been accepted');
  if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) {
    throw new ValidationError('Invite has expired. Ask the org owner to resend.');
  }

  const passwordHash = await bcrypt.hash(password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);

  await db.teamMember.update({
    where: { id: member.id },
    data: {
      passwordHash,
      status: 'ACTIVE',
      inviteToken: null,
      inviteExpiresAt: null,
    },
  });

  // Issue tokens
  const tokens = signTeamTokenPair(member);
  return { tokens, member: toTeamMemberResponse(member) };
}

// ── Team Member Login ──

export async function teamLogin(email: string, password: string) {
  const db = getDatabaseClient();

  // Look for active team member with this email (could belong to multiple orgs — take first match)
  const member = await db.teamMember.findFirst({
    where: { email, status: 'ACTIVE' },
    select: {
      id: true,
      email: true,
      merchantId: true,
      permissions: true,
      allAppsAccess: true,
      passwordHash: true,
      appAccess: { select: { appId: true } },
      merchant: { select: MERCHANT_BRANDING_SELECT },
    },
  });

  if (!member || !member.passwordHash) {
    throw new AuthenticationError('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, member.passwordHash);
  if (!valid) {
    throw new AuthenticationError('Invalid email or password');
  }

  const tokens = signTeamTokenPair(member);
  return { tokens, member: toTeamMemberResponse(member) };
}

// ── Team Token Refresh ──

export async function teamRefresh(refreshToken: string) {
  const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
  if (payload.type !== 'refresh' || payload.role !== 'TEAM') {
    throw new AuthenticationError('Invalid refresh token');
  }

  const db = getDatabaseClient();
  const member = await db.teamMember.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      merchantId: true,
      permissions: true,
      allAppsAccess: true,
      status: true,
      appAccess: { select: { appId: true } },
      merchant: { select: MERCHANT_BRANDING_SELECT },
    },
  });
  if (!member || member.status !== 'ACTIVE') {
    throw new AuthenticationError('Team member not found or inactive');
  }

  return signTeamTokenPair(member);
}

// ── Token Signing ──

interface TeamMemberForToken {
  id: string;
  email: string;
  merchantId: string;
  permissions: string[];
  allAppsAccess: boolean;
  appAccess: { appId: string }[];
  merchant?: {
    orgName: string | null;
    businessName: string | null;
    individualName: string | null;
    merchantType: string;
  };
}

function toTeamMemberResponse(member: TeamMemberForToken) {
  return {
    id: member.id,
    email: member.email,
    permissions: member.permissions,
    allAppsAccess: member.allAppsAccess,
    appIds: member.appAccess.map((a) => a.appId),
    merchantId: member.merchantId,
    orgName: member.merchant ? resolveMerchantDisplayName(member.merchant) : null,
  };
}

function signTeamTokenPair(member: TeamMemberForToken) {
  const appIds = member.appAccess.map(a => a.appId);
  const orgName = member.merchant ? resolveMerchantDisplayName(member.merchant) : null;

  const accessPayload = {
    sub: member.id,
    email: member.email,
    role: 'TEAM',
    type: 'access' as const,
    merchantId: member.merchantId,
    permissions: member.permissions,
    allAppsAccess: member.allAppsAccess,
    appIds,
    orgName,
  };

  const refreshPayload = {
    sub: member.id,
    email: member.email,
    role: 'TEAM',
    type: 'refresh' as const,
    merchantId: member.merchantId,
  };

  return {
    accessToken: jwt.sign(accessPayload, env.JWT_SECRET, { expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL }),
    refreshToken: jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, { expiresIn: AUTH_CONFIG.REFRESH_TOKEN_TTL }),
  };
}
