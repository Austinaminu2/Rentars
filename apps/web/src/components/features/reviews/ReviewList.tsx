'use client';

import { useState } from 'react';
import StarRating from './StarRating';
import HostResponseForm from './HostResponseForm';

export interface ReviewItem {
  id: string;
  reviewer_id: string;
  rating: number;
  comment?: string;
  host_response?: string;
  host_response_at?: string;
  created_at?: string;
  reviewer_name?: string;
  reviewer_avatar?: string;
}

interface ReviewListProps {
  reviews: ReviewItem[];
  /** Legacy: only used when RatingSummary is not rendered above */
  averageRating?: number;
  /** If provided, flag button is shown for users who aren't the reviewer */
  currentUserId?: string;
  /** If provided, the host can respond to reviews inline */
  hostId?: string;
  /** When true, hides the summary header (use when RatingSummary is rendered above) */
  hideSummaryHeader?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function ReviewList({
  reviews,
  averageRating = 0,
  currentUserId,
  hostId,
  hideSummaryHeader = false,
}: ReviewListProps) {
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [localResponses, setLocalResponses] = useState<Record<string, string>>({});

  async function handleFlag(reviewId: string) {
    const token = localStorage.getItem('token');
    await fetch(`${API_URL}/api/v1/reviews/${reviewId}/flag`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setFlagged((prev) => new Set([...prev, reviewId]));
  }

  function handleResponseSuccess(reviewId: string, responseText: string) {
    setLocalResponses((prev) => ({ ...prev, [reviewId]: responseText }));
    setRespondingTo(null);
  }

  const isHost = !!(hostId && currentUserId && hostId === currentUserId);

  return (
    <div className="space-y-4">
      {/* Legacy summary header — hidden when PropertyReviewsSection renders RatingSummary */}
      {!hideSummaryHeader && (
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold">{averageRating.toFixed(1)}</span>
          <div>
            <StarRating rating={Math.round(averageRating)} size={18} />
            <p className="text-sm text-gray-500">
              {reviews.length} {reviews.length !== 1 ? 'reviews' : 'review'}
            </p>
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No reviews yet — be the first to share your experience!
        </p>
      ) : (
        reviews.map((review) => {
          const effectiveResponse = localResponses[review.id] ?? review.host_response;
          return (
            <div
              key={review.id}
              className="border-t border-gray-100 dark:border-gray-800 pt-4"
            >
              {/* Reviewer header */}
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  {review.reviewer_avatar ? (
                    <img
                      src={review.reviewer_avatar}
                      alt={review.reviewer_name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300">
                      {(review.reviewer_name ?? 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="font-semibold text-sm text-gray-900 dark:text-white">
                    {review.reviewer_name ?? 'Anonymous'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {review.created_at
                      ? new Date(review.created_at).toLocaleDateString()
                      : ''}
                  </span>
                  {currentUserId && currentUserId !== review.reviewer_id && (
                    <button
                      onClick={() => handleFlag(review.id)}
                      disabled={flagged.has(review.id)}
                      className="text-xs text-gray-400 hover:text-red-500 disabled:text-gray-300 transition"
                      title="Report this review"
                    >
                      {flagged.has(review.id) ? 'Reported' : 'Report'}
                    </button>
                  )}
                </div>
              </div>

              <StarRating rating={review.rating} size={14} />

              {review.comment && (
                <p className="text-gray-700 dark:text-gray-300 mt-1 text-sm">
                  {review.comment}
                </p>
              )}

              {/* Host response */}
              {effectiveResponse && (
                <div className="mt-2 ml-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Host response
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{effectiveResponse}</p>
                  {review.host_response_at && (
                    <p className="text-xs text-gray-400">
                      {new Date(review.host_response_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Host respond button */}
              {isHost && !effectiveResponse && respondingTo !== review.id && (
                <button
                  onClick={() => setRespondingTo(review.id)}
                  className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Respond to this review
                </button>
              )}

              {isHost && respondingTo === review.id && (
                <div className="mt-2">
                  <HostResponseForm
                    reviewId={review.id}
                    onSuccess={(text) => handleResponseSuccess(review.id, text)}
                  />
                  <button
                    onClick={() => setRespondingTo(null)}
                    className="mt-1 text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
