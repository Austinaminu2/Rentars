import type { NextFunction, Request, Response } from 'express';
import { isDomainError, ValidationError } from '@/types/errors.js';
import type { DomainError } from '@/types/errors.js';
import { structuredLog, type RequestWithId } from './logging.middleware.js';
import { incCounter, httpErrorsTotal } from './metrics.middleware.js';

// ── Body-parser error types ───────────────────────────────────────────────────
// express.json() throws a plain SyntaxError for malformed JSON and a custom
// error with status 413 for payloads that exceed the configured limit.

interface BodyParserError extends SyntaxError {
  status?: number;
  body?: unknown;
  type?: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

interface ValidationErrorResponse {
  message: string;
  fields: Record<string, string[]>;
  requestId?: string;
}

const ERROR_STATUS_MAP: Record<string, number> = {
  // Auth errors
  INVALID_CREDENTIALS: 401,
  USER_NOT_FOUND: 404,
  USER_ALREADY_EXISTS: 409,
  INVALID_TOKEN: 401,
  TOKEN_EXPIRED: 401,
  UNAUTHORIZED: 403,

  // Booking errors
  PROPERTY_NOT_FOUND: 404,
  BOOKING_OVERLAP: 409,
  ESCROW_FAILED: 400,
  INVALID_DATES: 400,
  INSUFFICIENT_FUNDS: 402,
  BOOKING_NOT_FOUND: 404,
  INVALID_STATUS: 400,

  // Escrow errors
  ESCROW_CREATION_FAILED: 400,
  ESCROW_RELEASE_FAILED: 400,
  ESCROW_NOT_FOUND: 404,
  INVALID_ESCROW_STATE: 400,
  INSUFFICIENT_ESCROW_BALANCE: 402,

  // Property errors
  UNAUTHORIZED_OWNER: 403,
  INVALID_PROPERTY_DATA: 400,

  // Validation errors
  VALIDATION_ERROR: 400,
  MISSING_REQUIRED_FIELD: 400,
  INVALID_DATE_FORMAT: 400,

  // Rate limit errors
  RATE_LIMITED: 429,

  // Infrastructure / timeout
  REQUEST_TIMEOUT: 504,
  INTERNAL_SERVER_ERROR: 500,
};

// ── Internal helper ───────────────────────────────────────────────────────────

/**
 * Emit a structured error log entry and increment the HTTP error counter.
 * The request-ID from the incoming request is always included so the log
 * entry can be correlated with the originating request in any log viewer.
 */
function logAndCount(
  req: Request,
  statusCode: number,
  code: string,
  err: Error,
): void {
  const typedReq = req as RequestWithId;

  structuredLog({
    level: statusCode >= 500 ? 'error' : 'warn',
    message: `Request error: ${code}`,
    timestamp: new Date().toISOString(),
    requestId: typedReq.requestId,
    userId: typedReq.userId,
    method: req.method,
    path: req.path,
    status: statusCode,
    errorCode: code,
    errorMessage: err.message,
    // Only include stack traces for 5xx — never expose them in 4xx logs
    ...(statusCode >= 500 && { stack: err.stack }),
  });

  const statusClass = statusCode >= 500 ? '5xx' : '4xx';
  incCounter(httpErrorsTotal, {
    method: req.method,
    route: req.path,
    status_class: statusClass,
  });
}

// ── Error middleware ──────────────────────────────────────────────────────────

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as RequestWithId).requestId;

  // ── 413 Payload Too Large ─────────────────────────────────────────────────
  const bodyParserErr = err as BodyParserError;
  if (bodyParserErr.status === 413 || bodyParserErr.type === 'entity.too.large') {
    logAndCount(req, 413, 'PAYLOAD_TOO_LARGE', err);
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the maximum allowed size.',
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  // ── 400 Malformed JSON ────────────────────────────────────────────────────
  if (
    err instanceof SyntaxError &&
    (bodyParserErr.status === 400 || bodyParserErr.type === 'entity.parse.failed')
  ) {
    logAndCount(req, 400, 'MALFORMED_JSON', err);
    res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request body contains invalid JSON.',
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  // ── Validation errors ─────────────────────────────────────────────────────
  if (err instanceof ValidationError) {
    logAndCount(req, 400, 'VALIDATION_ERROR', err);
    const response: ValidationErrorResponse = {
      message: err.message,
      fields: err.fields,
      requestId,
    };
    res.status(400).json(response);
    return;
  }

  // ── Domain errors ─────────────────────────────────────────────────────────
  if (isDomainError(err)) {
    const domainErr = err as DomainError;
    const statusCode = ERROR_STATUS_MAP[domainErr.code] ?? 400;
    logAndCount(req, statusCode, domainErr.code, err);

    const response: ErrorResponse = {
      error: {
        code: domainErr.code,
        message: domainErr.message,
        requestId,
      },
    };
    if (domainErr.details) {
      response.error.details = domainErr.details;
    }
    res.status(statusCode).json(response);
    return;
  }

  // ── Untyped / unexpected errors ───────────────────────────────────────────
  logAndCount(req, 500, 'INTERNAL_SERVER_ERROR', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      // Never expose raw err.message for untyped errors in production
      message: 'Internal server error',
      requestId,
    },
  } satisfies ErrorResponse);
}
