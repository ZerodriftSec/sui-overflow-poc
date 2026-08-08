// ── App factory ──
export { createApp, attachErrorHandler, type AppOptions, type CorsOrigin } from './app.js';

// ── Async handler ──
export { asyncHandler } from './async-handler.js';

// ── Types ──
export type {
  JwtPayload,
  MerchantContext,
  AppContext,
  ApiKeyContext,
  AuthenticatedRequest,
  ApiKeyRequest,
} from './types.js';

// Force module augmentation to be included
import './types.js';

// ── Middleware ──
export {
  authenticateJwt,
  authenticateApiKey,
  authenticateJwtOrApiKey,
  requireSecretKey,
  requireAdmin,
  getMerchantId,
  requirePermission,
  requireAppAccess,
} from './middleware/auth.js';
export { errorHandler } from './middleware/error-handler.js';
export { createRateLimiter } from './middleware/rate-limit.js';
export { validate } from './middleware/validate.js';
export { requestId } from './middleware/request-id.js';
export { apiVersion, API_VERSIONS, CURRENT_API_VERSION, type ApiVersion } from './middleware/api-version.js';
export { idempotency } from './middleware/idempotency.js';

// ── Helpers ──
export { createLogger, type Logger } from './helpers/logger.js';
export { success, created, noContent, paginated } from './helpers/response.js';
export { gracefulShutdown } from './helpers/shutdown.js';
