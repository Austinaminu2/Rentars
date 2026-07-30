/**
 * Exchange Rate Routes
 *
 * GET /api/v1/exchange-rates
 *   Returns current USDC → supported display-currency rates.
 *   Publicly accessible (no auth required) — rates are non-sensitive market data.
 *
 * POST /api/v1/exchange-rates/refresh
 *   Admin-only force-refresh that bypasses the cache TTL.
 *   Useful after a provider outage or for testing.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getExchangeRates,
  refreshExchangeRates,
  SUPPORTED_DISPLAY_CURRENCIES,
} from '@/services/exchangeRate.service.js';
import { authenticate } from '@/middleware/auth.middleware.js';
import { requireAdmin } from '@/middleware/admin.middleware.js';

const router = Router();

/**
 * GET /api/v1/exchange-rates
 *
 * Returns USDC exchange rates for all supported display currencies.
 *
 * Response shape:
 * {
 *   "base": "USDC",
 *   "rates": { "USD": 1, "EUR": 0.92, ... },
 *   "fetched_at": 1722000000000,
 *   "expires_at": 1722000300000,
 *   "stale": false,           // true when upstream was unreachable and cached data is old
 *   "supported_currencies": ["USD","EUR",...]
 * }
 *
 * HTTP caching:
 *   Cache-Control is set to match the server-side TTL so CDN / browser caches
 *   align with when the server will have fresh data.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const rates = await getExchangeRates();

  // Tell browsers / CDNs how long to cache the response.
  // Use a shorter window when the rates are stale so clients retry sooner.
  const maxAge = rates.stale ? 30 : Math.max(0, Math.floor((rates.expires_at - Date.now()) / 1_000));
  res.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=60`);

  res.json({
    base: rates.base,
    rates: rates.rates,
    fetched_at: rates.fetched_at,
    expires_at: rates.expires_at,
    stale: rates.stale ?? false,
    supported_currencies: SUPPORTED_DISPLAY_CURRENCIES,
  });
});

/**
 * POST /api/v1/exchange-rates/refresh
 *
 * Force-refresh rates from upstream.  Admin only.
 */
router.post('/refresh', authenticate, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const fresh = await refreshExchangeRates();
    res.json({
      message: 'Exchange rates refreshed successfully',
      base: fresh.base,
      fetched_at: fresh.fetched_at,
      expires_at: fresh.expires_at,
    });
  } catch (err) {
    res.status(502).json({ error: `Failed to refresh exchange rates: ${String(err)}` });
  }
});

export default router;
