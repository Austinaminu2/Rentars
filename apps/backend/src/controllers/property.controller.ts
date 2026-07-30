import type { Request, Response } from 'express';
import {
  createProperty,
  deleteProperty,
  getAllProperties,
  getPropertyById,
  getPropertyBySlug,
  searchProperties,
  updateProperty,
  advancedSearch,
  duplicateProperty,
  getFeaturedProperties,
  setFeatured,
  clearFeatured,
  FEATURED_CAP,
  type AdvancedSearchFilters,
  type Property,
} from '@/services/property.service.js';
import {
  getAvailabilityRanges,
  setAvailabilityRanges,
} from '@/services/availability.service.js';
import { trackSearch, getSearchSuggestions, getTrendingSearches, trackSuggestionEvent } from '@/services/searchAnalytics.service.js';
import { computeZeroResultSuggestions, getPriceHistogram } from '@/services/propertySearch.service.js';
import { supabase } from '@/config/supabase.js';
import { redactExactCoordinates } from '@/utils/locationPrivacy.js';
import type { AuthRequest } from '@/middleware/auth.middleware.js';

// ─── Location-privacy helpers ─────────────────────────────────────────────────

/**
 * Check whether a viewer is entitled to see exact coordinates for a property.
 *
 * Returns true when the viewer is:
 *  1. The property's owner/host
 *  2. A tenant with a Confirmed booking on the property
 */
async function viewerHasExactLocationAccess(
  propertyId: string,
  ownerId: string | undefined,
  viewerUserId: string | undefined,
): Promise<boolean> {
  if (!viewerUserId) return false;
  if (ownerId && viewerUserId === ownerId) return true;

  // Check for a confirmed booking
  const { data } = await supabase
    .from('bookings')
    .select('id')
    .eq('property_id', propertyId)
    .eq('tenant_id', viewerUserId)
    .eq('status', 'Confirmed')
    .limit(1);

  return Array.isArray(data) && data.length > 0;
}

/**
 * Apply location privacy to a single property.
 * Exact coordinates are removed unless the viewer has access.
 */
async function applyLocationPrivacy(
  property: Property,
  viewerUserId: string | undefined,
): Promise<Record<string, unknown>> {
  const hasAccess = await viewerHasExactLocationAccess(
    property.id,
    property.owner_id,
    viewerUserId,
  );

  if (hasAccess) {
    return property as unknown as Record<string, unknown>;
  }

  return redactExactCoordinates(property as Property & { latitude?: number; longitude?: number }) as unknown as Record<string, unknown>;
}

/**
 * Apply location privacy to an array of properties.
 * For public list endpoints we always redact (no per-item check needed).
 */
function applyLocationPrivacyToList(properties: Property[]): Record<string, unknown>[] {
  return properties.map((p) =>
    redactExactCoordinates(p as Property & { latitude?: number; longitude?: number }) as unknown as Record<string, unknown>,
  );
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export async function getProperties(req: Request, res: Response): Promise<void> {
  const { city, country, min_price, max_price, bedrooms, min_bathrooms, property_type, status } = req.query;
  const hasFilters = city || country || min_price || max_price || bedrooms || min_bathrooms || property_type || status;

  if (hasFilters) {
    const result = await searchProperties({
      city: city as string | undefined,
      country: country as string | undefined,
      min_price: min_price ? Number(min_price) : undefined,
      max_price: max_price ? Number(max_price) : undefined,
      bedrooms: bedrooms ? Number(bedrooms) : undefined,
      min_bathrooms: min_bathrooms ? Number(min_bathrooms) : undefined,
      property_type: property_type as string | undefined,
      status: status as string | undefined,
    });

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json(applyLocationPrivacyToList(result.data));
    return;
  }

  const result = await getAllProperties();
  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  res.json(applyLocationPrivacyToList(result.data));
}

// ─── Featured ─────────────────────────────────────────────────────────────────

export async function getFeatured(_req: Request, res: Response): Promise<void> {
  const result = await getFeaturedProperties(FEATURED_CAP);
  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }
  res.json(applyLocationPrivacyToList(result.data));
}

