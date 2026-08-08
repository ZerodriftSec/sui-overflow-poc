/**
 * API Versioning Middleware
 *
 * Reads the `NodeRails-Version` header (or falls back to the latest version).
 * Sets `req.apiVersion` for downstream handlers and echoes the version back
 * in the `NodeRails-Version` response header.
 *
 * Stripe-style: versions are date-based strings (e.g. "2026-03-07").
 * Currently we only have one version, but this sets up the plumbing so
 * breaking changes can be gated behind version checks.
 */

import type { Request, Response, NextFunction } from 'express';

/** All known API versions, newest first */
export const API_VERSIONS = ['2026-03-07'] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];

/** The current (default) version */
export const CURRENT_API_VERSION: ApiVersion = API_VERSIONS[0];

const versionSet = new Set<string>(API_VERSIONS);

/**
 * Middleware that reads `NodeRails-Version` header, validates it, and
 * attaches it to `req.apiVersion`. Unknown versions return 400.
 */
export function apiVersion() {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['noderails-version'] as string | undefined;

    if (header && !versionSet.has(header)) {
      res.status(400).json({
        success: false,
        error: {
          type: 'invalid_request_error',
          message: `Invalid API version "${header}". Valid versions: ${API_VERSIONS.join(', ')}`,
        },
      });
      return;
    }

    const version = (header as ApiVersion) || CURRENT_API_VERSION;
    req.apiVersion = version;
    res.setHeader('NodeRails-Version', version);
    next();
  };
}
