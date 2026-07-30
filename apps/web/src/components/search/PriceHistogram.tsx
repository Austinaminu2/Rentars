'use client';

/**
 * PriceHistogram — renders a bar chart of listing-price distribution.
 *
 * Designed to be overlaid behind the price range slider in FilterSidebar.
 * The component is purely presentational — it receives pre-computed bucket
 * data from the server (via the search API) and renders it as a responsive
 * SVG bar chart.
 *
 * Design decisions:
 *  - Bars inside the current [priceMin, priceMax] selection are highlighted
 *    in blue; bars outside are dimmed grey. This gives instant visual
 *    feedback as the user drags the price slider.
 *  - Server computes buckets — no client-side aggregation over raw listings.
 *  - Accessible: role="img" with an aria-label describing the chart.
 *  - Performance: renders as a lightweight inline SVG, no canvas or heavy lib.
 */

import type { PriceHistogramResult } from '@/types/search';

interface PriceHistogramProps {
  histogram: PriceHistogramResult;
  /** Current min price filter value — bars below this are dimmed. */
  priceMin: number;
  /** Current max price filter value — bars above this are dimmed. */
  priceMax: number;
  /** Height of the chart in pixels (default 48). */
  height?: number;
  className?: string;
}

export default function PriceHistogram({
  histogram,
  priceMin,
  priceMax,
  height = 48,
  className = '',
}: PriceHistogramProps) {
  const { buckets } = histogram;
  if (!buckets.length) return null;

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const total    = buckets.reduce((acc, b) => acc + b.count, 0);

  // SVG viewBox — fixed width, dynamic height
  const svgWidth  = 200;
  const svgHeight = height;
  const gap       = 1; // px gap between bars
  const barWidth  = (svgWidth - gap * (buckets.length - 1)) / buckets.length;

  return (
    <figure
      className={`w-full ${className}`}
      aria-label={`Price distribution: ${total} listing${total !== 1 ? 's' : ''} across ${buckets.length} price ranges from ${histogram.global_min} to ${histogram.global_max} USDC`}
      role="img"
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {buckets.map((bucket, i) => {
          const barH    = Math.max(2, (bucket.count / maxCount) * svgHeight);
          const x       = i * (barWidth + gap);
          const y       = svgHeight - barH;
          const inRange = bucket.max > priceMin && bucket.min < priceMax;

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={1}
              fill={inRange ? '#3B82F6' : '#D1D5DB'}
              opacity={inRange ? 1 : 0.5}
            >
              <title>
                {bucket.min}–{bucket.max} USDC: {bucket.count} listing{bucket.count !== 1 ? 's' : ''}
              </title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        Price distribution histogram from {histogram.global_min} to {histogram.global_max} USDC.
        {total} listing{total !== 1 ? 's' : ''} shown across {buckets.length} price buckets.
        Bars highlighted in blue are within the selected price range.
      </figcaption>
    </figure>
  );
}
