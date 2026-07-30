/**
 * Unit tests for profile service.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockFrom = mock((_: string) => ({}));
const mockSupabase = { from: mockFrom };

const supabaseMod = await import('../../src/config/supabase.js');
(supabaseMod as any).supabase = mockSupabase;

import {
  getProfile,
  updateProfile,
  updateStellarAddress,
  getPublicProfile,
  computeProfileCompleteness,
} from '../../src/services/profile.service.js';

// ─────────────────────────────────────────────────────────────────────────────

const mockProfile = {
  user_id: 'u1',
  name: 'Alice',
  avatar_url: 'https://example.com/avatar.jpg',
  phone: '+1234567890',
  stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4CGQOFSNHERX3LRJCX5FWCL46664F3',
  verification_status: 'verified',
};

describe('profile.service', () => {
  beforeEach(() => {
    mockFrom.mockClear();
  });

  // ── getProfile ──────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return a profile when found', async () => {
      mockFrom.mockImplementation(() => ({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(async () => ({ data: mockProfile, error: null })),
          })),
        })),
      }));

      const result = await getProfile('u1');
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Alice');
    });

    it('should return error for empty userId', async () => {
      const result = await getProfile('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID is required');
    });

    it('should return error when profile not found', async () => {
      mockFrom.mockImplementation(() => ({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(async () => ({ data: null, error: { message: 'Not found' } })),
          })),
        })),
      }));

      const result = await getProfile('u-nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Profile not found');
    });
  });

  // ── updateProfile ───────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const updated = { ...mockProfile, name: 'Bob' };

      mockFrom.mockImplementation(() => ({
        upsert: mock(() => ({
          select: mock(() => ({
            single: mock(async () => ({ data: updated, error: null })),
          })),
        })),
      }));

      const result = await updateProfile('u1', { name: 'Bob' });
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Bob');
    });

    it('should return error for empty userId', async () => {
      const result = await updateProfile('', { name: 'Bob' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID is required');
    });

    it('should return error when no fields provided', async () => {
      const result = await updateProfile('u1', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('No fields provided for update');
    });

    it('should return error on DB failure', async () => {
      mockFrom.mockImplementation(() => ({
        upsert: mock(() => ({
          select: mock(() => ({
            single: mock(async () => ({ data: null, error: { message: 'Constraint violation' } })),
          })),
        })),
      }));

      const result = await updateProfile('u1', { name: 'Bob' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Constraint violation');
    });
  });

  // ── updateStellarAddress ────────────────────────────────────────────────────

  describe('updateStellarAddress', () => {
    const validAddress = 'GBRPYHIL2CI3WHZDTOOQFC6EB4CGQOFSNHERX3LRJCX5FWCL46664F3';

    it('should update stellar address successfully', async () => {
      const updated = { ...mockProfile, stellar_address: validAddress };

      mockFrom.mockImplementation(() => ({
        upsert: mock(() => ({
          select: mock(() => ({
            single: mock(async () => ({ data: updated, error: null })),
          })),
        })),
      }));

      const result = await updateStellarAddress('u1', validAddress);
      expect(result.success).toBe(true);
      expect(result.data?.stellar_address).toBe(validAddress);
    });

    it('should return error for empty userId', async () => {
      const result = await updateStellarAddress('', validAddress);
      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID is required');
    });

    it('should return error for empty stellar address', async () => {
      const result = await updateStellarAddress('u1', '');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Stellar address is required');
    });
  });

  // ── getPublicProfile ────────────────────────────────────────────────────────

  describe('getPublicProfile', () => {
    it('should return public profile fields only', async () => {
      const publicData = {
        user_id: 'u1',
        name: 'Alice',
        avatar_url: 'https://example.com/avatar.jpg',
        stellar_address: mockProfile.stellar_address,
        verification_status: 'verified',
        last_active: '2026-06-01T00:00:00Z',
      };

      mockFrom.mockImplementation(() => ({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(async () => ({ data: publicData, error: null })),
          })),
        })),
      }));

      const result = await getPublicProfile('u1');
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Alice');
      // Should not include private fields like phone/address
      expect((result.data as any)?.phone).toBeUndefined();
    });

    it('should return error for empty userId', async () => {
      const result = await getPublicProfile('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID is required');
    });

    it('should return error when profile not found', async () => {
      mockFrom.mockImplementation(() => ({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(async () => ({ data: null, error: { message: 'Not found' } })),
          })),
        })),
      }));

      const result = await getPublicProfile('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Profile not found');
    });
  });

  // ── computeProfileCompleteness ───────────────────────────────────────────────

  describe('computeProfileCompleteness', () => {
    it('returns max score for a complete profile', () => {
      const result = computeProfileCompleteness({
        name: 'Alice',
        avatar_url: 'https://example.com/avatar.jpg',
        phone: '+1234567890',
        address: '123 Main St',
        stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4CGQOFSNHERX3LRJCX5FWCL46664F3',
      });
      expect(result.score).toBe(result.maxScore);
      expect(result.missingFields).toHaveLength(0);
    });

    it('returns zero score for an empty profile', () => {
      const result = computeProfileCompleteness({});
      expect(result.score).toBe(0);
      expect(result.missingFields).toHaveLength(5);
    });

    it('counts only non-empty fields', () => {
      const result = computeProfileCompleteness({ name: 'Alice' });
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(result.maxScore);
      expect(result.missingFields).not.toContain('name');
    });
  });
});
