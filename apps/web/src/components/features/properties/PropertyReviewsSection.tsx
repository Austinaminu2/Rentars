'use client';

import { useCallback, useEffect, useState } from 'react';
import ReviewList from '@/components/features/reviews/ReviewList';
import ReviewForm from '@/components/features/reviews/ReviewForm';
import RatingSummary from '@/components/features/reviews/RatingSummary';
import type { ReviewItem } from '@/components/features/reviews/ReviewList';
import type { RatingDistribution } from '@/components/features/reviews/RatingSummary';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface PropertyReviewsSectionProps {
  propertyId: string;
  hostId?: string;
  /** If provided, user can leave a review for this booking */
  eligibleBookingId?: string;
  /** ID of the signed-in user — used to show flag + host-response controls */
  currentUserId?: string;
}

interface AggregateStats {
  average_rating: number;
  total_reviews: number;
  distribution: RatingDistribution;
}

function buildDistribution(reviews: ReviewItem[]): RatingDistribution {
  const dist: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const star = Math.round(r.rating) as keyof RatingDistribution;
    if (star >= 1 && star <= 5) dist[star]++;
  }
  return dist;
}

export default function PropertyReviewsSection({
  propertyId,
  hostId,
  eligibleBookingId,
  currentUserId,
}: PropertyReviewsSectionProps) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/reviews/property/${propertyId}`);
      if (!res.ok) throw new Error('Failed to load reviews');
      const data: ReviewItem[] = await res.json();
      setReviews(data);

      // Build aggregate stats from the fetched reviews
      const distribution = buildDistribution(data);
      const totalReviews = data.length;
      const averageRating =
        totalReviews > 0
          ? data.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;
      setStats({
        average_rating: Math.round(averageRating * 10) / 10,
        total_reviews: totalReviews,
        distribution,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setIsLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleReviewSuccess = () => {
    setShowForm(false);
    fetchReviews();
  };

  return (
    <section aria-labelledby="reviews-heading" className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
      <h2
        id="reviews-heading"
        className="text-xl font-semibold text-gray-900 dark:text-white mb-5"
      >
        Guest Reviews
      </h2>

      {/* Rating summary */}
      {!isLoading && stats && (
        <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
          <RatingSummary
            averageRating={stats.average_rating}
            totalReviews={stats.total_reviews}
            distribution={stats.distribution}
          />
        </div>
      )}

      {/* Write-a-review CTA */}
      {eligibleBookingId && !showForm && (
        <div className="mb-6">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition"
          >
            ★ Write a Review
          </button>
        </div>
      )}

      {showForm && eligibleBookingId && (
        <div className="mb-6">
          <ReviewForm
            bookingId={eligibleBookingId}
            targetId={hostId ?? ''}
            propertyId={propertyId}
            onSuccess={handleReviewSuccess}
          />
          <button
            onClick={() => setShowForm(false)}
            className="mt-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="text-center py-6">
          <p className="text-red-500 text-sm mb-2">{error}</p>
          <button
            onClick={fetchReviews}
            className="text-sm text-blue-600 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Review list */}
      {!isLoading && !error && (
        <ReviewList
          reviews={reviews}
          averageRating={stats?.average_rating ?? 0}
          currentUserId={currentUserId}
          hostId={hostId}
        />
      )}
    </section>
  );
}
