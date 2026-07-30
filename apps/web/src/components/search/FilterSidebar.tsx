'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PriceHistogramResult } from '@/types/search';

interface FilterSidebarProps {
  onFilterChange: (filters: FilterState) => void;
  /** Histogram data returned by the search API for the current context. */
  histogram?: PriceHistogramResult | null;
}

export interface FilterState {
  priceMin: number;
  priceMax: number;
  amenities: string[];
  guests: number;
  checkIn?: string;
  checkOut?: string;
  /** Single property type selected (maps to property_types[] on the API). */
  propertyType: string;
  bedrooms?: number;
  /** Minimum number of bathrooms (≥ filter). */
  minBathrooms?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'distance' | 'rating';
}

interface FilterSidebarProps {
  filters?: Partial<FilterState>;
  onFilterChange: (filters: FilterState) => void;
}

const AMENITIES = [
  'WiFi', 'Kitchen', 'Parking', 'Pool', 'Gym',
  'Washer', 'Dryer', 'AC', 'Heating', 'TV', 'Balcony',
];
const PROPERTY_TYPES = ['Apartment', 'House', 'Villa', 'Condo', 'Studio', 'Room', 'Townhouse', 'Cabin', 'Loft', 'Boat'];
const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest' },
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'distance',   label: 'Distance' },
  { value: 'rating',     label: 'Rating' },
];

const BATHROOM_OPTIONS = [1, 1.5, 2, 3, 4];

// ─── Histogram bar chart ──────────────────────────────────────────────────────

