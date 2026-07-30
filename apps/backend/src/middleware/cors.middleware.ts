/**
 * CORS middleware — explicit allow-list, credential-safe.
 *
 * Key constraints:
 *   - Origin must be an explicit entry in CORS_ORIGIN (comma-separated env var).
 *     Wildcards are rejected at env-validation time by env.ts.
 *   - credentials: true — cookies / Authorization headers are forwarded.
 *   - Only the methods and headers the API actually uses are listed.
 *   - Preflight responses are cached for 10 minutes (max-age 600).
 *
 * Why not a single wildcard for the API?
 *   With `credentials: true`, the Fetch standard forbids `Access-Control-Allow-Origin: *`.
 *   An explicit origin list is required for authenticated cross-origin requests
 *   to function correctly in all browsers.
 */

import cors, { type CorsOptions } from 'cors';
import { env } from '../config/env.js';
import { structuredLog } from './logging.middleware.js';

// env.CORS_ORIGIN is already parsed to string[] by env.ts
const allowedOrigins = new Set(env.CORS_ORIGIN);

const corsOptions: CorsOptions = {
  origin(requestOrigin, callback) {
    // Allow server-to-server calls (no Origin header) and explicitly listed origins.
    if (!requestOrigin || allowedOrigins.has(requestOrigin)) {
      callback(null, true);
    } else {
      structuredLog({
        level: 'warn',
        message: 'CORS rejected origin',
        timestamp: new Date().toISOString(),
        origin: requestOrigin,
        allowedOrigins: [...allowedOrigins],
      });
      callback(new Error(`Origin '${requestOrigin}' is not permitted by CORS policy`));
    }
  },

  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',   // so clients can supply their own correlation ID
  ],

  exposedHeaders: [
    'X-Request-Id',   // let clients read the echoed correlation ID
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ],

  // Cache preflight for 10 minutes
  maxAge: 600,

  // Respond to OPTIONS without falling through to other middleware
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

export const corsMiddleware = cors(corsOptions);
