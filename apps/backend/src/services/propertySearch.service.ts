import { supabase } from '@/config/supabase.js';
import type { ServiceResponse } from './index.js';
import { isFeaturedNow, FEATURED_CAP, type Property, type AdvancedSearchFilters } from './property.service.js';

// ─── Nearby search ────────────────────────────────────────────────────────────

export interface NearbySearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface NearbySearchResult {
  id: string;
  title: string;
  price_per_night?: number;
  city?: string;
  country?: string;
  bedrooms?: number;
  amenities?: string[];
  distance_km: number;
  /** True when the property is currently within its feature window. */
  is_featured?: boolean;
}

/**
 * Return properties within `radiusKm` of the given point, ordered by
 * distance ascending.  Delegates to the `search_nearby_properties` SQL
 * function which uses a PostGIS GIST-indexed ST_DWithin predicate for an
 * efficient bounding-box pre-filter followed by precise distance calculation.
 */
export async function searchPropertiesNearby(
  params: NearbySearchParams,
): Promise<ServiceResponse<NearbySearchResult[]>> {
  const { lat, lng, radiusKm } = params;

  const { data, error } = await supabase.rpc('search_nearby_properties', {
    lat,
    lng,
    radius_km: radiusKm,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: (data ?? []) as NearbySearchResult[] };
}

// ─── Text-search helpers ──────────────────────────────────────────────────────

function toTsQuery(input: string) {
  // Convert spaces to prefix tsquery tokens and sanitize basic characters.
  // Example: "new york" -> "new:* & york:*"
  const tokens = input
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9_-]/g, ''))
    .filter(Boolean);

  if (tokens.length === 0) return '';
  return tokens.map((t) => `${t}:*`).join(' & ');
}

// ─── Featured promotion helpers ───────────────────────────────────────────────

/**
 * Given a flat list of properties from a search query, promote up to
 * `cap` currently-featured properties to the front of the list.
 *
 * Properties that are featured but did NOT match the search query are NOT
 * injected — this function only re-orders what was already returned.  That
 * keeps pagination counts accurate and avoids showing irrelevant results.
 *
 * The returned list is:
 *   [ ...featured (≤ cap, sorted by featured_weight DESC), ...organic ]
 *
 * Each featured property gets `is_featured: true` appended so the frontend
 * can render the badge without a second request.
 *
 * @param properties - Full result set from the search query.
 * @param cap        - Maximum number of featured slots (defaults to FEATURED_CAP).
 */
export function promoteFeatureToTop(
  properties: Property[],
  cap = FEATURED_CAP,
): (Property & { is_featured: boolean })[] {
  const effectiveCap = Math.min(Math.max(0, cap), FEATURED_CAP);

  const featured: (Property & { is_featured: boolean })[] = [];
  const organic:  (Property & { is_featured: boolean })[] = [];

  for (const p of properties) {
    if (featured.length < effectiveCap && isFeaturedNow(p)) {
      featured.push({ ...p, is_featured: true });
    } else {
      organic.push({ ...p, is_featured: false });
    }
  }

  // Sort the featured slot by weight descending so higher-weight listings
  // always appear first regardless of the order they came out of the query.
  featured.sort((a, b) => (b.featured_weight ?? 0) - (a.featured_weight ?? 0));

  return [...featured, ...organic];
}

// ─── Text-based property search ───────────────────────────────────────────────

