/**
 * Exchange Rate Service
 *
 * Fetches USDC→local-currency conversion rates from a public free API
 * (exchangerate-api.com free tier / open.er-api.com) and caches the result
 * in Redis with a configurable TTL.
 *
 * Architecture decisions:
 *  - Rates are informational only — charges always happen in USDC.
 *  - A background refresh loop keeps the in-process fallback cache warm so
 *    the endpoint never blocks on a cold cache during peak traffic.
 *  - The rate source is configurable via EXCHANGE_RATE_API_URL so teams can
 *    swap providers without code changes.
 *  - On fetch failure the last known rates are returned (stale-while-revalidate
 *    semantics) so the UI degrades gracefully rather than breaking.
 */

import * as cache from './cache.service.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Currencies we commit to displaying.  Extend as needed. */
export const SUPPORTED_DISPLAY_CURRENCIES = [
  'USD', // baseline — 1:1 with USDC by definition
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'CNY',
  'BRL',
  'INR',
  'MXN',
  'NGN',
  'KES',
  'ZAR',
  'SGD',
  'HKD',
  'NOK',
  'SEK',
  'DKK',
  'PLN',
] as const;

export type DisplayCurrency = (typeof SUPPORTED_DISPLAY_CURRENCIES)[number];

export interface ExchangeRates {
  /** Base currency — always USDC (pegged 1:1 to USD). */
  base: 'USDC';
  /** ISO 4217 code → units of that currency per 1 USDC */
  rates: Record<DisplayCurrency, number>;
  /** Unix timestamp (ms) when rates were last fetched from upstream. */
  fetched_at: number;
  /** Unix timestamp (ms) after which the consumer should treat rates as stale. */
  expires_at: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * How long (seconds) to keep rates in Redis.
 * Overrideable via EXCHANGE_RATE_CACHE_TTL env var.
 */
const CACHE_TTL_SECONDS = Number(process.env.EXCHANGE_RATE_CACHE_TTL ?? 300); // 5 min default

/** Redis key for the cached rates object. */
const CACHE_KEY = 'exchange_rates:usdc';

/**
 * Upstream exchange-rate API endpoint.
 * Default: open.er-api.com free tier (no key required, 1,500 req/month on free plan).
 * Override via EXCHANGE_RATE_API_URL.
 */
const API_URL =
  process.env.EXCHANGE_RATE_API_URL ?? 'https://open.er-api.com/v6/latest/USD';

// ─── In-process fallback ──────────────────────────────────────────────────────

/** Last successfully fetched rates held in memory as a safety net. */
let inProcessCache: ExchangeRates | null = null;

// ─── Fetch & transform ────────────────────────────────────────────────────────

interface ErApiResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix?: number;
}

/**
 * Fetch fresh rates from upstream, filter to supported currencies, and wrap in
 * the ExchangeRates envelope.  Throws on network/parse error.
 */
async function fetchFreshRates(): Promise<ExchangeRates> {
  const res = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`Exchange-rate API responded with ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as ErApiResponse;

  if (body.result && body.result !== 'success') {
    throw new Error(`Exchange-rate API error: ${body.result}`);
  }

  const now = Date.now();

  // Build filtered rates — always include USD=1.0 as the USDC anchor.
  const rates = {} as Record<DisplayCurrency, number>;
  for (const code of SUPPORTED_DISPLAY_CURRENCIES) {
    rates[code] = code === 'USD' ? 1.0 : (body.rates[code] ?? 0);
  }

  return {
    base: 'USDC',
    rates,
    fetched_at: now,
    expires_at: now + CACHE_TTL_SECONDS * 1_000,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return current USDC exchange rates.
 *
 * Resolution order:
 *   1. Redis cache (warm, fast)
 *   2. Upstream API (cold fetch, updates Redis + in-process cache)
 *   3. In-process stale cache (API unavailable fallback)
 *
 * Never throws — returns the best available data plus a `stale` flag so the
 * consumer can decide whether to surface a UI warning.
 */
export async function getExchangeRates(): Promise<ExchangeRates & { stale?: boolean }> {
  // 1. Try Redis
  try {
    const cached = await cache.get<ExchangeRates>(CACHE_KEY);
    if (cached) {
      return cached;
    }
  } catch {
    // Redis unavailable — fall through
  }

  // 2. Try upstream
  try {
    const fresh = await fetchFreshRates();
    // Persist to Redis and in-process cache
    await cache.set(CACHE_KEY, fresh, CACHE_TTL_SECONDS).catch(() => {});
    inProcessCache = fresh;
    return fresh;
  } catch (err) {
    console.warn('[ExchangeRateService] Upstream fetch failed:', err);
  }

  // 3. Stale in-process fallback
  if (inProcessCache) {
    console.warn('[ExchangeRateService] Returning stale in-process rates');
    return { ...inProcessCache, stale: true };
  }

  // 4. Last resort — return 1:1 rates so the UI shows USDC = USD
  const now = Date.now();
  const fallback: ExchangeRates & { stale: boolean } = {
    base: 'USDC',
    rates: Object.fromEntries(
      SUPPORTED_DISPLAY_CURRENCIES.map((c) => [c, c === 'USD' ? 1 : 0]),
    ) as Record<DisplayCurrency, number>,
    fetched_at: now,
    expires_at: now,
    stale: true,
  };
  return fallback;
}

/**
 * Force-refresh the exchange rates from upstream and repopulate the caches.
 * Called by the background refresh task; also useful in tests.
 */
export async function refreshExchangeRates(): Promise<ExchangeRates> {
  const fresh = await fetchFreshRates();
  await cache.set(CACHE_KEY, fresh, CACHE_TTL_SECONDS).catch(() => {});
  inProcessCache = fresh;
  return fresh;
}

/**
 * Convert a USDC amount to the target display currency using current rates.
 *
 * Returns null when the target currency is unsupported or the rate is zero
 * (indicates the rate was unavailable at fetch time).
 *
 * @param amountUsdc - Amount in USDC to convert.
 * @param targetCurrency - ISO 4217 code of the display currency.
 * @param rates - Pre-fetched rates object (avoids a redundant cache hit per call).
 */
export function convertUsdc(
  amountUsdc: number,
  targetCurrency: string,
  rates: ExchangeRates,
): number | null {
  const rate = rates.rates[targetCurrency as DisplayCurrency];
  if (!rate || rate === 0) return null;
  return Math.round(amountUsdc * rate * 100) / 100;
}

// ─── Background refresh ───────────────────────────────────────────────────────

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a background interval that pre-warms the Redis cache before it expires.
 * Call once at server startup.  Safe to call multiple times — only one interval
 * is created.
 *
 * @param intervalMs - Refresh cadence in milliseconds (default: 4 minutes, just
 *   before the 5-minute Redis TTL so there is always a warm cache entry).
 */
export function startRateRefreshLoop(intervalMs = 4 * 60 * 1_000): void {
  if (refreshTimer !== null) return;

  // Seed the cache immediately on startup
  refreshExchangeRates().catch((err) =>
    console.warn('[ExchangeRateService] Initial seed failed:', err),
  );

  refreshTimer = setInterval(() => {
    refreshExchangeRates().catch((err) =>
      console.warn('[ExchangeRateService] Background refresh failed:', err),
    );
  }, intervalMs);

  // Allow the process to exit cleanly even if the timer is still alive
  if (refreshTimer.unref) refreshTimer.unref();
}
