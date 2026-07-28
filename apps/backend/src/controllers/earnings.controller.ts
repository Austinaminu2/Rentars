import type { Response } from 'express';
import type { AuthRequest } from '@/middleware/auth.middleware.js';
import { EarningsService } from '@/services/earnings.service.js';

const earningsService = new EarningsService();

/**
 * GET /api/v1/host/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns gross, platform_fees, net, pending, and released earnings for the
 * authenticated host over the requested date range.
 */
export async function getHostEarnings(req: AuthRequest, res: Response): Promise<void> {
  const hostId = req.userId;
  if (!hostId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { from, to } = req.query as { from?: string; to?: string };
  if (!from || !to) {
    res.status(422).json({ error: 'from and to query parameters are required (YYYY-MM-DD)' });
    return;
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    res.status(422).json({ error: 'from and to must be valid dates in YYYY-MM-DD format' });
    return;
  }

  const result = await earningsService.getHostEarnings(hostId, from, to);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}