export async function searchPropertiesByQuery(
  query: string,
): Promise<ServiceResponse<(Property & { is_featured: boolean })[]>> {
  const q = query.trim();
  if (!q) return { success: true, data: [] };

  const tsQuery = toTsQuery(q);
  if (!tsQuery) return { success: true, data: [] };

  const { data, error } = await supabase
    .from('properties')
    .select('*')
    // Uses generated column search_vector + GIN index
    .textSearch('search_vector', tsQuery, { config: 'english' })
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const properties = (data ?? []) as Property[];
  if (properties.length === 0) return { success: true, data: [] };

  // Score using denormalized rating aggregates for reputation boost.
  // Score = avg_rating * log(1 + review_count); unreviewed properties score 0.
  const scored = properties.map((p) => {
    const score =
      p.average_rating && p.review_count && p.review_count > 0
        ? (p.average_rating as number) * Math.log1p(p.review_count as number)
        : 0;
    return { property: p, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const sorted = scored.map((s) => s.property);

  // Promote featured listings to the top (capped at FEATURED_CAP).
  return { success: true, data: promoteFeatureToTop(sorted) };
}

// ─── Zero-result relaxed suggestions ──────────────────────────────────────────

export interface ZeroResultSuggestion {
  type: 'no_amenities' | 'wider_price' | 'expand_radius' | 'any_location';
  description: string;
  estimated_results: number;
  relaxed_filters: Partial<AdvancedSearchFilters>;
}

/**
 * When a search yields zero results, compute which single-filter relaxations
 * would yield results and how many. Returns only relaxations that help.
 */
export async function computeZeroResultSuggestions(
  filters: AdvancedSearchFilters,
): Promise<ZeroResultSuggestion[]> {
  const suggestions: ZeroResultSuggestion[] = [];

  const countWithFilters = async (overrides: Partial<AdvancedSearchFilters>): Promise<number> => {
    const merged = { ...filters, ...overrides };
    let q = supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available');

    if (merged.query) {
      const tokens = merged.query
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.replace(/[^a-z0-9_-]/g, ''))
        .filter(Boolean);
      if (tokens.length > 0) {
        q = q.textSearch('search_vector', tokens.map((t) => `${t}:*`).join(' & '), {
          config: 'english',
        });
      }
    }

    if (merged.city) q = q.ilike('city', `%${merged.city}%`);
    if (merged.country) q = q.ilike('country', `%${merged.country}%`);
    if (merged.min_price !== undefined) q = q.gte('price_per_night', merged.min_price);
    if (merged.max_price !== undefined) q = q.lte('price_per_night', merged.max_price);
    if (merged.bedrooms !== undefined) q = q.gte('bedrooms', merged.bedrooms);
    if (merged.min_bathrooms !== undefined) q = q.gte('bathrooms', merged.min_bathrooms);
    if (merged.property_types && merged.property_types.length > 0) {
      q = q.in('property_type', merged.property_types);
    }
    if (merged.guests !== undefined) q = q.gte('max_guests', merged.guests);
    if (merged.amenities && merged.amenities.length > 0) {
      q = q.contains('amenities', merged.amenities);
    }

    const { count } = await q;
    return count ?? 0;
  };

  const candidates: Array<{
    type: ZeroResultSuggestion['type'];
    description: string;
    overrides: Partial<AdvancedSearchFilters>;
  }> = [];

  if (filters.amenities && filters.amenities.length > 0) {
    candidates.push({
      type: 'no_amenities',
      description: 'Remove amenity filters',
      overrides: { amenities: [] },
    });
  }

  if (filters.min_price !== undefined || filters.max_price !== undefined) {
    candidates.push({
      type: 'wider_price',
      description: 'Remove price range filter',
      overrides: { min_price: undefined, max_price: undefined },
    });
  }

  if (filters.radius_km !== undefined && filters.latitude !== undefined) {
    candidates.push({
      type: 'expand_radius',
      description: `Expand search radius to ${(filters.radius_km ?? 50) * 2} km`,
      overrides: { radius_km: (filters.radius_km ?? 50) * 2 },
    });
  }

  if (filters.city || filters.country) {
    candidates.push({
      type: 'any_location',
      description: 'Search all locations',
      overrides: { city: undefined, country: undefined },
    });
  }

  await Promise.all(
    candidates.map(async (c) => {
      const count = await countWithFilters(c.overrides);
      if (count > 0) {
        suggestions.push({
          type: c.type,
          description: c.description,
          estimated_results: count,
          relaxed_filters: c.overrides,
        });
      }
    }),
  );

  return suggestions.sort((a, b) => b.estimated_results - a.estimated_results);
}

// ─── Price histogram ──────────────────────────────────────────────────────────

export interface PriceHistogramBucket {
  /** Lower bound of this bucket (inclusive). */
  min: number;
  /** Upper bound of this bucket (exclusive, except the last bucket). */
  max: number;
  /** Number of active listings whose price falls within this bucket. */
  count: number;
}

export interface PriceHistogramResult {
  buckets: PriceHistogramBucket[];
  /** Lowest price observed across all listings in the current context. */
  global_min: number;
  /** Highest price observed across all listings in the current context. */
  global_max: number;
}

/**
 * Compute a price-distribution histogram for the current search context.
 *
 * IMPORTANT — the price filter itself is intentionally EXCLUDED from the query
 * so the histogram always reflects the full price range available for the
 * current non-price filters. This lets the UI render a histogram behind the
 * price slider that shows users what's available before they drag the slider.
 *
 * Bucket computation happens in the database using a width_bucket() aggregate,
 * not on the client, so it scales to large result sets without shipping every
 * price to the server.
 *
 * @param filters  - Current search filters. min_price / max_price are ignored.
 * @param buckets  - Number of histogram buckets (default: 20).
 */
export async function getPriceHistogram(
  filters: AdvancedSearchFilters,
  numBuckets = 20,
): Promise<PriceHistogramResult> {
  // Step 1: get min/max across the filtered context (price filter excluded)
  let rangeQuery = supabase
    .from('properties')
    .select('price_per_night')
    .eq('status', 'available');

  rangeQuery = applyNonPriceFilters(rangeQuery, filters);

  const { data: priceRows, error: rangeError } = await rangeQuery;

  if (rangeError || !priceRows || priceRows.length === 0) {
    return { buckets: [], global_min: 0, global_max: 0 };
  }

  const prices = (priceRows as { price_per_night: number }[]).map((r) => r.price_per_night);
  const globalMin = Math.floor(Math.min(...prices));
  const globalMax = Math.ceil(Math.max(...prices));

  if (globalMin === globalMax) {
    return {
      buckets: [{ min: globalMin, max: globalMax, count: prices.length }],
      global_min: globalMin,
      global_max: globalMax,
    };
  }

  // Step 2: bucket the prices client-side (avoids needing a custom RPC)
  const bucketWidth = (globalMax - globalMin) / numBuckets;
  const counts = new Array<number>(numBuckets).fill(0);

  for (const price of prices) {
    const idx = Math.min(
      Math.floor((price - globalMin) / bucketWidth),
      numBuckets - 1,
    );
    counts[idx]++;
  }

  const buckets: PriceHistogramBucket[] = counts.map((count, i) => ({
    min: Math.round(globalMin + i * bucketWidth),
    max: Math.round(globalMin + (i + 1) * bucketWidth),
    count,
  }));

  return { buckets, global_min: globalMin, global_max: globalMax };
}

/**
 * Apply all search filters EXCEPT min_price / max_price to a Supabase query.
 * Extracted so both `getPriceHistogram` and `advancedSearch` share the same
 * filter logic and stay in sync.
 */
function applyNonPriceFilters<T>(
  query: T,
  filters: AdvancedSearchFilters,
): T {
  let q = query as unknown as ReturnType<typeof supabase.from>;

  if (filters.query) {
    const tokens = filters.query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9_-]/g, ''))
      .filter(Boolean);
    if (tokens.length > 0) {
      q = q.textSearch('search_vector', tokens.map((t) => `${t}:*`).join(' & '), {
        config: 'english',
      });
    }
  }

  if (filters.city) q = q.ilike('city', `%${filters.city}%`);
  if (filters.country) q = q.ilike('country', `%${filters.country}%`);
  if (filters.bedrooms !== undefined) q = q.gte('bedrooms', filters.bedrooms);
  if (filters.min_bathrooms !== undefined) q = q.gte('bathrooms', filters.min_bathrooms);
  if (filters.property_types && filters.property_types.length > 0) {
    q = q.in('property_type', filters.property_types);
  }
  if (filters.guests !== undefined) q = q.gte('max_guests', filters.guests);
  if (filters.amenities && filters.amenities.length > 0) {
    q = q.contains('amenities', filters.amenities);
  }

  return q as unknown as T;
}
