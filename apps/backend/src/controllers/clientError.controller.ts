import type { Request, Response } from 'express';
import { z } from 'zod';
import { loggingService } from '@/services/logging.service.js';
import { structuredLog } from '@/middleware/logging.middleware.js';
import { incCounter, clientErrorsTotal } from '@/middleware/metrics.middleware.js';
import type { RequestWithId } from '@/middleware/logging.middleware.js';

/**
 * Zod schema for the client-error payload.
 * Strict typing ensures we only persist what we expect and
 * reject any attempt to inject oversized or malformed data.
 */
const clientErrorSchema = z.object({
  message: z.string().max(300),
  href: z.string().url().max(2048).optional().or(z.literal('')),
  digest: z.string().max(64).optional(),
  context: z.string().max(100).optional(),
  timestamp: z.string().datetime().optional(),
  // Optional correlation ID forwarded from the browser (echoed from X-Request-Id)
  requestId: z.string().max(64).optional(),
});

/**
 * POST /api/v1/client-errors
 *
 * Receives sanitised error reports from the browser.
 * This endpoint is unauthenticated — errors can occur before login.
 *
 * Security guarantees:
 * - Payload is validated and strictly bounded before persistence.
 * - No raw stack traces accepted — only the pre-sanitised message.
 * - Rate limiting is applied by the general limiter in the middleware chain.
 * - Always returns 204 so attackers cannot probe the system via response differences.
 */
export async function receiveClientError(req: Request, res: Response): Promise<void> {
  const parsed = clientErrorSchema.safeParse(req.body);

  if (!parsed.success) {
    // Silently accept — return 204 so clients don't retry unnecessarily
    res.status(204).end();
    return;
  }

  const { message, href, digest, context, timestamp, requestId: clientRequestId } = parsed.data;

  // Use the server-assigned request-ID if the client didn't supply one
  const serverRequestId = (req as RequestWithId).requestId;
  const correlationId = clientRequestId ?? serverRequestId;
  const contextLabel = context ?? 'unknown';

  // Emit a structured log entry for log-aggregation pipelines
  structuredLog({
    level: 'warn',
    message: `Client error reported: ${message}`,
    timestamp: new Date().toISOString(),
    requestId: correlationId,
    source: 'browser',
    context: contextLabel,
    href: href ?? '',
    digest: digest ?? '',
    reportedAt: timestamp ?? new Date().toISOString(),
  });

  // Increment the Prometheus counter so dashboards and alerts can track trends
  incCounter(clientErrorsTotal, { context: contextLabel });

  // Persist to the blockchain_logs table (best-effort — failure must not surface to client)
  await loggingService.logBlockchainOperation(
    'client_error',
    {
      source: 'browser',
      context: contextLabel,
      href: href ?? '',
      digest: digest ?? '',
      correlationId: correlationId ?? '',
      reportedAt: timestamp ?? new Date().toISOString(),
    },
    undefined,
    message,
  );

  // Always 204 — consistent response prevents enumeration
  res.status(204).end();
}
