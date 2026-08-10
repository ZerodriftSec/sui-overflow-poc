/**
 * Base error class for all NodeRails SDK errors.
 */
export class NodeRailsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeRailsError";
  }
}

/**
 * Thrown when the API returns a non-2xx response.
 */
export class ApiError extends NodeRailsError {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Thrown when authentication fails (401).
 */
export class AuthenticationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(401, "AUTHENTICATION_ERROR", message, details);
    this.name = "AuthenticationError";
  }
}

/**
 * Thrown when the request is forbidden (403).
 */
export class PermissionError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(403, "PERMISSION_ERROR", message, details);
    this.name = "PermissionError";
  }
}

/**
 * Thrown when a resource is not found (404).
 */
export class NotFoundError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(404, "NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when the request is invalid (400/422).
 */
export class ValidationError extends ApiError {
  constructor(status: number, message: string, details?: unknown) {
    super(status, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

/**
 * Thrown when rate limited (429).
 */
export class RateLimitError extends ApiError {
  readonly retryAfter: number | null;

  constructor(message: string, retryAfter?: number, details?: unknown) {
    super(429, "RATE_LIMIT", message, details);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter ?? null;
  }
}

/**
 * Thrown when a network/connection error occurs.
 */
export class ConnectionError extends NodeRailsError {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

/**
 * Thrown when the request times out.
 */
export class TimeoutError extends NodeRailsError {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Thrown when webhook signature verification fails.
 */
export class SignatureVerificationError extends NodeRailsError {
  constructor(message: string) {
    super(message);
    this.name = "SignatureVerificationError";
  }
}
