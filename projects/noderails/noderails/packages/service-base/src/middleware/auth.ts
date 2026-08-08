import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError, hashApiKey } from '@noderails/common';
import { getDatabaseClient } from '@noderails/database';
import type { JwtPayload } from '../types.js';

function isReadOnlyMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function suspendedMessage(reason: string | null): string {
  const base = 'Your organization has been suspended. You currently have read-only access.';
  const reasonText = reason?.trim() ? ` Reason: ${reason.trim()}.` : '';
  return `${base}${reasonText} Please reach out to help@noderails.com.`;
}

// ── JWT Authentication (dashboard / merchant routes) ──

export function authenticateJwt(jwtSecret: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        throw new AuthenticationError('Missing or invalid authorization header');
      }

      const token = header.slice(7);
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;

      if (payload.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
      }

      if (payload.role === 'TEAM' && payload.merchantId) {
        // Team member: set merchant context to the org owner so existing routes work
        req.merchant = {
          id: payload.merchantId,
          email: payload.email,
          role: 'TEAM',
          teamMemberId: payload.sub,
          permissions: payload.permissions ?? [],
          allAppsAccess: payload.allAppsAccess ?? false,
          teamAppIds: payload.appIds,
        };
      } else {
        req.merchant = { id: payload.sub, email: payload.email, role: payload.role ?? 'MERCHANT' };
      }

      if (payload.role !== 'ADMIN' && !isReadOnlyMethod(req.method)) {
        const merchantId = payload.role === 'TEAM' ? payload.merchantId : payload.sub;
        if (merchantId) {
          const db = getDatabaseClient();
          const merchant = await db.merchant.findUnique({
            where: { id: merchantId },
            select: { isSuspended: true, suspendedReason: true },
          });
          if (merchant?.isSuspended) {
            throw new AuthorizationError(suspendedMessage(merchant.suspendedReason));
          }
        }
      }

      next();
    } catch (err) {
      if (err instanceof AuthenticationError) {
        next(err);
      } else if (err instanceof AuthorizationError) {
        next(err);
      } else {
        next(new AuthenticationError('Invalid or expired token'));
      }
    }
  };
}

// ── API Key Authentication (public API routes) ──

export function authenticateApiKey() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const key = req.headers['x-api-key'] as string | undefined;
      if (!key) {
        throw new AuthenticationError('Missing x-api-key header');
      }

      const keyHash = hashApiKey(key);
      const db = getDatabaseClient();

      const apiKey = await db.apiKey.findUnique({
        where: { keyHash },
        include: { app: true },
      });

      if (!apiKey || !apiKey.active) {
        throw new AuthenticationError('Invalid or inactive API key');
      }

      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        throw new AuthenticationError('API key has expired');
      }

      // Fire-and-forget: update lastUsedAt
      db.apiKey
        .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});

      req.appCtx = {
        id: apiKey.app.id,
        merchantId: apiKey.app.merchantId,
        name: apiKey.app.name,
        environment: apiKey.app.environment,
      };

      req.apiKeyCtx = {
        id: apiKey.id,
        type: apiKey.type,
      };

      if (!isReadOnlyMethod(req.method)) {
        const merchant = await db.merchant.findUnique({
          where: { id: apiKey.app.merchantId },
          select: { isSuspended: true, suspendedReason: true },
        });
        if (merchant?.isSuspended) {
          throw new AuthorizationError(suspendedMessage(merchant.suspendedReason));
        }
      }

      next();
    } catch (err) {
      if (err instanceof AuthenticationError || err instanceof AuthorizationError) {
        next(err);
        return;
      }
      next(new AuthenticationError());
    }
  };
}

// ── Dual Authentication: JWT or API Key ──

export function authenticateJwtOrApiKey(jwtSecret: string) {
  const jwtMiddleware = authenticateJwt(jwtSecret);
  const apiKeyMiddleware = authenticateApiKey();

  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return jwtMiddleware(req, res, next);
    }

    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      return apiKeyMiddleware(req, res, next);
    }

    next(new AuthenticationError('Missing authentication: provide Bearer token or x-api-key header'));
  };
}

// ── Require Secret API key (for server-side only endpoints) ──
// When used after authenticateJwtOrApiKey, JWT auth passes through (dashboard is trusted).
// When API key is used, it must be a SECRET key.

export function requireSecretKey() {
  return (req: Request, _res: Response, next: NextFunction) => {
    // JWT-authenticated requests are always allowed (dashboard has full access)
    if (req.merchant) {
      next();
      return;
    }
    // API key must be SECRET type
    if (req.apiKeyCtx?.type !== 'SECRET') {
      next(new AuthenticationError('This endpoint requires a secret API key'));
      return;
    }
    next();
  };
}

// ── Require Admin role (platform admin routes) ──

export function requireAdmin() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.merchant?.role !== 'ADMIN') {
      next(new AuthenticationError('Admin access required'));
      return;
    }
    next();
  };
}

// ── Helper: resolve merchantId from JWT or API-key context ──

export function getMerchantId(req: Request): string {
  if (req.merchant) return req.merchant.id;
  if (req.appCtx) return req.appCtx.merchantId;
  throw new AuthenticationError('No authenticated context');
}

// ── Require Permission (team member granular access control) ──
// For merchant owners (role !== 'TEAM'), always passes.
// For team members, checks that the required permission exists in their permissions array.

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Merchant owner or admin — full access
    if (!req.merchant?.teamMemberId) {
      next();
      return;
    }

    const memberPerms = req.merchant.permissions ?? [];
    for (const perm of requiredPermissions) {
      if (memberPerms.includes(perm)) continue;
      // MANAGE implies VIEW — e.g. PAYOUTS_MANAGE satisfies PAYOUTS_VIEW
      if (perm.endsWith('_VIEW')) {
        const managePerm = perm.replace(/_VIEW$/, '_MANAGE');
        if (memberPerms.includes(managePerm)) continue;
      }
      next(new AuthorizationError(`Missing permission: ${perm}`));
      return;
    }
    next();
  };
}

// ── Require App Access (team member can access a specific app) ──
// Checks req.params[paramName] against team member's allowed app IDs.
// For merchant owners, always passes.

export function requireAppAccess(paramName = 'appId') {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Merchant owner or admin — full access
    if (!req.merchant?.teamMemberId) {
      next();
      return;
    }

    // allAppsAccess — can see all apps
    if (req.merchant.allAppsAccess) {
      next();
      return;
    }

    const appId = req.params[paramName];
    if (!appId) {
      next();
      return;
    }

    const allowed = req.merchant.teamAppIds ?? [];
    if (!allowed.includes(appId)) {
      next(new AuthorizationError('You do not have access to this app'));
      return;
    }
    next();
  };
}
