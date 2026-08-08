// ─── Main Client ─────────────────────────────────────────────────────
export { NodeRails } from "./client";
export type { NodeRailsConfig } from "./client";

// ─── Errors ──────────────────────────────────────────────────────────
export {
  NodeRailsError,
  ApiError,
  AuthenticationError,
  ConnectionError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  SignatureVerificationError,
  TimeoutError,
  ValidationError,
} from "./errors";

// ─── Webhooks ────────────────────────────────────────────────────────
export { Webhooks } from "./webhooks";

// ─── Types ───────────────────────────────────────────────────────────
export type * from "./types";

// ─── HTTP / Pagination ──────────────────────────────────────────────
export type { PaginatedResult } from "./http";
