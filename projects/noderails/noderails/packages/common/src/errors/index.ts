/**
 * Base error class for NodeRails
 */
export class NodeRailsError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message);
    this.name = 'NodeRailsError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

/**
 * Validation error - 400
 */
export class ValidationError extends NodeRailsError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error - 401
 */
export class AuthenticationError extends NodeRailsError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error - 403
 */
export class AuthorizationError extends NodeRailsError {
  constructor(message: string = 'Access denied') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error - 404
 */
export class NotFoundError extends NodeRailsError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error - 409
 */
export class ConflictError extends NodeRailsError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit error - 429
 */
export class RateLimitError extends NodeRailsError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Blockchain error - for on-chain failures
 */
export class BlockchainError extends NodeRailsError {
  public readonly chain?: string;
  public readonly txHash?: string;

  constructor(message: string, chain?: string, txHash?: string, details?: unknown) {
    super(message, 'BLOCKCHAIN_ERROR', 502, details);
    this.name = 'BlockchainError';
    this.chain = chain;
    this.txHash = txHash;
  }
}

/**
 * Payment error - payment flow failures
 */
export class PaymentError extends NodeRailsError {
  public readonly paymentIntentId?: string;

  constructor(message: string, paymentIntentId?: string, details?: unknown) {
    super(message, 'PAYMENT_ERROR', 400, details);
    this.name = 'PaymentError';
    this.paymentIntentId = paymentIntentId;
  }
}

/**
 * Signature error - invalid or expired signatures
 */
export class SignatureError extends NodeRailsError {
  constructor(message: string = 'Invalid or expired signature') {
    super(message, 'SIGNATURE_ERROR', 401);
    this.name = 'SignatureError';
  }
}

/**
 * Timeout error - operation timed out
 */
export class TimeoutError extends NodeRailsError {
  constructor(operation: string) {
    super(`Operation timed out: ${operation}`, 'TIMEOUT', 504);
    this.name = 'TimeoutError';
  }
}

/**
 * Check if error is a NodeRailsError
 */
export function isNodeRailsError(error: unknown): error is NodeRailsError {
  return error instanceof NodeRailsError;
}

/**
 * Convert unknown error to NodeRailsError
 */
export function toNodeRailsError(error: unknown): NodeRailsError {
  if (isNodeRailsError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new NodeRailsError(error.message, 'INTERNAL_ERROR', 500, {
      originalError: error.name,
    });
  }

  return new NodeRailsError('An unexpected error occurred', 'INTERNAL_ERROR', 500);
}
