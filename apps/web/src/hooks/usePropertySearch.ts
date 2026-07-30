import { useState, useCallback, useEffect, useRef } from 'react';
import type { LatLngBounds } from 'leaflet';
import type { FilterState } from '@/components/search/FilterSidebar';
import type { PriceHistogramResult } from '@/types/search';

export interface SearchResult {
  id: string;
  title: string;
  price_per_night?: number;
  city?: string;
  country?: string;
  bedrooms?: number;
  bathrooms?: number;
  property_type?: string;
  amenities?: string[];
  images?: string[];
  slug?: string;
  distance_km?: number;
  rating?: number;
  is_featured?: boolean;
  created_at?: string;
}

export interface ZeroResultSuggestion {
  type: 'no_amenities' | 'wider_price' | 'expand_radius' | 'any_location';
  description: string;
  estimated_results: number;
  relaxed_filters: Partial<FilterState>;
}

export interface SearchPage {
  data: SearchResult[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface UseSearchOptions {
  debounceMs?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export function usePropertySearch(options: UseSearchOptions = {}) {
  const { debounceMs = 300 } = options;
  const [results, setResults]                           = useState<SearchResult[]>([]);
  const [loading, setLoading]                           = useState(false);
  const [error, setError]                               = useState<string | null>(null);
  const [suggestions, setSuggestions]                   = useState<string[]>([]);
  const [zeroResultSuggestions, setZeroResultSuggestions] = useState<ZeroResultSuggestion[]>([]);
  const [histogram, setHistogram]                       = useState<PriceHistogramResult | null>(null);
  const [page, setPage]                                 = useState(1);

  const abortControllerRef  = useRef<AbortController | null>(null);
  const debounceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef        = useRef<string>('');

  // ── Build URLSearchParams from filters ──────────────────────────────────────

  function buildParams(query: string, filters: Partial<FilterState>, pageNum: number): URLSearchParams {
    const params = new URLSearchParams();
    if (query)                                  params.append('q', query);
    if (filters.priceMin !== undefined)         params.append('min_price', String(filters.priceMin));
    if (filters.priceMax !== undefined)         params.append('max_price', String(filters.priceMax));
    if (filters.guests !== undefined)           params.append('guests', String(filters.guests));
    if (filters.bedrooms !== undefined)         params.append('bedrooms', String(filters.bedrooms));
    if (filters.minBathrooms !== undefined)     params.append('min_bathrooms', String(filters.minBathrooms));
    if (filters.propertyType)                  params.append('property_types', filters.propertyType);
    if (filters.sortBy)                         params.append('sortBy', filters.sortBy);
    if (filters.amenities?.length)              filters.amenities.forEach((a) => params.append('amenities', a));
    if (filters.checkIn)                        params.append('checkIn', filters.checkIn);
    if (filters.checkOut)                       params.append('checkOut', filters.checkOut);
    params.append('page', String(pageNum));
    params.append('limit', '20');
    return params;
  }

  // ── Advanced search ─────────────────────────────────────────────────────────

  const abortRef      = useRef<AbortController | null>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef  = useRef<string>('');
  const lastFiltersRef = useRef<Partial<FilterState>>({});

  // ── Core search ────────────────────────────────────────────────────────────
  const search = useCallback(
    async (query: string, filters: Partial<FilterState> = {}, pageNum = 1) => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);
      lastQueryRef.current   = query;
      lastFiltersRef.current = filters;

      try {
        const params = buildParams(query, filters, pageNum);

        const response = await fetch(`/api/v1/properties/search/advanced?${params}`, {
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        setResults(data.data ?? []);
        setPage(pageNum);
        setZeroResultSuggestions(data._suggestions ?? []);
        setHistogram(data.histogram ?? null);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Search error');
        setResults([]);
        setTotal(0);
        setHasMore(false);
        setZeroResultSuggestions([]);
        setHistogram(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ── Map bounds search ───────────────────────────────────────────────────────

  // ── Map viewport search ────────────────────────────────────────────────────
  const searchByBounds = useCallback(
    (bounds: LatLngBounds, filters: Partial<FilterState> = {}) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(async () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        setLoading(true);
        setError(null);

        try {
          const params = new URLSearchParams();
          params.append('north', String(bounds.getNorth()));
          params.append('south', String(bounds.getSouth()));
          params.append('east',  String(bounds.getEast()));
          params.append('west',  String(bounds.getWest()));
          if (filters.priceMin !== undefined)     params.append('min_price', String(filters.priceMin));
          if (filters.priceMax !== undefined)     params.append('max_price', String(filters.priceMax));
          if (filters.guests !== undefined)       params.append('guests', String(filters.guests));
          if (filters.bedrooms !== undefined)     params.append('bedrooms', String(filters.bedrooms));
          if (filters.minBathrooms !== undefined) params.append('min_bathrooms', String(filters.minBathrooms));
          if (filters.propertyType)              params.append('property_types', filters.propertyType);
          if (filters.sortBy)                     params.append('sortBy', filters.sortBy);
          if (filters.amenities?.length)          filters.amenities.forEach((a) => params.append('amenities', a));
          params.append('limit', '100');

          const response = await fetch(`/api/v1/properties/search/bounds?${params}`, {
            signal: abortControllerRef.current.signal,
          });

          if (!response.ok) throw new Error('Search failed');

          const data = await response.json();
          setResults(data.data ?? []);
          setPage(1);
          setHasMore(false);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Search error');
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, debounceMs);
    },
    [debounceMs],
  );

  // ── Autocomplete suggestions ────────────────────────────────────────────────

  const getSuggestions = useCallback(async (prefix: string) => {
    if (prefix.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/v1/properties/search/suggestions?q=${encodeURIComponent(prefix)}&limit=5`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuggestions(data.map((item: { query: string }) => item.query));
    } catch {
      setSuggestions([]);
    }
  }, []);

  // ── Trending ────────────────────────────────────────────────────────────────

  const getTrending = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/properties/search/trending');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuggestions(data.map((item: { query: string }) => item.query));
    } catch {
      setSuggestions([]);
    }
  }, []);

  // ── Zero-result suggestion acceptance ──────────────────────────────────────

  const applyZeroResultSuggestion = useCallback(
    async (suggestion: ZeroResultSuggestion, currentFilters: Partial<FilterState> = {}) => {
      fetch('/api/v1/properties/search/suggestion-accepted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_type: suggestion.type, original_query: lastQueryRef.current }),
      }).catch(() => {});

      await search(lastQueryRef.current, { ...currentFilters, ...suggestion.relaxed_filters }, 1);
    },
    [search],
  );

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => () => {
    abortControllerRef.current?.abort();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  return {
    results,
    total,
    page,
    hasMore,
    loading,
    error,
    suggestions,
    zeroResultSuggestions,
    histogram,
    page,
    search,
    loadMore,
    searchByBounds,
    getSuggestions,
    getTrending,
    applyZeroResultSuggestion,
  };
}
