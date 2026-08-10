/**
 * @noderails/common - Shared types, utilities, and constants
 */

// Types
export * from './types/index.js';

// Errors
export * from './errors/index.js';

// Utils
export * from './utils/index.js';

// Constants
export * from './constants/index.js';

// Config
export * from './config/index.js';

// Format helpers (crypto amount display)
export * from './format/index.js';

// Merchant display helpers
export * from './merchant-display.js';

// Team permissions
export * from './permissions.js';

// Email utilities — NOT re-exported here because pdfkit requires Node.js (fs).
// Import via '@noderails/common/email' subpath in server-only code.
