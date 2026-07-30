/**
 * Property detail page — handles both slug-based and UUID-based URLs.
 *
 * URL patterns accepted:
 *   /property/cozy-loft-downtown-paris-a1b2c3   ← canonical slug URL
 *   /property/a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ← legacy UUID URL (redirected)
 *
 * Canonicalization logic:
 *   1. Try to fetch the property by the segment value as a slug.
 *   2. If that 404s, fall back to fetching by UUID (legacy links).
 *   3. Once the property is found, if the URL segment does not exactly match
 *      the property's canonical slug → 301 redirect to the slug URL.
 *   4. The <link rel="canonical"> always points to the slug URL.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PropertyDetail from '@/components/features/properties/PropertyDetail';
import type { Property } from '@/types/property';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Static 1200×630 placeholder used for OG/Twitter previews and JSON-LD image
// when a property has no photos of its own.
const FALLBACK_OG_IMAGE = '/og-fallback.svg';

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
}

/** Guarantees an absolute URL so social crawlers (which don't resolve relative paths) can fetch the image. */
function toAbsoluteUrl(url: string | undefined, siteUrl: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Strips markup and truncates on a word boundary so meta descriptions stay within crawler limits. */
function sanitizeDescription(text: string, maxLength = 140): string {
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

type FullProperty = Property & {
  amenities?: string[];
  description_full?: string;
  host_name?: string;
  host_id?: string;
  host_image?: string;
  reviews?: Array<{ id: string; author: string; rating: number; comment: string; date: string }>;
  average_rating?: number;
  review_count?: number;
  blocked_dates?: string[];
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
  address?: string;
  // House rules
  pets_allowed?: boolean;
  smoking_allowed?: boolean;
  events_allowed?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  additional_rules?: string | null;
};

/**
 * Resolve a URL segment to a property.
 *
 * Strategy:
 *  1. Try the segment as a slug (GET /api/v1/properties/by-slug/:slug).
 *  2. If that fails, try as a UUID (GET /api/v1/properties/:id).
 *
 * Returns null if neither lookup succeeds.
 */
async function resolveProperty(segment: string): Promise<FullProperty | null> {
  // Attempt slug lookup first
  const slugRes = await fetch(
    `${API_URL}/api/v1/properties/by-slug/${encodeURIComponent(segment)}`,
    { cache: 'no-store' },
  );
  if (slugRes.ok) {
    return (await slugRes.json()) as FullProperty;
  }

  // Fallback: UUID lookup (legacy links / direct id references)
  const idRes = await fetch(
    `${API_URL}/api/v1/properties/${encodeURIComponent(segment)}`,
    { cache: 'no-store' },
  );
  if (idRes.ok) {
    return (await idRes.json()) as FullProperty;
  }

  return null;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const property = await resolveProperty(params.id);
  const siteUrl  = getSiteUrl();

  // Canonical URL always uses the slug when available
  const canonicalSlug = property?.slug ?? params.id;
  const canonicalUrl  = `${siteUrl}/property/${canonicalSlug}`;

  const title = property
    ? `${property.title}${property.location ? ` in ${property.location}` : ''} — Rentars`
    : 'Property — Rentars';

  const rawDescription =
    property?.description_full || property?.description || 'Book your stay on Rentars.';
  const priceLine =
    typeof property?.price_per_night === 'number' ? `$${property.price_per_night}/night` : undefined;
  const description = [sanitizeDescription(rawDescription), priceLine].filter(Boolean).join(' · ');

  const ogImage = property?.images?.[0]?.url ?? undefined;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PropertyPage({
  params,
}: {
  params: { id: string };
}) {
  const property = await resolveProperty(params.id);

  if (!property) {
    return <div className="p-8 text-center">Property not found</div>;
  }

  const siteUrl = getSiteUrl();
  const canonicalSlug = property.slug ?? property.id;

  // ── Canonical redirect ──────────────────────────────────────────────────────
  // If the URL segment is a UUID or a stale slug, redirect 301 to the canonical
  // slug URL.  This keeps search engine equity on a single URL.
  if (params.id !== canonicalSlug) {
    redirect(`/property/${canonicalSlug}`);
  }

  const canonicalUrl = `${siteUrl}/property/${canonicalSlug}`;

  // ── JSON-LD structured data ─────────────────────────────────────────────────
  const images =
    property.images && property.images.length > 0
      ? property.images.map((img) => toAbsoluteUrl(img, siteUrl))
      : [`${siteUrl}${FALLBACK_OG_IMAGE}`];

  const reviewCount = property.review_count ?? property.reviews?.length ?? 0;

  const ldJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type':    'LodgingBusiness',
    name:        property.title,
    description: property.description_full || property.description || 'Accommodation on Rentars',
    image:       property.images?.[0]?.url,
    url:         canonicalUrl,
    address: {
      '@type':          'PostalAddress',
      streetAddress:    property.address,
      addressLocality:  property.city || property.location,
      addressCountry:   property.country,
    },
    ...(typeof property.latitude === 'number' && typeof property.longitude === 'number'
      ? {
          geo: {
            '@type':    'GeoCoordinates',
            latitude:   property.latitude,
            longitude:  property.longitude,
          },
        }
      : {}),
    ...(typeof property.price_per_night === 'number'
      ? {
          priceRange: `$${property.price_per_night}`,
          offers: {
            '@type':        'Offer',
            price:          property.price_per_night,
            priceCurrency:  'USD',
            availability:
              property.available === false
                ? 'https://schema.org/SoldOut'
                : 'https://schema.org/InStock',
            url: canonicalUrl,
          },
        }
      : {}),
    ...(typeof property.average_rating === 'number' && reviewCount > 0
      ? {
          aggregateRating: {
            '@type':     'AggregateRating',
            ratingValue: property.average_rating,
            reviewCount,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJsonLd) }}
      />
      <PropertyDetail property={property} />
    </>
  );
}
