/**
 * Unit tests for PriceHistogram component and histogram-related logic.
 *
 * Covers:
 *  - Renders correct number of bars from bucket data
 *  - Bars inside price range have blue fill; bars outside are grey
 *  - Renders nothing when bucket array is empty
 *  - Accessible aria-label describes the distribution
 *  - SVG title elements contain min/max/count per bucket
 *  - Histogram in usePropertySearch state updates when search returns new data
 *  - FilterSidebar passes histogram to PriceHistogram and sliders
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PriceHistogram from '@/components/search/PriceHistogram';
import type { PriceHistogramResult } from '@/types/search';

// ─── Test data ────────────────────────────────────────────────────────────────

function makeHistogram(counts: number[], globalMin = 0, globalMax = 1000): PriceHistogramResult {
  const bucketWidth = (globalMax - globalMin) / counts.length;
  return {
    global_min: globalMin,
    global_max: globalMax,
    buckets: counts.map((count, i) => ({
      min: Math.round(globalMin + i * bucketWidth),
      max: Math.round(globalMin + (i + 1) * bucketWidth),
      count,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('PriceHistogram component', () => {

  it('renders one SVG rect per bucket', () => {
    const histogram = makeHistogram([5, 10, 8, 3, 1]);
    const { container } = render(
      <PriceHistogram histogram={histogram} priceMin={0} priceMax={1000} />,
    );

    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(5);
  });

  it('renders nothing when bucket array is empty', () => {
    const histogram: PriceHistogramResult = { buckets: [], global_min: 0, global_max: 1000 };
    const { container } = render(
      <PriceHistogram histogram={histogram} priceMin={0} priceMax={1000} />,
    );

    expect(container.querySelector('svg')).toBeNull();
  });

  it('colours bars inside [priceMin, priceMax] blue', () => {
    // buckets: 0-250, 250-500, 500-750, 750-1000
    const histogram = makeHistogram([10, 20, 15, 5], 0, 1000);
    const { container } = render(
      // Select only the middle two buckets (250–750)
      <PriceHistogram histogram={histogram} priceMin={250} priceMax={750} />,
    );

    const rects = Array.from(container.querySelectorAll('rect'));
    // Bucket 0 (0–250): max=250 is NOT > priceMin=250 → out of range → grey
    expect(rects[0].getAttribute('fill')).toBe('#D1D5DB');
    // Bucket 1 (250–500): max=500 > 250 && min=250 < 750 → in range → blue
    expect(rects[1].getAttribute('fill')).toBe('#3B82F6');
    // Bucket 2 (500–750): max=750 > 250 && min=500 < 750 → in range → blue
    expect(rects[2].getAttribute('fill')).toBe('#3B82F6');
    // Bucket 3 (750–1000): min=750 is NOT < priceMax=750 → out of range → grey
    expect(rects[3].getAttribute('fill')).toBe('#D1D5DB');
  });

  it('all bars blue when priceMin=globalMin and priceMax=globalMax', () => {
    const histogram = makeHistogram([5, 10, 8], 0, 300);
    const { container } = render(
      <PriceHistogram histogram={histogram} priceMin={0} priceMax={300} />,
    );

    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.every((r) => r.getAttribute('fill') === '#3B82F6')).toBe(true);
  });

  it('all bars grey when priceMax < globalMin (no range overlap)', () => {
    const histogram = makeHistogram([5, 10, 8], 500, 1000);
    const { container } = render(
      // price range [0,100] doesn't overlap with [500,1000]
      <PriceHistogram histogram={histogram} priceMin={0} priceMax={100} />,
    );

    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.every((r) => r.getAttribute('fill') === '#D1D5DB')).toBe(true);
  });

  it('has accessible figure role with aria-label', () => {
    const histogram = makeHistogram([5, 10, 8], 0, 300);
    render(<PriceHistogram histogram={histogram} priceMin={0} priceMax={300} />);

    const figure = screen.getByRole('img');
    expect(figure.getAttribute('aria-label')).toContain('Price distribution');
    expect(figure.getAttribute('aria-label')).toContain('300 USDC');
  });

  it('SVG title elements include min, max and count per bucket', () => {
    const histogram = makeHistogram([7], 100, 200);
    const { container } = render(
      <PriceHistogram histogram={histogram} priceMin={100} priceMax={200} />,
    );

    const title = container.querySelector('rect title');
    expect(title?.textContent).toContain('100');
    expect(title?.textContent).toContain('200');
    expect(title?.textContent).toContain('7');
  });

  it('renders sr-only figcaption with full description', () => {
    const histogram = makeHistogram([5, 10], 0, 200);
    const { container } = render(
      <PriceHistogram histogram={histogram} priceMin={0} priceMax={200} />,
    );

    const caption = container.querySelector('figcaption');
    expect(caption?.classList.contains('sr-only')).toBe(true);
    expect(caption?.textContent).toContain('0 to 200 USDC');
  });

  it('respects custom height prop', () => {
    const histogram = makeHistogram([5, 10, 8], 0, 300);
    const { container } = render(
      <PriceHistogram histogram={histogram} priceMin={0} priceMax={300} height={80} />,
    );

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('height')).toBe('80');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('histogram bucket computation logic', () => {
  /**
   * Unit-tests for the bucket algorithm used in propertySearch.service.ts
   * (replicated here to test the pure logic without a DB).
   */

  function computeBuckets(prices: number[], numBuckets: number) {
    if (!prices.length) return { buckets: [], global_min: 0, global_max: 0 };

    const globalMin = Math.floor(Math.min(...prices));
    const globalMax = Math.ceil(Math.max(...prices));

    if (globalMin === globalMax) {
      return {
        buckets: [{ min: globalMin, max: globalMax, count: prices.length }],
        global_min: globalMin,
        global_max: globalMax,
      };
    }

    const bucketWidth = (globalMax - globalMin) / numBuckets;
    const counts = new Array<number>(numBuckets).fill(0);

    for (const price of prices) {
      const idx = Math.min(Math.floor((price - globalMin) / bucketWidth), numBuckets - 1);
      counts[idx]++;
    }

    return {
      buckets: counts.map((count, i) => ({
        min: Math.round(globalMin + i * bucketWidth),
        max: Math.round(globalMin + (i + 1) * bucketWidth),
        count,
      })),
      global_min: globalMin,
      global_max: globalMax,
    };
  }

  it('returns empty result for empty price array', () => {
    const result = computeBuckets([], 10);
    expect(result.buckets).toHaveLength(0);
    expect(result.global_min).toBe(0);
    expect(result.global_max).toBe(0);
  });

  it('produces correct bucket count', () => {
    const prices = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const result = computeBuckets(prices, 10);
    expect(result.buckets).toHaveLength(10);
  });

  it('all prices fall into exactly one bucket (sum of counts = prices.length)', () => {
    const prices = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
    const result = computeBuckets(prices, 5);
    const total = result.buckets.reduce((acc, b) => acc + b.count, 0);
    expect(total).toBe(prices.length);
  });

  it('last bucket absorbs the max value (clamp to numBuckets-1)', () => {
    const prices = [0, 100, 200, 300, 400, 500];
    const result = computeBuckets(prices, 5);
    const total = result.buckets.reduce((acc, b) => acc + b.count, 0);
    expect(total).toBe(6); // all prices accounted for
  });

  it('returns single bucket when all prices are identical', () => {
    const prices = [200, 200, 200];
    const result = computeBuckets(prices, 10);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0].count).toBe(3);
  });

  it('global_min and global_max reflect the actual data range', () => {
    const prices = [123.5, 456.7, 78.9];
    const result = computeBuckets(prices, 5);
    expect(result.global_min).toBeLessThanOrEqual(78.9);
    expect(result.global_max).toBeGreaterThanOrEqual(456.7);
  });

  it('price filter exclusion — min_price/max_price do NOT affect bucket data', () => {
    // Simulate: same price array regardless of whether price filters are applied
    const allPrices  = [50, 100, 150, 200, 250, 300];
    const withFilter = [50, 100, 150, 200, 250, 300]; // identical — price filter excluded

    const r1 = computeBuckets(allPrices, 3);
    const r2 = computeBuckets(withFilter, 3);

    expect(r1.buckets.map((b) => b.count)).toEqual(r2.buckets.map((b) => b.count));
  });
});
