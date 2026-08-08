import type { Request } from 'express';

// ── JWT payload ──

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  /** Present when role === 'TEAM' — the merchant (org owner) this team member belongs to */
  merchantId?: string;
  /** Granular permission keys (only when role === 'TEAM') */
  permissions?: string[];
  /** Whether this team member can access all apps (only when role === 'TEAM') */
  allAppsAccess?: boolean;
  /** Specific app IDs this team member can access (only when role === 'TEAM' and allAppsAccess is false) */
  appIds?: string[];
}

// ── Auth context attached to requests ──

export interface MerchantContext {
  id: string;
  email: string;
  role: string;
  /** Set when the authenticated user is a team member */
  teamMemberId?: string;
  /** Granular permissions for this team member */
  permissions?: string[];
  /** Whether this team member can access all apps */
  allAppsAccess?: boolean;
  /** Specific app IDs this team member can access */
  teamAppIds?: string[];
}

export interface AppContext {
  id: string;
  merchantId: string;
  name: string;
  environment: string;
}

export interface ApiKeyContext {
  id: string;
  type: string;
}

// ── Extended request types ──

export type AuthenticatedRequest = Request & { merchant: MerchantContext };
export type ApiKeyRequest = Request & { appCtx: AppContext; apiKeyCtx: ApiKeyContext };

// ── Module augmentation so middleware can assign properties ──

declare global {
  namespace Express {
    interface Request {
      merchant?: MerchantContext;
      appCtx?: AppContext;
      apiKeyCtx?: ApiKeyContext;
      requestId?: string;
      apiVersion?: string;
    }
  }
}
