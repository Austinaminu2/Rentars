'use client';

/**
 * useCurrency — manages the user's display-currency preference and provides
 * real-time USDC → local-currency conversion estimates.
 *
 * Design:
 *  - Currency preference is persisted in localStorage so it survives navigation.
 *  - Exchange rates are fetched once from the backend and cached in-module for
 *    the session (they are already server-side cached, so re-fetching on every
 *    render is fine, but a module-level cache avoids redundant network calls).
 *  - The hook exposes `formatEstimate(amountUsdc)` which returns a string like
 *    "≈ €92.00 EUR (estimate)" or null when a rate is unavailable.
 *  - Charges always remain in USDC; this is presentation-only.
 */

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DisplayCurrency =
  | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CHF' | 'CNY'
  | 'BRL' | 'INR' | 'MXN' | 'NGN' | 'KES' | 'ZAR' | 'SGD' | 'HKD'
  | 'NOK' | 'SEK' | 'DKK' | 'PLN';

export interface ExchangeRates {
  base: 'USDC';
  rates: Record<string, number>;
  fetched_at: number;
  expires_at: number;
  stale: boolean;
  supported_currencies: DisplayCurrency[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'rntr_display_currency';
const DEFAULT_CURRENCY: DisplayCurrency = 'USD';

/** BCP-47 locale hint per currency for Intl.NumberFormat */
const CURRENCY_LOCALE: Partial<Record<DisplayCurrency, string>> = {
  USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP',
  CAD: 'en-CA', AUD: 'en-AU', CHF: 'de-CH', CNY: 'zh-CN',
  BRL: 'pt-BR', INR: 'hi-IN', MXN: 'es-MX', NGN: 'en-NG',
  KES: 'sw-KE', ZAR: 'en-ZA', SGD: 'en-SG', HKD: 'zh-HK',
  NOK: 'nb-NO', SEK: 'sv-SE', DKK: 'da-DK', PLN: 'pl-PL',
};

const API_URL =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3000';

// ─── Module-level cache (shared across hook instances in the same session) ───

let _ratesCache: ExchangeRates | null = null;
let _ratesFetchedAt = 0;
const RATES_MAX_AGE_MS = 5 * 60 * 1_000; // 5 minutes

// ─── Locale detection helper ─────────────────────────────────────────────────

/**
 * Map browser locale (e.g. "pt-BR", "de") to an ISO 4217 currency code that
 * is in our supported list.  Falls back to DEFAULT_CURRENCY.
 */
function detectLocaleCurrency(): DisplayCurrency {
  if (typeof navigator === 'undefined') return DEFAULT_CURRENCY;
  try {
    const locale = navigator.language ?? '';
    // Intl.NumberFormat with style:currency respects locale → currency mapping
    const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
    // Use the resolved locale's country to guess the currency
    const resolved = fmt.resolvedOptions();
    // Try to extract currency from locale region
    const regionCurrencyMap: Record<string, DisplayCurrency> = {
      US: 'USD', GB: 'GBP', EU: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR',
      IT: 'EUR', NL: 'EUR', PT: 'EUR', JP: 'JPY', CA: 'CAD', AU: 'AUD',
      CH: 'CHF', CN: 'CNY', BR: 'BRL', IN: 'INR', MX: 'MXN', NG: 'NGN',
      KE: 'KES', ZA: 'ZAR', SG: 'SGD', HK: 'HKD', NO: 'NOK', SE: 'SEK',
      DK: 'DKK', PL: 'PLN',
    };
    const region = locale.split('-')[1]?.toUpperCase();
    return region ? (regionCurrencyMap[region] ?? DEFAULT_CURRENCY) : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCurrencyReturn {
  /** Currently selected display currency. */
  displayCurrency: DisplayCurrency;
  /** Update and persist the display currency preference. */
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  /** Current exchange rates, or null while loading. */
  rates: ExchangeRates | null;
  /** True while the initial rate fetch is in flight. */
  ratesLoading: boolean;
  /** True when the rates are stale (upstream was unreachable). */
  ratesStale: boolean;
  /**
   * Convert and format a USDC amount into the selected display currency.
   * Returns null when the rate is unavailable (loading or unsupported currency).
   *
   * The returned string includes the ≈ prefix and is clearly labelled as an
   * estimate, e.g. "≈ €92.00 EUR".
   */
  formatEstimate: (amountUsdc: number) => string | null;
  /** List of all currencies the backend supports for display. */
  supportedCurrencies: DisplayCurrency[];
}

export function useCurrency(): UseCurrencyReturn {
  // ── Preference state (localStorage-backed) ───────────────────────────────

  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_CURRENCY;
    const stored = localStorage.getItem(LS_KEY) as DisplayCurrency | null;
    return stored ?? detectLocaleCurrency();
  });

  const setDisplayCurrency = useCallback((currency: DisplayCurrency) => {
    setDisplayCurrencyState(currency);
    try {
      localStorage.setItem(LS_KEY, currency);
    } catch {
      // Storage unavailable (e.g. private browsing quota reached)
    }
  }, []);

  // ── Rate fetch state ─────────────────────────────────────────────────────

  const [rates, setRates] = useState<ExchangeRates | null>(_ratesCache);
  const [ratesLoading, setRatesLoading] = useState(!_ratesCache);
  const [ratesStale, setRatesStale] = useState(false);

  useEffect(() => {
    const now = Date.now();
    // Skip fetch if we have a fresh module-level cache
    if (_ratesCache && now - _ratesFetchedAt < RATES_MAX_AGE_MS) {
      setRates(_ratesCache);
      setRatesLoading(false);
      setRatesStale(_ratesCache.stale);
      return;
    }

    let cancelled = false;

    async function fetchRates() {
      try {
        const res = await fetch(`${API_URL}/api/v1/exchange-rates`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ExchangeRates = await res.json();
        if (!cancelled) {
          _ratesCache = data;
          _ratesFetchedAt = Date.now();
          setRates(data);
          setRatesStale(data.stale);
        }
      } catch {
        // Keep whatever we have; mark stale
        if (!cancelled) {
          setRatesStale(true);
        }
      } finally {
        if (!cancelled) setRatesLoading(false);
      }
    }

    fetchRates();
    return () => { cancelled = true; };
  }, []);

  // ── Formatting helper ────────────────────────────────────────────────────

  const formatEstimate = useCallback(
    (amountUsdc: number): string | null => {
      if (!rates) return null;
      const rate = rates.rates[displayCurrency];
      if (!rate || rate === 0) return null;

      const converted = amountUsdc * rate;

      try {
        const locale = CURRENCY_LOCALE[displayCurrency] ?? 'en-US';
        // JPY and other zero-decimal currencies
        const formatted = new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: displayCurrency,
          minimumFractionDigits: displayCurrency === 'JPY' || displayCurrency === 'KES' ? 0 : 2,
          maximumFractionDigits: displayCurrency === 'JPY' || displayCurrency === 'KES' ? 0 : 2,
        }).format(converted);

        return `≈ ${formatted} ${displayCurrency}`;
      } catch {
        // Intl not available in some environments
        return `≈ ${converted.toFixed(2)} ${displayCurrency}`;
      }
    },
    [rates, displayCurrency],
  );

  return {
    displayCurrency,
    setDisplayCurrency,
    rates,
    ratesLoading,
    ratesStale,
    formatEstimate,
    supportedCurrencies: rates?.supported_currencies ?? [],
  };
}
