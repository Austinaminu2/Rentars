'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import FilterSidebar, { type FilterState } from '@/components/search/FilterSidebar';
import PropertyMap from '@/components/search/PropertyMap';
import PropertyGrid from '@/components/search/PropertyGrid';
import { usePropertySearch, type ZeroResultSuggestion } from '@/hooks/usePropertySearch';
import { useGeolocation, type GeoPosition } from '@/hooks/useGeolocation';
import { useNearbyProperties, geocodeAddress } from '@/hooks/useLocationSearch';
import type { LatLngBounds } from 'leaflet';

// ─── URL ↔ filter helpers ─────────────────────────────────────────────────────

function filtersToParams(filters: FilterState, query: string): URLSearchParams {
  const p = new URLSearchParams();
  if (query)                              p.set('q',         query);
  if (filters.priceMin > 0)              p.set('priceMin',  String(filters.priceMin));
  if (filters.priceMax < 1000)           p.set('priceMax',  String(filters.priceMax));
  if (filters.guests > 1)               p.set('guests',    String(filters.guests));
  if (filters.bedrooms)                  p.set('bedrooms',  String(filters.bedrooms));
  if (filters.checkIn)                   p.set('checkIn',   filters.checkIn);
  if (filters.checkOut)                  p.set('checkOut',  filters.checkOut);
  if (filters.propertyType)              p.set('type',      filters.propertyType);
  if (filters.sortBy && filters.sortBy !== 'newest') p.set('sortBy', filters.sortBy);
  return p;
}

function paramsToFilters(p: URLSearchParams): FilterState {
  return {
    priceMin:     p.has('priceMin')  ? Number(p.get('priceMin'))  : 0,
    priceMax:     p.has('priceMax')  ? Number(p.get('priceMax'))  : 1000,
    guests:       p.has('guests')    ? Number(p.get('guests'))    : 1,
    bedrooms:     p.has('bedrooms')  ? Number(p.get('bedrooms'))  : undefined,
    amenities:    p.getAll('amenities'),
    checkIn:      p.get('checkIn')   ?? undefined,
    checkOut:     p.get('checkOut')  ?? undefined,
    propertyType: p.get('type')      ?? '',
    sortBy:       (p.get('sortBy') as FilterState['sortBy']) ?? 'newest',
  };
}

// ─── Zero-result suggestions strip ───────────────────────────────────────────

