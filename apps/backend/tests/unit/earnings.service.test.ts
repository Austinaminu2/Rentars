/**
 * Unit tests for EarningsService (#271).
 * Verifies aggregation of gross, fees, net, pending, and released amounts
 * across mixed booking/escrow states.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// ── Supabase mock ──────────────────────────────────────────────────────────────

const mockFrom = mock((_: string) => ({}));
const mockSupabase = { from: mockFrom };
const supabaseMod = await import('../../src/config/supabase.js');
(supabaseMod as any).supabase = mockSupabase;

import { EarningsService } from '../../src/services/earnings.service.js';

// ──────────────────────────────────────────────────────────────────────────────

function setupBookingsQuery(rows: Array<{ total_price: number; status: string }>) {
  mockFrom.mockImplementation(() => ({
    select: mock(() => ({
      eq: mock(() => ({
        not: mock(() => ({
          gte: mock(() => ({
            lte: mock(async () => ({ data: rows, error: null })),
          })),
        })),
      })),
    })),
  }));
}

describe('EarningsService', () => {
  let service: EarningsService;

  beforeEach(() => {
    mockFrom.mockClear();
    service = new EarningsService();
  });

  it('returns zero summary when there are no bookings', async () => {
    setupBookingsQuery([]);
    const result = await service.getHostEarnings('host-1', '2026-01-01', '2026-12-31');
    expect(result.success).toBe(true);
    expect(result.data?.gross).toBe(0);
    expect(result.data?.net).toBe(0);
    expect(result.data?.pending).toBe(0);
    expect(result.data?.released).toBe(0);
  });

  it('correctly aggregates gross, fees, and net', async () => {
    setupBookingsQuery([
      { total_price: 100, status: 'Confirmed' },
      { total_price: 200, status: 'Completed' },
      { total_price: 300, status: 'Pending' },
    ]);
    const result = await service.getHostEarnings('host-1', '2026-01-01', '2026-12-31');
    expect(result.success).toBe(true);
    expect(result.data?.gross).toBe(600);
    expect(result.data?.platform_fees).toBe(30); // 5% of 600
    expect(result.data?.net).toBe(570); // 600 - 30
  });

  it('splits pending (in escrow) vs released correctly', async () => {
    setupBookingsQuery([
      { total_price: 400, status: 'Confirmed' },   // released
      { total_price: 200, status: 'Completed' },   // released
      { total_price: 300, status: 'Pending' },     // pending
    ]);
    const result = await service.getHostEarnings('host-1', '2026-01-01', '2026-12-31');
    expect(result.success).toBe(true);
    // released net = (400 + 200) * 0.95 = 570
    expect(result.data?.released).toBe(570);
    // pending net = 300 * 0.95 = 285
    expect(result.data?.pending).toBe(285);
  });

  it('returns error when hostId is missing', async () => {
    const result = await service.getHostEarnings('', '2026-01-01', '2026-12-31');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/hostId is required/);
  });

  it('returns error when date range is invalid (to before from)', async () => {
    const result = await service.getHostEarnings('host-1', '2026-06-01', '2026-01-01');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/to must be on or after from/);
  });

  it('returns error when date params are missing', async () => {
    const result = await service.getHostEarnings('host-1', '', '');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/from and to date range are required/);
  });

  it('handles a single released booking correctly', async () => {
    setupBookingsQuery([{ total_price: 1000, status: 'Confirmed' }]);
    const result = await service.getHostEarnings('host-1', '2026-01-01', '2026-12-31');
    expect(result.success).toBe(true);
    expect(result.data?.gross).toBe(1000);
    expect(result.data?.platform_fees).toBe(50);
    expect(result.data?.net).toBe(950);
    expect(result.data?.released).toBe(950);
    expect(result.data?.pending).toBe(0);
  });
});
