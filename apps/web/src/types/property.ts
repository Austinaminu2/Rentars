export interface PropertyImage {
  id: string;
  url: string;
  is_primary?: boolean;
  display_order?: number;
}

export interface Property {
  id: string;
  title: string;
  description: string;
  price_per_night: number;
  location: string;
  images: PropertyImage[];
  owner_id: string;
  available: boolean;
  created_at: string;

  // Capacity
  max_guests?: number;

  // Map search support
  lat?: number;
  lng?: number;

  // Featured listing window (migration 00022).
  // A property is currently featured when featured_until is a future datetime.
  // The backend also surfaces is_featured: true on search results so the
  // frontend never needs to parse the timestamp itself.
  featured_until?: string | null;
  is_featured?: boolean;

  // Human-readable URL slug (migration 00024).
  // Format: <title>-<city>-<6-char-id-prefix>
  slug?: string;
}

/**
 * Build the canonical URL path for a property.
 *
 * Prefer the slug when available (SEO-friendly), fall back to the UUID
 * for backwards-compatibility with properties that pre-date migration 00024.
 *
 * @example
 *   propertyPath({ id: 'abc', slug: 'cozy-loft-paris-a1b2c3' })
 *   // → '/property/cozy-loft-paris-a1b2c3'
 *
 *   propertyPath({ id: 'abc' })
 *   // → '/property/abc'
 */
export function propertyPath(property: Pick<Property, 'id' | 'slug'>): string {
  return `/property/${property.slug ?? property.id}`;
}