function PriceHistogramBars({
  histogram,
  priceMin,
  priceMax,
}: {
  histogram: PriceHistogramResult;
  priceMin: number;
  priceMax: number;
}) {
  if (!histogram.buckets.length) return null;

  const maxCount = Math.max(...histogram.buckets.map((b) => b.count), 1);

  return (
    <div
      className="flex items-end gap-px w-full h-10 mb-1"
      role="img"
      aria-label="Price distribution histogram"
    >
      {histogram.buckets.map((bucket, i) => {
        const heightPct = (bucket.count / maxCount) * 100;
        // Dim buckets outside the current price range selection
        const inRange = bucket.max > priceMin && bucket.min < priceMax;
        return (
          <div
            key={i}
            style={{ height: `${heightPct}%`, flex: 1 }}
            className={`rounded-sm transition-colors ${
              inRange
                ? 'bg-blue-500 dark:bg-blue-400'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
            title={`${bucket.min}–${bucket.max} USDC: ${bucket.count} listing${bucket.count !== 1 ? 's' : ''}`}
          />
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FilterSidebar({ onFilterChange, histogram }: FilterSidebarProps) {
  const id = useId();

  const [filters, setFilters] = useState<FilterState>({
    priceMin: 0,
    priceMax: 1000,
    amenities: [],
    guests: 1,
    propertyType: '',
    bedrooms: undefined,
    minBathrooms: undefined,
    sortBy: 'newest',
  });

  const [expandedSections, setExpandedSections] = useState({
    sort: true,
    price: true,
    type: true,
    bedrooms: true,
    bathrooms: true,
    amenities: true,
    guests: true,
    dates: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  const update = (patch: Partial<FilterState>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    onFilterChange(next);
  };

  // ── Reusable accordion header ─────────────────────────────────────────────

  function SectionHeader({ section, label }: { section: keyof typeof expandedSections; label: string }) {
    return (
      <button
        id={`${id}-btn-${section}`}
        type="button"
        aria-expanded={expandedSections[section]}
        aria-controls={`${id}-panel-${section}`}
        onClick={() => toggleSection(section)}
        className="flex items-center justify-between w-full font-semibold text-gray-900 dark:text-gray-100 mb-3
          focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {label}
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`transition-transform duration-200 text-gray-500 dark:text-gray-400 ${expandedSections[section] ? 'rotate-180' : ''}`}
        />
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-5 h-fit sticky top-8">

      {/* Sort ---------------------------------------------------------------- */}
      <section>
        <SectionHeader section="sort" label="Sort By" />
        {expandedSections.sort && (
          <div id={`${id}-panel-sort`} role="region" aria-labelledby={`${id}-btn-sort`} className="space-y-2">
            {SORT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`${id}-sortBy`}
                  value={opt.value}
                  checked={filters.sortBy === opt.value}
                  onChange={() => update({ sortBy: opt.value as FilterState['sortBy'] })}
                  className="accent-blue-600 focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Price Range --------------------------------------------------------- */}
      <section>
        <SectionHeader section="price" label="Price Range (USDC)" />
        {expandedSections.price && (
          <div id={`${id}-panel-price`} role="region" aria-labelledby={`${id}-btn-price`} className="space-y-3">

            {/* Histogram behind sliders */}
            {histogram && (
              <PriceHistogramBars
                histogram={histogram}
                priceMin={filters.priceMin}
                priceMax={filters.priceMax}
              />
            )}

            <div>
              <label htmlFor={`${id}-price-min`} className="text-xs text-gray-500 dark:text-gray-400">
                Min: {filters.priceMin} USDC
              </label>
              <input
                id={`${id}-price-min`}
                type="range"
                min={histogram?.global_min ?? 0}
                max={histogram?.global_max ?? 1000}
                value={filters.priceMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  update({ priceMin: Math.min(v, filters.priceMax - 1) });
                }}
                className="w-full accent-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                aria-label="Minimum price"
              />
            </div>
            <div>
              <label htmlFor={`${id}-price-max`} className="text-xs text-gray-500 dark:text-gray-400">
                Max: {filters.priceMax} USDC
              </label>
              <input
                id={`${id}-price-max`}
                type="range"
                min={histogram?.global_min ?? 0}
                max={histogram?.global_max ?? 1000}
                value={filters.priceMax}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  update({ priceMax: Math.max(v, filters.priceMin + 1) });
                }}
                className="w-full accent-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                aria-label="Maximum price"
              />
            </div>
          </div>
        )}
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Property Type ------------------------------------------------------- */}
      <section>
        <SectionHeader section="type" label="Property Type" />
        {expandedSections.type && (
          <div id={`${id}-panel-type`} role="region" aria-labelledby={`${id}-btn-type`} className="space-y-1.5">
            {/* "Any" option to clear selection */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`${id}-propertyType`}
                value=""
                checked={filters.propertyType === ''}
                onChange={() => update({ propertyType: '' })}
                className="accent-blue-600 focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Any</span>
            </label>
            {PROPERTY_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`${id}-propertyType`}
                  value={type}
                  checked={filters.propertyType === type}
                  onChange={() => update({ propertyType: type })}
                  className="accent-blue-600 focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{type}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Bedrooms ------------------------------------------------------------ */}
      <section>
        <SectionHeader section="bedrooms" label="Min Bedrooms" />
        {expandedSections.bedrooms && (
          <div id={`${id}-panel-bedrooms`} role="region" aria-labelledby={`${id}-btn-bedrooms`}
            className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => update({ bedrooms: undefined })}
              className={`px-3 py-1.5 rounded border text-sm transition ${
                filters.bedrooms === undefined
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-500'
              }`}
            >
              Any
            </button>
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => update({ bedrooms: filters.bedrooms === num ? undefined : num })}
                aria-pressed={filters.bedrooms === num}
                className={`px-3 py-1.5 rounded border text-sm transition ${
                  filters.bedrooms === num
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-500'
                }`}
              >
                {num}+
              </button>
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Bathrooms ----------------------------------------------------------- */}
      <section>
        <SectionHeader section="bathrooms" label="Min Bathrooms" />
        {expandedSections.bathrooms && (
          <div id={`${id}-panel-bathrooms`} role="region" aria-labelledby={`${id}-btn-bathrooms`}
            className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => update({ minBathrooms: undefined })}
              className={`px-3 py-1.5 rounded border text-sm transition ${
                filters.minBathrooms === undefined
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-500'
              }`}
            >
              Any
            </button>
            {BATHROOM_OPTIONS.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => update({ minBathrooms: filters.minBathrooms === num ? undefined : num })}
                aria-pressed={filters.minBathrooms === num}
                className={`px-3 py-1.5 rounded border text-sm transition ${
                  filters.minBathrooms === num
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-500'
                }`}
              >
                {num}+
              </button>
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Guests -------------------------------------------------------------- */}
      <section>
        <SectionHeader section="guests" label="Guests" />
        {expandedSections.guests && (
          <div id={`${id}-panel-guests`} role="region" aria-labelledby={`${id}-btn-guests`}
            className="flex gap-2 flex-wrap">
            {[1, 2, 4, 6, 8].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => update({ guests: num })}
                aria-pressed={filters.guests === num}
                className={`px-3 py-1.5 rounded border text-sm transition ${
                  filters.guests === num
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-500'
                }`}
              >
                {num === 5 ? '5+' : num}
              </button>
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Amenities ----------------------------------------------------------- */}
      <section>
        <SectionHeader section="amenities" label="Amenities" />
        {expandedSections.amenities && (
          <div id={`${id}-panel-amenities`} role="region" aria-labelledby={`${id}-btn-amenities`}
            className="space-y-1.5">
            {AMENITIES.map((amenity) => (
              <label key={amenity} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.amenities.includes(amenity)}
                  onChange={() => {
                    const next = filters.amenities.includes(amenity)
                      ? filters.amenities.filter((a) => a !== amenity)
                      : [...filters.amenities, amenity];
                    update({ amenities: next });
                  }}
                  className="accent-blue-600 rounded focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{amenity}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Dates --------------------------------------------------------------- */}
      <section>
        <SectionHeader section="dates" label="Dates" />
        {expandedSections.dates && (
          <div id={`${id}-panel-dates`} role="region" aria-labelledby={`${id}-btn-dates`}
            className="space-y-3">
            <div>
              <label htmlFor={`${id}-check-in`} className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                Check In
              </label>
              <input
                id={`${id}-check-in`}
                type="date"
                value={filters.checkIn ?? ''}
                onChange={(e) => update({ checkIn: e.target.value || undefined })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label htmlFor={`${id}-check-out`} className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                Check Out
              </label>
              <input
                id={`${id}-check-out`}
                type="date"
                value={filters.checkOut ?? ''}
                onChange={(e) => update({ checkOut: e.target.value || undefined })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
