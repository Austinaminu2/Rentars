'use client';

/**
 * PriceDisplay — renders a USDC amount with an optional local-currency estimate.
 *
 * Layout (single line):
 *   100.00 USDC  ≈ €92.00 EUR  (estimate)
 *
 * Rules:
 *  - The USDC figure is always primary and always shown.
 *  - The local-currency figure is secondary, clearly prefixed with "≈" and
 *    suffixed with "(estimate)" so users understand it is non-binding.
 *  - When the display currency is USD the estimate is omitted (1:1 with USDC).
 *  - When rates are loading or unavailable the estimate is silently omitted;
 *    never shows a broken/zero value.
 *  - When rates are stale a small warning tooltip is shown.
 */

import { useCurrency } from '@/hooks/useCurrency';
import type { DisplayCurrency } from '@/hooks/useCurrency';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PriceDisplayProps {
  /** Amount in USDC (the authoritative charge amount). */
  amountUsdc: number;
  /** Optional suffix appended after the USDC figure, e.g. "/ night". */
  suffix?: string;
  /** Extra class names for the wrapper element. */
  className?: string;
  /**
   * Override the display currency for this instance (e.g. inside a picker
   * preview). When omitted the globally-stored preference is used.
   */
  currencyOverride?: DisplayCurrency;
  /** Size variant — affects text sizing. */
  size?: 'sm' | 'md' | 'lg';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sizeClasses(size: PriceDisplayProps['size']) {
  switch (size) {
    case 'sm': return { primary: 'text-sm font-semibold', estimate: 'text-xs', suffix: 'text-xs' };
    case 'lg': return { primary: 'text-xl font-bold',    estimate: 'text-sm', suffix: 'text-sm' };
    default:   return { primary: 'text-base font-bold',  estimate: 'text-xs', suffix: 'text-xs' };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PriceDisplay({
  amountUsdc,
  suffix,
  className = '',
  currencyOverride,
  size = 'md',
}: PriceDisplayProps) {
  const { formatEstimate, displayCurrency, ratesStale, setDisplayCurrency, supportedCurrencies } =
    useCurrency();

  const activeCurrency = currencyOverride ?? displayCurrency;

  // Build the local-currency estimate string (null → omit)
  let estimate: string | null = null;
  if (activeCurrency !== 'USD') {
    estimate = formatEstimate(amountUsdc);
  }

  const sc = sizeClasses(size);

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${className}`}>
      {/* Primary: USDC amount — always shown */}
      <span className={`${sc.primary} text-blue-600 dark:text-blue-400 tabular-nums`}>
        {amountUsdc.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{' '}
        USDC
      </span>

      {/* Optional per-night/per-stay suffix */}
      {suffix && (
        <span className={`${sc.suffix} font-normal text-gray-400 dark:text-gray-500`}>
          {suffix}
        </span>
      )}

      {/* Local-currency estimate */}
      {estimate && (
        <span
          className={`${sc.estimate} text-gray-500 dark:text-gray-400 whitespace-nowrap`}
          aria-label={`Approximate local currency equivalent: ${estimate}`}
        >
          {estimate}
          {' '}
          <span className="text-gray-400 dark:text-gray-500 italic">(estimate)</span>
          {ratesStale && (
            <abbr
              title="Exchange rate may be outdated — charges are always in USDC"
              className="ml-1 cursor-help text-amber-500 dark:text-amber-400 no-underline"
              aria-label="Exchange rate may be outdated"
            >
              ⚠
            </abbr>
          )}
        </span>
      )}
    </span>
  );
}

// ─── Currency Selector ────────────────────────────────────────────────────────

/**
 * Compact inline selector that lets the user pick their display currency.
 * Typically placed in a header or settings panel.
 */
export function CurrencySelector({ className = '' }: { className?: string }) {
  const { displayCurrency, setDisplayCurrency, supportedCurrencies } = useCurrency();

  if (supportedCurrencies.length === 0) return null;

  return (
    <select
      value={displayCurrency}
      onChange={(e) => setDisplayCurrency(e.target.value as DisplayCurrency)}
      aria-label="Select display currency for price estimates"
      className={`text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1
        bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300
        focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
        ${className}`}
    >
      {supportedCurrencies.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}
