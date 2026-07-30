import { randomUUID } from 'node:crypto';
import { type Request, type Response, type NextFunction } from 'express';
import { env } from '../config/env.js';

// ── Log levels ────────────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw in LEVEL_PRIORITY) return raw as LogLevel;
  return 'info';
}

// ── Structured logger ─────────────────────────────────────────────────────────

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Emit a structured JSON log line.
 * In development the line is pretty-printed; in production it is a single-line
 * JSON object suitable for log-aggregation pipelines (Loki, CloudWatch, etc.).
 *
 * The log is suppressed when its level falls below the configured LOG_LEVEL.
 */
export function structuredLog(entry: LogEntry): void {
  const configuredLevel = getConfiguredLevel();
  if (LEVEL_PRIORITY[entry.level] < LEVEL_PRIORITY[configuredLevel]) return;

  const line =
    env.NODE_ENV === 'development'
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

  if (entry.level === 'error') {
    console.error(line);
  } else if (entry.level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

// ── Request-ID injection ──────────────────────────────────────────────────────

/**
 * Attach a unique request-ID to every incoming request so that all log
 * entries emitted during that request can be correlated in a dashboard.
 *
 * The ID is read from the `X-Request-Id` header if the upstream proxy
 * already set one; otherwise a fresh UUID v4 is generated.
 * The final ID is echoed back to the caller in `X-Request-Id`.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.length > 0
      ? incomingId
      : randomUUID();

  // Attach to the request object for downstream middleware and controllers
  (req as RequestWithId).requestId = requestId;

  // Echo back so the client can correlate responses
  res.setHeader('X-Request-Id', requestId);

  next();
}

// ── Typed request extension ───────────────────────────────────────────────────

export interface RequestWithId extends Request {
  requestId?: string;
  userId?: string;
}

// ── HTTP request logging middleware ──────────────────────────────────────────

/**
 * Structured HTTP request/response logger.
 *
 * Emits a single structured log entry per request on response finish, containing:
 *   - ISO timestamp
 *   - Request-ID for correlation
 *   - HTTP method, normalised path, status code, duration
 *   - Authenticated user-ID (if present on req.userId)
 *
 * Paths matching SKIP_PATHS are not logged (e.g. /health, /metrics).
 */
const SKIP_PATHS = new Set(['/health', '/metrics', '/favicon.ico']);

export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  const startMs = Date.now();
  const typedReq = req as RequestWithId;

  res.on('finish', () => {
    const duration = Date.now() - startMs;
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    structuredLog({
      level,
      message: `${req.method} ${req.path} ${res.statusCode}`,
      timestamp: new Date().toISOString(),
      requestId: typedReq.requestId,
      userId: typedReq.userId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  });

  next();
}
