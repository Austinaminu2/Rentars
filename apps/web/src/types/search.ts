/** Shared types for search — used by usePropertySearch and FilterSidebar. */

export interface PriceHistogramBucket {
  /** Lower bound of this bucket (inclusive). */
  min: number;
  /** Upper bound of this bucket (exclusive, except the last bucket). */
  max: number;
  /** Number of listings in this bucket. */
  count: number;
}

export interface PriceHistogramResult {
  buckets: PriceHistogramBucket[];
  /** Lowest price across all listings in current context (price filter excluded). */
  global_min: number;
  /** Highest price across all listings in current context (price filter excluded). */
  global_max: number;
}
