const STORAGE_KEY = 'rentars:recently-viewed';

/** Most-recent-first, deduplicated list capped at this many entries. */
export const MAX_RECENTLY_VIEWED = 10;

function readIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private browsing, quota exceeded, etc.) — ignore.
  }
}

export function getRecentlyViewedIds(): string[] {
  return readIds();
}

/**
 * Records a property view, moving it to the front of the list.
 * Returns the updated, deduplicated, capped, most-recent-first id list.
 */
export function recordRecentlyViewed(propertyId: string): string[] {
  const deduped = readIds().filter((id) => id !== propertyId);
  const updated = [propertyId, ...deduped].slice(0, MAX_RECENTLY_VIEWED);
  writeIds(updated);
  return updated;
}
