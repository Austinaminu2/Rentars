import { describe, it, expect, beforeEach } from 'vitest';
import { getRecentlyViewedIds, recordRecentlyViewed, MAX_RECENTLY_VIEWED } from '@/lib/recentlyViewed';

describe('recentlyViewed', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('records a view and returns it as the only entry', () => {
    const result = recordRecentlyViewed('p1');
    expect(result).toEqual(['p1']);
    expect(getRecentlyViewedIds()).toEqual(['p1']);
  });

  it('orders entries most-recent-first', () => {
    recordRecentlyViewed('p1');
    recordRecentlyViewed('p2');
    const result = recordRecentlyViewed('p3');
    expect(result).toEqual(['p3', 'p2', 'p1']);
  });

  it('deduplicates by moving a re-viewed property to the front', () => {
    recordRecentlyViewed('p1');
    recordRecentlyViewed('p2');
    recordRecentlyViewed('p3');
    const result = recordRecentlyViewed('p1');
    expect(result).toEqual(['p1', 'p3', 'p2']);
    // No duplicate entry for p1
    expect(result.filter((id) => id === 'p1')).toHaveLength(1);
  });

  it(`caps the list at ${MAX_RECENTLY_VIEWED} entries`, () => {
    let result: string[] = [];
    for (let i = 0; i < MAX_RECENTLY_VIEWED + 5; i += 1) {
      result = recordRecentlyViewed(`p${i}`);
    }
    expect(result).toHaveLength(MAX_RECENTLY_VIEWED);
    // Most recently viewed (last recorded) stays first, oldest entries drop off.
    expect(result[0]).toBe(`p${MAX_RECENTLY_VIEWED + 4}`);
    expect(result).not.toContain('p0');
  });

  it('returns an empty array when nothing has been viewed', () => {
    expect(getRecentlyViewedIds()).toEqual([]);
  });
});
