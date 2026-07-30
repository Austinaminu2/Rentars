/**
 * Unit tests for review.service — critical business logic rules.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAST_CHECKOUT = '2024-01-01T00:00:00.000Z';

// Build a minimal supabase chain that returns the given result at the leaf
function chain(result: unknown) {
  const leaf = mock(async () => result);
  const node: Record<string, unknown> = {
    select: mock(() => node),
    insert: mock(() => node),
    update: mock(() => node),
    delete: mock(() => node),
    eq: mock(() => node),
    not: mock(() => node),
    order: mock(() => node),
    limit: mock(() => node),
    single: leaf,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return node;
}

// ── Supabase mock via mock.module ─────────────────────────────────────────────

const mockFrom = mock((_: string) => chain({ data: null, error: null }));

mock.module('../../src/config/supabase.js', () => ({
  supabase: { from: mockFrom },
}));

// Also stub notification service to prevent import-time side-effects
mock.module('../../src/services/notification.service.js', () => ({
  createNotification: mock(async () => ({ success: true })),
}));

// Also stub cache service
mock.module('../../src/services/cache.service.js', () => ({
  del: mock(async () => {}),
  get: mock(async () => null),
  set: mock(async () => {}),
}));

// Also stub sanitize utils
mock.module('../../src/utils/sanitize.js', () => ({
  sanitizeLongText: mock((s: string) => s),
  sanitizeResponse: mock((s: string) => s),
}));

import {
  submitReview,
  getReviewsForProperty,
  getReviewsForUser,
  getAverageRating,
} from '../../src/services/review.service.js';

// ─────────────────────────────────────────────────────────────────────────────

describe('review.service', () => {
  beforeEach(() => {
    mockFrom.mockClear();
  });

  // ── submitReview — rating validation ──────────────────────────────────────

  describe('submitReview — rating validation', () => {
    it('rejects rating = 0', async () => {
      const result = await submitReview('b1', 'u1', 'u2', 0, 'ok');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rating must be between 1 and 5');
    });

    it('rejects rating = 6', async () => {
      const result = await submitReview('b1', 'u1', 'u2', 6, 'ok');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rating must be between 1 and 5');
    });

    it('rejects rating = -1', async () => {
      const result = await submitReview('b1', 'u1', 'u2', -1, 'ok');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rating must be between 1 and 5');
    });
  });

  // ── submitReview — booking rules ─────────────────────────────────────────

  describe('submitReview — booking ownership', () => {
    it('returns error when booking is not found or not owned by reviewer', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: null, error: { message: 'not found' } }),
      );
      const result = await submitReview('b1', 'u1', 'u2', 4, 'great');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Booking not found or not owned by reviewer');
    });

    it('rejects review for a Cancelled booking', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({
          data: { id: 'b1', status: 'Cancelled', check_out: PAST_CHECKOUT },
          error: null,
        }),
      );
      const result = await submitReview('b1', 'u1', 'u2', 4, 'great');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot review a cancelled booking');
    });

    it('rejects review for a Disputed booking', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({
          data: { id: 'b1', status: 'Disputed', check_out: PAST_CHECKOUT },
          error: null,
        }),
      );
      const result = await submitReview('b1', 'u1', 'u2', 4, 'great');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot review a disputed booking');
    });

    it('rejects review for a non-Completed booking', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({
          data: { id: 'b1', status: 'Confirmed', check_out: PAST_CHECKOUT },
          error: null,
        }),
      );
      const result = await submitReview('b1', 'u1', 'u2', 4, 'great');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Can only review after the stay is completed');
    });

    it('rejects review when checkout date has not passed', async () => {
      const futureCheckout = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      mockFrom.mockImplementation((_: string) =>
        chain({
          data: { id: 'b1', status: 'Completed', check_out: futureCheckout },
          error: null,
        }),
      );
      const result = await submitReview('b1', 'u1', 'u2', 4, 'great');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot review before the checkout date has passed');
    });
  });

  // ── getReviewsForProperty ─────────────────────────────────────────────────

  describe('getReviewsForProperty', () => {
    it('returns reviews array on success', async () => {
      const reviews = [
        { id: 'r1', property_id: 'p1', rating: 5, moderation_status: 'approved' },
        { id: 'r2', property_id: 'p1', rating: 4, moderation_status: 'approved' },
      ];
      mockFrom.mockImplementation((_: string) =>
        chain({ data: reviews, error: null }),
      );
      const result = await getReviewsForProperty('p1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('returns empty array when no reviews', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: null, error: null }),
      );
      const result = await getReviewsForProperty('p-no-reviews');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns error on DB failure', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: null, error: { message: 'DB error' } }),
      );
      const result = await getReviewsForProperty('p1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
    });
  });

  // ── getReviewsForUser ─────────────────────────────────────────────────────

  describe('getReviewsForUser', () => {
    it('returns reviews for a user', async () => {
      const reviews = [{ id: 'r1', target_id: 'u1', rating: 5 }];
      mockFrom.mockImplementation((_: string) =>
        chain({ data: reviews, error: null }),
      );
      const result = await getReviewsForUser('u1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  // ── getAverageRating ──────────────────────────────────────────────────────

  describe('getAverageRating', () => {
    it('returns 0 when user has no reviews', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: [], error: null }),
      );
      const result = await getAverageRating('u1');
      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });

    it('calculates average correctly', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: [{ rating: 4 }, { rating: 5 }, { rating: 3 }], error: null }),
      );
      const result = await getAverageRating('u1');
      expect(result.success).toBe(true);
      expect(result.data).toBe(4); // (4+5+3)/3 = 4
    });

    it('returns error on DB failure', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: null, error: { message: 'timeout' } }),
      );
      const result = await getAverageRating('u1');
      expect(result.success).toBe(false);
    });
  });
});
