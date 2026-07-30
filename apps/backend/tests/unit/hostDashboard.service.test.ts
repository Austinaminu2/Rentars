/**
 * Unit tests for hostDashboard.service
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// ── Chainable supabase mock ───────────────────────────────────────────────────

function chain(result: unknown) {
  const node: Record<string, unknown> = {
    select: mock(() => node),
    insert: mock(() => node),
    update: mock(() => node),
    eq: mock(() => node),
    in: mock(() => node),
    not: mock(() => node),
    gte: mock(() => node),
    lte: mock(() => node),
    order: mock(() => node),
    range: mock(() => node),
    single: mock(async () => result),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return node;
}

const mockFrom = mock((_: string) => chain({ data: null, error: null }));

mock.module('../../src/config/supabase.js', () => ({
  supabase: { from: mockFrom },
}));

import {
  getHostDashboardSummary,
  getHostProperties,
  updatePropertyStatus,
} from '../../src/services/hostDashboard.service.js';

// ─────────────────────────────────────────────────────────────────────────────

describe('hostDashboard.service', () => {
  beforeEach(() => {
    mockFrom.mockClear();
  });

  // ── getHostDashboardSummary ───────────────────────────────────────────────

  describe('getHostDashboardSummary', () => {
    it('returns zero stats when host has no properties', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: [], error: null, count: 0 }),
      );
      const result = await getHostDashboardSummary('host-1');
      expect(result.success).toBe(true);
      expect(result.data?.total_properties).toBe(0);
      expect(result.data?.active_bookings).toBe(0);
      expect(result.data?.total_revenue).toBe(0);
    });

    it('returns error when DB fails on properties query', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: null, error: { message: 'DB timeout' }, count: 0 }),
      );
      const result = await getHostDashboardSummary('host-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('DB timeout');
    });
  });

  // ── getHostProperties ─────────────────────────────────────────────────────

  describe('getHostProperties', () => {
    it('returns empty list when host has no properties', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: [], error: null, count: 0 }),
      );
      const result = await getHostProperties('host-1');
      expect(result.success).toBe(true);
      expect(result.data?.properties).toEqual([]);
      expect(result.data?.total).toBe(0);
    });

    it('returns error when DB query fails', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: null, error: { message: 'Connection refused' }, count: 0 }),
      );
      const result = await getHostProperties('host-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  // ── updatePropertyStatus ─────────────────────────────────────────────────

  describe('updatePropertyStatus', () => {
    it('returns error when property is not found', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: null, error: { message: 'not found' } }),
      );
      const result = await updatePropertyStatus('prop-1', 'owner-1', 'published');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Property not found');
    });

    it('returns forbidden error when user does not own the property', async () => {
      mockFrom.mockImplementation((_: string) =>
        chain({ data: { owner_id: 'different-owner' }, error: null }),
      );
      const result = await updatePropertyStatus('prop-1', 'owner-1', 'published');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Forbidden/);
    });
  });
});