function ZeroResultSuggestions({
  suggestions,
  filters,
  onApply,
}: {
  suggestions: ZeroResultSuggestion[];
  filters: FilterState;
  onApply: (s: ZeroResultSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Search suggestions"
      className="mb-6 p-4 rounded-xl border border-amber-200 dark:border-amber-800
        bg-amber-50 dark:bg-amber-950/30"
    >
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-3">
        No results for your current filters. Try one of these:
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.type}
            type="button"
            onClick={() => onApply(s)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border
              border-amber-400 dark:border-amber-600 text-xs font-medium
              text-amber-800 dark:text-amber-200 bg-white dark:bg-gray-900
              hover:bg-amber-100 dark:hover:bg-amber-900/40 transition
              focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {s.description}
            <span className="text-amber-500 dark:text-amber-400">
              ({s.estimated_results} result{s.estimated_results !== 1 ? 's' : ''})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  // ── State initialised from URL params ──────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(() => paramsToFilters(searchParams));
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [showMap, setShowMap] = useState(false);
  const [activePropertyId, setActivePropertyId] = useState<string | undefined>();

  // Searchbar input value (may lag behind searchQuery while user types)
  const [inputValue, setInputValue] = useState(searchQuery);

  const {
    results,
    total,
    hasMore,
    loading,
    error,
    zeroResultSuggestions,
    search,
    loadMore,
    searchByBounds,
    applyZeroResultSuggestion,
  } = usePropertySearch();

  // ── Nearby search (GPS) ────────────────────────────────────────────────────
  const [nearbyParams, setNearbyParams] = useState<{
    lat: number; lng: number; radius: number;
  } | null>(null);
  const { properties: nearbyProps, isLoading: nearbyLoading } = useNearbyProperties(nearbyParams);

  // ── Run search whenever query or filters change ────────────────────────────
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Trigger initial search from URL state
      search(searchQuery, filters, 1);
      return;
    }
    search(searchQuery, filters, 1);
    // Push updated URL (no page reload)
    const params = filtersToParams(filters, searchQuery);
    router.replace(`/search?${params.toString()}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filters]);

  // ── Toolbar geolocation ────────────────────────────────────────────────────
  const handleUserLocation = useCallback((pos: GeoPosition, label: string | null) => {
    if (label) setInputValue(label);
    setNearbyParams({ lat: pos.lat, lng: pos.lng, radius: 10 });
    setShowMap(true);
  }, []);

  const { loading: geoLoading, error: geoError, locate } = useGeolocation({
    onLocation: handleUserLocation,
  });

  // ── Text search submit ─────────────────────────────────────────────────────
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setNearbyParams(null);
    // Geocode and optionally trigger nearby search
    const geo = await geocodeAddress(query);
    if (geo) {
      setNearbyParams({ lat: geo.lat, lng: geo.lng, radius: 15 });
    }
  }, []);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(inputValue);
  };

  // ── Bounds search (map viewport) ───────────────────────────────────────────
  const handleBoundsChanged = useCallback(
    (bounds: LatLngBounds) => {
      if (!showMap) return;
      searchByBounds(bounds, filters);
    },
    [showMap, filters, searchByBounds],
  );

  // ── Zero-result suggestion click ───────────────────────────────────────────
  const handleSuggestionApply = useCallback(
    (s: ZeroResultSuggestion) => {
      applyZeroResultSuggestion(s, filters);
    },
    [applyZeroResultSuggestion, filters],
  );

  // Decide which result set to display
  const displayResults = nearbyParams ? nearbyProps : results;
  const displayLoading = nearbyParams ? nearbyLoading : loading;

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Find your next stay
          </h1>

          {/* Search form */}
          <form onSubmit={handleInputSubmit} role="search" className="flex gap-2">
            <input
              type="search"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search by city, country, or property name…"
              aria-label="Search properties"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2
                text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Search
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ── Toolbar ───────────────────────────────────────────────────────── */}
        <div className="mb-4 flex justify-between items-center flex-wrap gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite" aria-atomic="true">
            {displayLoading
              ? 'Searching…'
              : `${total.toLocaleString()} propert${total !== 1 ? 'ies' : 'y'} found`}
          </p>

          <div className="flex items-center gap-2">
            {/* Near me */}
            <button
              type="button"
              onClick={locate}
              disabled={geoLoading}
              aria-label={geoLoading ? 'Finding your location…' : 'Find properties near me'}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm
                font-medium flex items-center gap-1.5 bg-white dark:bg-gray-900
                hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition
                focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {geoLoading
                ? <Loader2 size={14} className="animate-spin text-blue-600" aria-hidden="true" />
                : <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z" />
                    <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none" />
                  </svg>
              }
              Near me
            </button>

            {/* List/Map toggle */}
            <div
              role="group"
              aria-label="View mode"
              className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowMap(false)}
                aria-pressed={!showMap}
                className={`px-4 py-2 text-sm font-medium transition
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500
                  ${!showMap
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setShowMap(true)}
                aria-pressed={showMap}
                className={`px-4 py-2 text-sm font-medium border-l border-gray-300 dark:border-gray-600 transition
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500
                  ${showMap
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
              >
                Map
              </button>
            </div>
          </div>
        </div>

        {/* Geolocation error */}
        {geoError && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800
              bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm px-4 py-3"
          >
            <AlertCircle size={15} aria-hidden="true" />
            {geoError}
          </div>
        )}

        {/* ── Map view ───────────────────────────────────────────────────────── */}
        {showMap && (
          <div className="mb-6">
            <PropertyMap
              properties={displayResults as any[]}
              activePropertyId={activePropertyId}
              onPropertyClick={(id) => { router.push(`/property/${id}`); }}
              onBoundsChanged={handleBoundsChanged}
              onUserLocation={handleUserLocation}
            />
          </div>
        )}

        {/* ── Content grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <FilterSidebar filters={filters} onFilterChange={setFilters} />
          </aside>

          {/* Results */}
          <div className="lg:col-span-3 space-y-6">

            {/* Zero-result suggestions */}
            {!displayLoading && !error && displayResults.length === 0 && (
              <ZeroResultSuggestions
                suggestions={zeroResultSuggestions}
                filters={filters}
                onApply={handleSuggestionApply}
              />
            )}

            <PropertyGrid
              properties={displayResults as any[]}
              loading={displayLoading}
              error={error}
              onRetry={() => search(searchQuery, filters, 1)}
            />

            {/* Load more */}
            {hasMore && !displayLoading && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={loadMore}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border
                    border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900
                    text-sm font-medium text-gray-700 dark:text-gray-300
                    hover:bg-gray-50 dark:hover:bg-gray-800 transition
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <ChevronDown size={16} aria-hidden="true" />
                  Load more properties
                </button>
              </div>
            )}

            {/* Loading next page spinner */}
            {displayLoading && displayResults.length > 0 && (
              <div className="flex justify-center py-4" aria-live="polite" aria-label="Loading more">
                <Loader2 size={24} className="animate-spin text-blue-600" aria-hidden="true" />
              </div>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}
