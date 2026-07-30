/**
 * Client-side error logger.
 *
 * Sends a sanitised error report to the backend for diagnosis.
 * Stack traces and internal details are NEVER exposed to the user —
 * they are stripped here and only forwarded server-side.
 *
 * Correlation:
 *   When the API responds with an X-Request-Id header, that ID is stored
 *   in a module-level variable and attached to subsequent error reports.
 *   This lets engineering correlate a browser error with the exact backend
 *   request that preceded it, without exposing sensitive data.
 *
 * In development the full error is also printed to the console.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Request-ID tracking ───────────────────────────────────────────────────────

/**
 * The most recent X-Request-Id seen in an API response.
 * Updated by `captureRequestId` — call it from your API client's response
 * interceptor to keep this value fresh.
 */
let lastRequestId: string | undefined;

/**
 * Record the X-Request-Id returned by the most recent API call.
 * Call this from wherever you make fetch/axios requests, e.g.:
 *
 *   const res = await fetch('/api/v1/bookings', { ... });
 *   captureRequestId(res.headers.get('x-request-id'));
 */
export function captureRequestId(id: string | null | undefined): void {
  if (id) lastRequestId = id;
}

/**
 * Returns the most recently captured request ID, if any.
 * Useful for including in user-visible support references.
 */
export function getLastRequestId(): string | undefined {
  return lastRequestId;
}

// ── Error report shape ────────────────────────────────────────────────────────

export interface ErrorReport {
  /** Sanitised error message (no stack traces or file paths) */
  message: string;
  /** URL where the error occurred */
  href: string;
  /** Digest provided by Next.js error boundaries */
  digest?: string;
  /** Error boundary or component context label */
  context?: string;
  /** ISO timestamp */
  timestamp: string;
  /**
   * The X-Request-Id from the most recent API call that preceded this error.
   * Allows backend engineers to find the related server-side log entry.
   */
  requestId?: string;
}

// ── Message sanitisation ──────────────────────────────────────────────────────

/**
 * Strip anything that looks like a stack trace, internal path, or token
 * from a raw error message before forwarding to the server.
 */
function sanitiseMessage(raw: string): string {
  return raw
    // Remove file paths (e.g. /home/user/…, C:\Users\…, ./src/…)
    .replace(/([A-Za-z]:[\\/]|\/)[^\s'"]+/g, '[path]')
    // Remove anything that looks like a JWT / bearer token
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[token]')
    // Collapse consecutive whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // Cap length so we never send huge payloads
    .slice(0, 300);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Log a client-side error to the backend.
 *
 * @param error   The caught error or unknown value.
 * @param context A label identifying the error boundary or call-site
 *                (e.g. "booking-form", "global-error-boundary").
 * @param digest  The Next.js error digest, if available.
 */
export async function logClientError(
  error: unknown,
  context?: string,
  digest?: string,
): Promise<void> {
  const raw = error instanceof Error ? error.message : String(error);
  const message = sanitiseMessage(raw);
  const href = typeof window !== 'undefined' ? window.location.href : '';

  const report: ErrorReport = {
    message,
    href,
    digest,
    context,
    timestamp: new Date().toISOString(),
    // Attach the last known API request-ID so the error can be correlated
    // with the backend log entry that triggered or preceded it.
    requestId: lastRequestId,
  };

  if (process.env.NODE_ENV === 'development') {
    console.error('[ErrorLogger]', report, error instanceof Error ? error.stack : '');
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/client-errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the last known request-ID as a header as well, so the
        // backend can use it for server-side log correlation even if the
        // body parsing fails.
        ...(lastRequestId ? { 'X-Request-Id': lastRequestId } : {}),
      },
      body: JSON.stringify(report),
      // Short timeout so a broken backend doesn't hang the error UI
      signal: AbortSignal.timeout?.(5000),
    });

    // Capture the new request-ID from the error-report response itself
    captureRequestId(res.headers.get('x-request-id'));
  } catch {
    // Silently swallow — we must never throw from the logger
  }
}