// ─── Single property ──────────────────────────────────────────────────────────

export async function getProperty(req: Request, res: Response): Promise<void> {
  const viewerUserId = (req as AuthRequest).userId;

  const result = await getPropertyById(req.params.id);
  if (!result.success) {
    res.status(404).json({ error: result.error });
    return;
  }

  const masked = await applyLocationPrivacy(result.data, viewerUserId);
  res.json(masked);
}

/**
 * GET /api/v1/properties/by-slug/:slug
 *
 * Look up a property by its human-readable URL slug.
 * Returns the full property object (with location privacy applied).
 *
 * The frontend uses this endpoint to resolve slug-based URLs to a property,
 * and the response includes the canonical slug so the client can redirect
 * if the URL slug is stale.
 */
export async function getPropertyBySlugHandler(req: Request, res: Response): Promise<void> {
  const viewerUserId = (req as AuthRequest).userId;
  const { slug } = req.params;

  if (!slug) {
    res.status(400).json({ error: 'Slug is required' });
    return;
  }

  const result = await getPropertyBySlug(slug);
  if (!result.success) {
    res.status(404).json({ error: result.error });
    return;
  }

  const masked = await applyLocationPrivacy(result.data, viewerUserId);
  res.json(masked);
}

export async function createPropertyHandler(req: AuthRequest, res: Response): Promise<void> {
  const result = await createProperty(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  // Owner always gets exact coordinates on their own property
  res.status(201).json(result.data);
}

export async function updatePropertyHandler(req: AuthRequest, res: Response): Promise<void> {
  const result = await updateProperty(req.params.id, req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

export async function deletePropertyHandler(req: Request, res: Response): Promise<void> {
  const result = await deleteProperty(req.params.id);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(204).send();
}

// ─── Advanced Search ──────────────────────────────────────────────────────────

export async function advancedSearchHandler(req: Request, res: Response): Promise<void> {
  // Parse property_types: supports ?property_types=Apartment&property_types=House
  const rawTypes = req.query.property_types;
  const property_types: string[] | undefined = rawTypes
    ? (Array.isArray(rawTypes) ? (rawTypes as string[]) : [rawTypes as string])
    : undefined;

  // Validate property_types if provided
  const VALID_TYPES = ['Apartment','House','Villa','Condo','Studio','Room','Townhouse','Cabin','Loft','Boat'];
  if (property_types) {
    const invalid = property_types.filter((t) => !VALID_TYPES.includes(t));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid property_types: ${invalid.join(', ')}. Valid values: ${VALID_TYPES.join(', ')}` });
      return;
    }
  }

  // Validate min_bathrooms
  const min_bathrooms_raw = req.query.min_bathrooms ? Number(req.query.min_bathrooms) : undefined;
  if (min_bathrooms_raw !== undefined && (isNaN(min_bathrooms_raw) || min_bathrooms_raw < 0)) {
    res.status(400).json({ error: 'min_bathrooms must be a non-negative number' });
    return;
  }

  const filters: AdvancedSearchFilters = {
    query: req.query.q as string,
    city: req.query.city as string,
    country: req.query.country as string,
    min_price: req.query.min_price ? Number(req.query.min_price) : undefined,
    max_price: req.query.max_price ? Number(req.query.max_price) : undefined,
    bedrooms: req.query.bedrooms ? Number(req.query.bedrooms) : undefined,
    min_bathrooms: min_bathrooms_raw,
    property_types,
    guests: req.query.guests ? Number(req.query.guests) : undefined,
    amenities: req.query.amenities
      ? Array.isArray(req.query.amenities)
        ? (req.query.amenities as string[])
        : [req.query.amenities as string]
      : undefined,
    latitude: req.query.latitude ? Number(req.query.latitude) : undefined,
    longitude: req.query.longitude ? Number(req.query.longitude) : undefined,
    radius_km: req.query.radius_km ? Number(req.query.radius_km) : undefined,
    checkIn: req.query.checkIn as string,
    checkOut: req.query.checkOut as string,
    sortBy: req.query.sortBy as AdvancedSearchFilters['sortBy'],
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 20,
  };

  const result = await advancedSearch(filters);
  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  const viewerId = (req as AuthRequest).userId;
  const { data: resultData, total, page: resultPage, limit: resultLimit, hasMore } = result.data;

  await trackSearch(filters.query || '', resultData.length, viewerId, filters);

  // Compute histogram server-side (price filter excluded) — run in parallel with redaction
  const [histogramResult] = await Promise.all([
    getPriceHistogram(filters).catch(() => null),
  ]);

  // Search results are always public — redact coordinates
  const redacted = resultData.map((p) =>
    redactExactCoordinates(p as { id: string; latitude?: number; longitude?: number }) as unknown as Record<string, unknown>,
  );

  if (redacted.length === 0) {
    const suggestions = await computeZeroResultSuggestions(filters);
    if (suggestions.length > 0) {
      trackSuggestionEvent('offered', suggestions.map((s) => s.type).join(','), filters.query, viewerId).catch(() => {});
    }
    res.json({ data: redacted, count: 0, page: filters.page, histogram: histogramResult, _suggestions: suggestions });
    return;
  }

  res.json({ data: redacted, count: redacted.length, page: filters.page, histogram: histogramResult });
}

export async function searchSuggestionsHandler(req: Request, res: Response): Promise<void> {
  const prefix = req.query.q as string;
  const limit = req.query.limit ? Number(req.query.limit) : 10;

  const result = await getSearchSuggestions(prefix, limit);
  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

export async function trendingSearchesHandler(_req: Request, res: Response): Promise<void> {
  const result = await getTrendingSearches(10);
  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

/**
 * POST /api/v1/properties/search/suggestion-accepted
 *
 * Called by the UI when a user clicks a zero-result relaxed-filter suggestion.
 * Body: { suggestion_type, original_query? }
 */
export async function trackSuggestionAcceptedHandler(req: Request, res: Response): Promise<void> {
  const { suggestion_type, original_query } = req.body ?? {};
  if (!suggestion_type || typeof suggestion_type !== 'string') {
    res.status(400).json({ error: 'suggestion_type is required' });
    return;
  }
  const viewerId = (req as AuthRequest).userId;
  trackSuggestionEvent('accepted', suggestion_type, original_query, viewerId).catch(() => {});
  res.status(204).send();
}

// ─── Availability ─────────────────────────────────────────────────────────────

export async function getAvailability(req: Request, res: Response): Promise<void> {
  try {
    const ranges = await getAvailabilityRanges(req.params.id);
    res.json(ranges);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function setAvailability(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ranges = await setAvailabilityRanges(req.params.id, req.userId!, req.body.ranges);
    res.json(ranges);
  } catch (err) {
    const message = (err as Error).message;
    if (message.startsWith('Forbidden') || message === 'Property not found') {
      res.status(message.startsWith('Forbidden') ? 403 : 404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
}

// ─── Duplicate ────────────────────────────────────────────────────────────────

export async function duplicatePropertyHandler(req: AuthRequest, res: Response): Promise<void> {
  const requesterId = req.userId;
  if (!requesterId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const copyImages = req.query.copyImages === 'true';
  const result = await duplicateProperty(req.params.id, requesterId, { copyImages });

  if (!result.success) {
    const status = result.error?.startsWith('Forbidden')
      ? 403
      : result.error === 'Property not found'
        ? 404
        : 400;
    res.status(status).json({ error: result.error });
    return;
  }

  res.status(201).json(result.data);
}

// ─── Property view tracking ───────────────────────────────────────────────────

/**
 * POST /api/v1/properties/:id/view
 *
 * Records a deduplicated property view. Called by the frontend when the
 * property detail page loads.  No auth required — anonymous views are
 * tracked via a fingerprint derived from the request.
 */
export async function recordViewHandler(req: Request, res: Response): Promise<void> {
  const userAgent = req.headers['user-agent'];

  // Silently succeed for bots — no need to return an error
  if (isBot(userAgent)) {
    res.status(204).send();
    return;
  }

  const authUser = (req as Request & { user?: { id: string } }).user;
  const userId   = authUser?.id;

  // Anonymous fingerprint: hash of IP + UA (no PII stored directly)
  const ip  = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
              ?? req.socket?.remoteAddress
              ?? 'unknown';
  const fingerprint = !userId
    ? crypto.createHash('sha256').update(`${ip}:${userAgent ?? ''}`).digest('hex').slice(0, 16)
    : undefined;

  // ipHash stored for analytics — hash the IP separately
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);

  const result = await recordPropertyView({
    propertyId:  req.params.id,
    userId,
    fingerprint,
    userAgent,
    ipHash,
  });

  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  res.status(204).send();
}

/**
 * GET /api/v1/properties/:id/views
 *
 * Returns the view count and daily breakdown for the property.
 * Only accessible by the property's owner (host).
 */
export async function getViewStatsHandler(req: Request, res: Response): Promise<void> {
  const authUser = (req as Request & { user?: { id: string } }).user;
  if (!authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Ownership check
  const propResult = await getPropertyById(req.params.id);
  if (!propResult.success || !propResult.data) {
    res.status(404).json({ error: 'Property not found' });
    return;
  }
  if (propResult.data.owner_id !== authUser.id) {
    res.status(403).json({ error: 'Forbidden: only the property owner can view stats' });
    return;
  }

  const days   = req.query.days ? Number(req.query.days) : 30;
  const result = await getPropertyViewStats(req.params.id, days);

  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  // Also include the denormalized total from the property row
  const countResult = await getPropertyViewCount(req.params.id);
  const totalFromProperty = countResult.success ? countResult.data?.viewCount : undefined;

  res.json({ ...result.data, totalFromProperty });
}

// ─── Occupancy heatmap ────────────────────────────────────────────────────────

import { getOccupancyHeatmap } from '@/services/occupancy.service.js';

/**
 * GET /api/v1/properties/:id/occupancy-heatmap
 *
 * Returns daily booked/blocked/available status over a selectable horizon.
 * Host-only: only the property owner may call this.
 *
 * Query params:
 *   from  - ISO date (YYYY-MM-DD), defaults to today
 *   to    - ISO date (YYYY-MM-DD), defaults to 3 months from today
 */
export async function getOccupancyHeatmapHandler(req: Request, res: Response): Promise<void> {
  const authUser = (req as Request & { user?: { id: string } }).user;
  if (!authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Ownership check
  const propResult = await getPropertyById(req.params.id);
  if (!propResult.success || !propResult.data) {
    res.status(404).json({ error: 'Property not found' });
    return;
  }
  if (propResult.data.owner_id !== authUser.id) {
    res.status(403).json({ error: 'Forbidden: only the property owner can view occupancy data' });
    return;
  }

  // Default horizon: today → +90 days
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultTo = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 90);
    return d.toISOString().slice(0, 10);
  })();

  const from = (req.query.from as string | undefined) ?? todayStr;
  const to   = (req.query.to   as string | undefined) ?? defaultTo;

  const result = await getOccupancyHeatmap(req.params.id, from, to);

  if (!result.success) {
    const status = result.error?.includes('required') || result.error?.includes('Invalid') ? 422 : 500;
    res.status(status).json({ error: result.error });
    return;
  }

  res.json(result.data);
}
