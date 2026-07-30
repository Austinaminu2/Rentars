import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { LocationService } from '../../src/services/location.service.js';
import * as cache from '../../src/services/cache.service.js';

const mockCacheGet = mock(async <T>(_key: string): Promise<T | null> => null);
const mockCacheSet = mock(async (_key: string, _value: unknown, _ttlSeconds: number) => {});
const mockCacheDel = mock(async (_key: string) => {});

(cache as any).get = mockCacheGet;
(cache as any).set = mockCacheSet;
(cache as any).del = mockCacheDel;

const mockFetch = mock(async (_url: string) => {
  return new Response(JSON.stringify([{ lat: '40.7128', lon: '-74.0060', display_name: 'New York, NY' }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

(global as any).fetch = mockFetch;

describe('LocationService geocode caching', () => {
  beforeEach(() => {
    mockCacheGet.mockClear();
    mockCacheSet.mockClear();
    mockFetch.mockClear();
  });

  it('caches geocode results on first call', async () => {
    const service = new LocationService();
    const result = await service.geocode('New York, NY');
    expect(result.success).toBe(true);
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it('returns cached result on second call', async () => {
    mockCacheGet.mockResolvedValueOnce({ latitude: 40.7128, longitude: -74.006, address: 'New York, NY' });
    const service = new LocationService();
    const result = await service.geocode('New York, NY');
    expect(result.success).toBe(true);
    expect(result.data?.address).toBe('New York, NY');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
