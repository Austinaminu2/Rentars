'use client';

import StarRating from './StarRating';

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

interface RatingSummaryProps {
  averageRating: number;
  totalReviews: number;
  distribution?: RatingDistribution;
}

/**
 * Displays overall star rating, review count, and an optional
 * star-distribution bar chart.
 */
export default function RatingSummary({
  averageRating,
  totalReviews,
  distribution,
}: RatingSummaryProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-6 items-start">
      {/* Big average score */}
      <div className="flex flex-col items-center min-w-[80px]">
        <span className="text-5xl font-bold text-gray-900 dark:text-white leading-none">
          {averageRating.toFixed(1)}
        </span>
        <StarRating rating={Math.round(averageRating)} size={18} />
        <span className="text-sm text-gray-500 dark:text-gray-400 mt-1 whitespace-nowrap">
          {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
        </span>
      </div>

      {/* Distribution bars */}
      {distribution && totalReviews > 0 && (
        <div className="flex-1 space-y-1 w-full">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const count = distribution[star] ?? 0;
            const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-right text-gray-600 dark:text-gray-400 shrink-0">
                  {star}
                </span>
                <span className="text-yellow-400 shrink-0">★</span>
                <div
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${star} star: ${pct}%`}
                >
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-gray-500 dark:text-gray-400 shrink-0">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
