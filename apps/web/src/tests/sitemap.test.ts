import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';

const originalFetch = global.fetch;

function mockProperties(properties: unknown[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => properties,
  }) as unknown as typeof fetch;
}

describe('sitemap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes static routes', async () => {
    mockProperties([]);
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('http://localhost:3000/');
    expect(urls).toContain('http://localhost:3000/search');
  });

  it('includes public properties with their slug and lastModified', async () => {
    mockProperties([
      { id: 'p1', slug: 'cozy-loft-paris-a1b2c3', status: 'available', updated_at: '2026-01-01T00:00:00.000Z' },
    ]);
    const entries = await sitemap();
    const propertyEntry = entries.find((e) => e.url.includes('cozy-loft-paris-a1b2c3'));
    expect(propertyEntry).toBeDefined();
    expect(propertyEntry?.url).toBe('http://localhost:3000/property/cozy-loft-paris-a1b2c3');
    expect(propertyEntry?.lastModified).toBe('2026-01-01T00:00:00.000Z');
  });

  it('excludes draft (unpublished) properties', async () => {
    mockProperties([
      { id: 'p1', slug: 'published-listing', status: 'available' },
      { id: 'p2', slug: 'unpublished-listing', status: 'draft' },
    ]);
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.includes('published-listing'))).toBe(true);
    expect(urls.some((u) => u.includes('unpublished-listing'))).toBe(false);
  });

  it('falls back to id when a property has no slug', async () => {
    mockProperties([{ id: 'legacy-id-123', status: 'available' }]);
    const entries = await sitemap();
    expect(entries.some((e) => e.url.endsWith('/property/legacy-id-123'))).toBe(true);
  });

  it('returns only static routes when the backend request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const entries = await sitemap();
    expect(entries.every((e) => !e.url.includes('/property/'))).toBe(true);
  });
});

describe('robots', () => {
  it('disallows private routes and references the sitemap', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.disallow).toEqual(
      expect.arrayContaining(['/dashboard', '/dashboard/*', '/login', '/register']),
    );
    expect(result.sitemap).toBe('http://localhost:3000/sitemap.xml');
  });
});
