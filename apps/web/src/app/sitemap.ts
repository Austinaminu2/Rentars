import type { MetadataRoute } from 'next';
import { propertyPath } from '@/types/property';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

// Google's sitemap protocol caps a single file at 50,000 URLs. We stay well
// under that so the file never breaches the limit, even for large inventories.
const MAX_ENTRIES = 45000;

const STATIC_ROUTES = ['/', '/search', '/list', '/login', '/register'];

type PropertyRow = {
  id: string;
  slug?: string;
  status?: string;
  updated_at?: string;
};

/**
 * Public, non-draft property rows from the backend.
 * Draft listings are unpublished and must never be indexed.
 */
export async function getPublicProperties(): Promise<PropertyRow[]> {
  const res = await fetch(`${API_URL}/api/v1/properties`, { cache: 'no-store' });
  if (!res.ok) return [];

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];

  return (data as PropertyRow[]).filter((p) => p?.id && p.status !== 'draft');
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${siteUrl}${route}`,
  }));

  const properties = await getPublicProperties();
  const propertyEntries: MetadataRoute.Sitemap = properties
    .slice(0, Math.max(0, MAX_ENTRIES - staticEntries.length))
    .map((p) => ({
      url: `${siteUrl}${propertyPath(p)}`,
      ...(p.updated_at ? { lastModified: p.updated_at } : {}),
    }));

  return [...staticEntries, ...propertyEntries];
}
