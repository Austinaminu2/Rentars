import { supabase } from '../config/supabase.js';
import * as cache from './cache.service.js';
import type { ServiceResponse } from './index.js';
import { sanitizeLongText, sanitizeResponse } from '../utils/sanitize.js';

export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  booking_id: string;
  reviewer_id: string;
  target_id: string;
  property_id?: string;
  rating: number;
  comment?: string;
  on_chain_id?: number;
  host_response?: string;
  host_response_at?: string;
  is_flagged?: boolean;
  is_approved?: boolean;
  moderation_status?: ModerationStatus;
  moderation_reason?: string;
  created_at?: string;
}

export async function submitReview(
  bookingId: string,
  reviewerId: string,
  targetId: string,
  rating: number,
  comment: string,
  propertyId?: string,
): Promise<ServiceResponse<Review>> {
  if (rating < 1 || rating > 5) {
    return { success: false, error: 'Rating must be between 1 and 5' };
  }

  // Sanitize user-supplied text; enforce max 2000 chars for review comments
  const cleanComment = sanitizeLongText(comment, 2_000);

  // Verify booking belongs to reviewer
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, status, check_out')
    .eq('id', bookingId)
    .eq('tenant_id', reviewerId)
    .single();

  if (bookingError || !booking) {
    return { success: false, error: 'Booking not found or not owned by reviewer' };
  }

  const b = booking as { id: string; status: string; check_out: string };

  if (b.status === 'Cancelled') {
    return { success: false, error: 'Cannot review a cancelled booking' };
  }
  if (b.status === 'Disputed') {
    return { success: false, error: 'Cannot review a disputed booking' };
  }
  if (b.status !== 'Completed') {
    return { success: false, error: 'Can only review after the stay is completed' };
  }
  if (new Date(b.check_out) >= new Date()) {
    return { success: false, error: 'Cannot review before the checkout date has passed' };
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_id: bookingId,
      reviewer_id: reviewerId,
      target_id: targetId,
      property_id: propertyId,
      rating,
      comment: cleanComment,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Invalidate the property detail cache so the updated rating aggregate is reflected.
  if (propertyId) {
    await cache.del(`property:${propertyId}`);
  }

  // Notify the host that a new review was submitted
  try {
    const { createNotification } = await import('./notification.service.js');
    await createNotification(targetId, 'review_submitted', {
      reviewId: (data as Review).id,
      reviewerId,
      propertyId: propertyId ?? null,
      rating,
      message: `A guest left you a ${rating}-star review.`,
    });
  } catch {
    // Notification failure must never block the review submission
  }

  return { success: true, data: data as Review };
}

export async function getReviewsForProperty(propertyId: string): Promise<ServiceResponse<Review[]>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('property_id', propertyId)
    .eq('moderation_status', 'approved')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Review[] };
}

export async function getReviewsForUser(userId: string): Promise<ServiceResponse<Review[]>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('target_id', userId)
    .eq('moderation_status', 'approved')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Review[] };
}

export async function getAverageRating(userId: string): Promise<ServiceResponse<number>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('target_id', userId)
    .eq('is_approved', true);

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: true, data: 0 };

  const avg = (data as { rating: number }[]).reduce((sum, r) => sum + r.rating, 0) / data.length;
  return { success: true, data: Math.round(avg * 10) / 10 };
}

const MAX_HOST_RESPONSE_LENGTH = 1000;

export async function addHostResponse(
  reviewId: string,
  hostId: string,
  response: string,
): Promise<ServiceResponse<Review>> {
  if (response.trim().length > MAX_HOST_RESPONSE_LENGTH) {
    return {
      success: false,
      error: `Response must be at most ${MAX_HOST_RESPONSE_LENGTH} characters`,
    };
  }

  const { data: review, error: reviewError } = await supabase
    .from('reviews')
    .select('id, target_id, property_id')
    .eq('id', reviewId)
    .single();

  if (reviewError || !review) {
    return { success: false, error: 'Review not found' };
  }

  const r = review as { id: string; target_id: string; property_id: string | null };

  // Verify host owns the reviewed property; fall back to target_id check when no property
  if (r.property_id) {
    const { data: property } = await supabase
      .from('properties')
      .select('owner_id')
      .eq('id', r.property_id)
      .single();

    if (!property || (property as { owner_id: string }).owner_id !== hostId) {
      return { success: false, error: 'Only the property owner can respond to this review' };
    }
  } else if (r.target_id !== hostId) {
    return { success: false, error: 'Only the reviewed host can respond' };
  }

  // Sanitize host response; enforce max 2000 chars
  const cleanResponse = sanitizeResponse(response, 2_000);
  if (!cleanResponse) {
    return { success: false, error: 'Response text is required' };
  }

  const { data, error } = await supabase
    .from('reviews')
    .update({ host_response: cleanResponse, host_response_at: new Date().toISOString() })
    .eq('id', reviewId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Notify the reviewer that the host has responded
  try {
    const updatedReview = data as Review;
    const { createNotification } = await import('./notification.service.js');
    await createNotification(updatedReview.reviewer_id, 'host_response', {
      reviewId,
      hostId,
      propertyId: updatedReview.property_id ?? null,
      message: 'The host responded to your review.',
    });
  } catch {
    // Notification failure must never block the host response submission
  }

  return { success: true, data: data as Review };
}

export async function flagReview(
  reviewId: string,
  reporterId: string,
): Promise<ServiceResponse<void>> {
  const { error } = await supabase
    .from('reviews')
    .update({ is_flagged: true })
    .eq('id', reviewId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function approveReview(
  reviewId: string,
  actorId?: string,
): Promise<ServiceResponse<Review>> {
  const { data, error } = await supabase
    .from('reviews')
    .update({ moderation_status: 'approved', is_approved: true, is_flagged: false })
    .eq('id', reviewId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  if (actorId) {
    const { record } = await import('./auditLog.service.js');
    await record(actorId, 'review.approve', 'review', reviewId);
  }

  return { success: true, data: data as Review };
}

export async function rejectReview(
  reviewId: string,
  reason: string,
  actorId?: string,
): Promise<ServiceResponse<Review>> {
  if (!reason || reason.trim().length === 0) {
    return { success: false, error: 'Rejection reason is required' };
  }

  const { data, error } = await supabase
    .from('reviews')
    .update({ moderation_status: 'rejected', is_approved: false, moderation_reason: reason, is_flagged: false })
    .eq('id', reviewId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  if (actorId) {
    const { record } = await import('./auditLog.service.js');
    await record(actorId, 'review.reject', 'review', reviewId, { reason });
  }

  return { success: true, data: data as Review };
}

export async function getPendingReviews(): Promise<ServiceResponse<Review[]>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('moderation_status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Review[] };
}

export async function moderateReview(
  reviewId: string,
  approve: boolean,
  actorId?: string,
): Promise<ServiceResponse<Review>> {
  return approve
    ? approveReview(reviewId, actorId)
    : rejectReview(reviewId, 'Rejected by moderator', actorId);
}

export async function getFlaggedReviews(): Promise<ServiceResponse<Review[]>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('is_flagged', true)
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Review[] };
}
