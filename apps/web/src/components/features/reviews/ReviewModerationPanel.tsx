'use client';

import { useEffect, useState } from 'react';
import StarRating from './StarRating';

interface FlaggedReview {
  id: string;
  reviewer_id: string;
  target_id: string;
  rating: number;
  comment?: string;
  created_at?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function ReviewModerationPanel() {
  const [reviews, setReviews] = useState<FlaggedReview[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/v1/reviews/moderation/flagged`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setReviews(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function moderate(reviewId: string, approve: boolean) {
    const token = localStorage.getItem('token');
    await fetch(`${API_URL}/api/v1/reviews/${reviewId}/moderate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approve }),
    });
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
  }

  if (loading) return <p className="text-sm text-gray-500">Loading flagged reviews...</p>;

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg">Flagged Reviews</h2>
      {reviews.length === 0 ? (
        <p className="text-gray-500 text-sm">No flagged reviews.</p>
      ) : (
        reviews.map((review) => (
          <div key={review.id} className="border rounded-lg p-4 space-y-2">
            <StarRating rating={review.rating} size={14} />
            {review.comment && <p className="text-sm text-gray-700">{review.comment}</p>}
            <p className="text-xs text-gray-400">
              Reviewer: {review.reviewer_id} &middot;{' '}
              {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => moderate(review.id, true)}
                className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => moderate(review.id, false)}
                className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
