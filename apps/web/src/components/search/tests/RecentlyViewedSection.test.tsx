import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/tests/utils/test-utils';
import RecentlyViewedSection from '../RecentlyViewedSection';
import { recordRecentlyViewed } from '@/lib/recentlyViewed';

const originalFetch = global.fetch;

function propertyFixture(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Property ${id}`,
    description: 'A place to stay',
    price_per_night: 100,
    location: 'Somewhere',
    images: ['https://example.com/img.jpg'],
    owner_id: 'owner-1',
    available: true,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('RecentlyViewedSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders nothing when no properties have been viewed', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<RecentlyViewedSection />);
    expect(screen.queryByTestId('recently-viewed-section')).toBeNull();
  });

  it('renders viewed properties most-recent-first', async () => {
    recordRecentlyViewed('p1');
    recordRecentlyViewed('p2');

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const id = String(url).split('/').pop();
      return Promise.resolve({ ok: true, json: async () => propertyFixture(id!) });
    }) as unknown as typeof fetch;

    render(<RecentlyViewedSection />);

    await waitFor(() => expect(screen.getByTestId('recently-viewed-section')).toBeInTheDocument());
    const titles = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(titles).toEqual(['Property p2', 'Property p1']);
  });

  it('skips properties that are drafts or fail to load (deleted)', async () => {
    recordRecentlyViewed('deleted');
    recordRecentlyViewed('draft');
    recordRecentlyViewed('available');

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const id = String(url).split('/').pop();
      if (id === 'deleted') return Promise.resolve({ ok: false, json: async () => ({}) });
      if (id === 'draft') return Promise.resolve({ ok: true, json: async () => propertyFixture(id, { status: 'draft' }) });
      return Promise.resolve({ ok: true, json: async () => propertyFixture(id!) });
    }) as unknown as typeof fetch;

    render(<RecentlyViewedSection />);

    await waitFor(() => expect(screen.getByTestId('recently-viewed-section')).toBeInTheDocument());
    expect(screen.getByText('Property available')).toBeInTheDocument();
    expect(screen.queryByText('Property draft')).toBeNull();
    expect(screen.queryByText('Property deleted')).toBeNull();
  });
});
