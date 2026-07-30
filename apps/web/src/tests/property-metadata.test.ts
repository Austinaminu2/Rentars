import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateMetadata } from '@/app/property/[id]/page';

const originalFetch = global.fetch;

function mockPropertyFetch(property: unknown) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/by-slug/')) {
      return Promise.resolve({ ok: true, json: async () => property });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  }) as unknown as typeof fetch;
}

const baseProperty = {
  id: 'prop-1',
  slug: 'cozy-loft-paris-a1b2c3',
  title: 'Cozy Loft',
  description: 'A lovely place to stay in the heart of the city.',
  price_per_night: 120,
  location: 'Paris, France',
  images: ['https://images.unsplash.com/photo-1.jpg'],
  owner_id: 'owner-1',
  available: true,
  created_at: new Date().toISOString(),
};

describe('generateMetadata (property page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes title, location, price, and an absolute image URL', async () => {
    mockPropertyFetch(baseProperty);
    const metadata = await generateMetadata({ params: { id: 'cozy-loft-paris-a1b2c3' } });

    expect(metadata.title).toContain('Cozy Loft');
    expect(metadata.title).toContain('Paris, France');
    expect(metadata.description).toContain('$120/night');
    expect(metadata.openGraph?.images?.[0]).toMatchObject({
      url: 'https://images.unsplash.com/photo-1.jpg',
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: ['https://images.unsplash.com/photo-1.jpg'],
    });
  });

  it('falls back to a site-relative absolute placeholder image when there are no photos', async () => {
    mockPropertyFetch({ ...baseProperty, images: [] });
    const metadata = await generateMetadata({ params: { id: 'cozy-loft-paris-a1b2c3' } });

    const ogImage = metadata.openGraph?.images?.[0] as { url: string };
    expect(ogImage.url).toMatch(/^https?:\/\/.*\/og-fallback\.svg$/);
  });

  it('sanitizes and truncates an overly long or markup-laden description', async () => {
    mockPropertyFetch({
      ...baseProperty,
      description_full: `<p>${'Lorem ipsum dolor sit amet. '.repeat(20)}</p>`,
    });
    const metadata = await generateMetadata({ params: { id: 'cozy-loft-paris-a1b2c3' } });

    expect(metadata.description).not.toContain('<p>');
    expect((metadata.description as string).length).toBeLessThan(200);
  });
});
