import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealTimeUpdates } from '../useRealTimeUpdates';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Flush all pending microtasks and macro-timers at once. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

// ── Supabase channel mock ─────────────────────────────────────────────────────

type StatusCallback = (status: string) => void;

/**
 * Build a controllable channel mock.
 * `triggerStatus(s)` lets tests simulate SUBSCRIBED / CHANNEL_ERROR / CLOSED.
 */
function makeChannelMock() {
  let _statusCb: StatusCallback | null = null;

  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockImplementation((cb?: StatusCallback) => {
      if (cb) _statusCb = cb;
      return channel;
    }),
    triggerStatus: (status: string) => _statusCb?.(status),
    unsubscribe: vi.fn(),
  };

  return channel;
}

// Shared mocks – reset before each test
let channelMock = makeChannelMock();
const removeChannelMock = vi.fn();
const supabaseMock = {
  channel: vi.fn(() => channelMock),
  removeChannel: removeChannelMock,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseMock),
}));

// ── fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useRealTimeUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });

    channelMock = makeChannelMock();
    supabaseMock.channel.mockReturnValue(channelMock);

    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  // ── Initial connection ───────────────────────────────────────────────────

  it('starts as "disconnected" before the channel is subscribed', () => {
    const { result } = renderHook(() => useRealTimeUpdates({ userId: 'u1' }));
    // status is set after SUBSCRIBED callback fires – not yet
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('becomes "connected" when the channel reports SUBSCRIBED', async () => {
    const { result } = renderHook(() => useRealTimeUpdates({ userId: 'u1' }));

    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    expect(result.current.connectionStatus).toBe('connected');
  });

  // ── Disconnect detection ─────────────────────────────────────────────────

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    'transitions to "reconnecting" on status %s',
    async (badStatus) => {
      const { result } = renderHook(() => useRealTimeUpdates({ userId: 'u1' }));

      // First connect
      await act(async () => {
        channelMock.triggerStatus('SUBSCRIBED');
        await Promise.resolve();
      });
      expect(result.current.connectionStatus).toBe('connected');

      // Then drop
      await act(async () => {
        channelMock.triggerStatus(badStatus);
        await Promise.resolve();
      });

      expect(result.current.connectionStatus).toBe('reconnecting');
    },
  );

  // ── Exponential backoff ──────────────────────────────────────────────────

  it('schedules reconnect after a disconnect with delay ≥ 1 s', async () => {
    renderHook(() => useRealTimeUpdates({ userId: 'u1' }));

    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    // Simulate drop
    const newChannel = makeChannelMock();
    supabaseMock.channel.mockReturnValue(newChannel);

    await act(async () => {
      channelMock.triggerStatus('CHANNEL_ERROR');
      await Promise.resolve();
    });

    // Before the backoff timer fires, channel() should NOT have been called again
    const callsBefore = supabaseMock.channel.mock.calls.length;

    // Advance past the first backoff window (≥ 1 s base + jitter headroom)
    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    expect(supabaseMock.channel.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('resets the retry counter to 0 after a successful reconnect', async () => {
    const { result } = renderHook(() => useRealTimeUpdates({ userId: 'u1' }));

    // Connect → drop → reconnect
    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    const newChannel = makeChannelMock();
    supabaseMock.channel.mockReturnValue(newChannel);

    await act(async () => {
      channelMock.triggerStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    await act(async () => {
      newChannel.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    expect(result.current.connectionStatus).toBe('connected');
  });

  // ── Missed-message catch-up ──────────────────────────────────────────────

  it('calls onMissedNotifications with fresh items on reconnect', async () => {
    const onMissedNotifications = vi.fn();
    const missedItems = [
      { id: 'n-missed-1', created_at: '2024-06-01T10:01:00Z' },
      { id: 'n-missed-2', created_at: '2024-06-01T10:02:00Z' },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: missedItems, nextCursor: null }),
    });

    // Simulate having seen a previous notification
    const { result } = renderHook(() =>
      useRealTimeUpdates({ userId: 'u1', onMissedNotifications }),
    );

    // First connect — catch-up fires but lastSeenAt is null, so fetch is skipped
    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    // Manually seed the last-seen timestamp by triggering a postgres_changes callback
    // We do this by calling the `on` handler directly via the mock
    const onCall = channelMock.on.mock.calls[0];
    const [, , pgHandler] = onCall as [unknown, unknown, (p: unknown) => void];
    act(() => {
      pgHandler({
        eventType: 'UPDATE',
        new: { id: 'prev-id', updated_at: '2024-06-01T10:00:00Z' },
      });
    });

    // Now simulate a reconnect
    const newChannel = makeChannelMock();
    supabaseMock.channel.mockReturnValue(newChannel);

    await act(async () => {
      channelMock.triggerStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    await act(async () => {
      newChannel.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    // Flush the async catch-up fetch
    await flush();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/notifications?'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    expect(onMissedNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'n-missed-1' }),
        expect.objectContaining({ id: 'n-missed-2' }),
      ]),
    );
  });

  it('deduplicates the last-seen id from catch-up results', async () => {
    const onMissedNotifications = vi.fn();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'already-seen', created_at: '2024-06-01T10:01:00Z' },
          { id: 'new-one', created_at: '2024-06-01T10:02:00Z' },
        ],
        nextCursor: null,
      }),
    });

    renderHook(() =>
      useRealTimeUpdates({ userId: 'u1', onMissedNotifications }),
    );

    // Seed last-seen with 'already-seen'
    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    const [, , pgHandler] = channelMock.on.mock.calls[0] as [
      unknown,
      unknown,
      (p: unknown) => void,
    ];
    act(() => {
      pgHandler({
        eventType: 'UPDATE',
        new: { id: 'already-seen', updated_at: '2024-06-01T10:01:00Z' },
      });
    });

    const newChannel = makeChannelMock();
    supabaseMock.channel.mockReturnValue(newChannel);

    await act(async () => {
      channelMock.triggerStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    await act(async () => {
      newChannel.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    await flush();

    // Only 'new-one' should be passed — 'already-seen' is deduplicated
    expect(onMissedNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'new-one' }),
    ]);
  });

  it('does not call onMissedNotifications when catch-up fetch returns empty', async () => {
    const onMissedNotifications = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], nextCursor: null }),
    });

    renderHook(() =>
      useRealTimeUpdates({ userId: 'u1', onMissedNotifications }),
    );

    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    // Seed a last-seen timestamp
    const [, , pgHandler] = channelMock.on.mock.calls[0] as [
      unknown,
      unknown,
      (p: unknown) => void,
    ];
    act(() => {
      pgHandler({
        eventType: 'UPDATE',
        new: { id: 'n-prev', updated_at: '2024-06-01T10:00:00Z' },
      });
    });

    const newChannel = makeChannelMock();
    supabaseMock.channel.mockReturnValue(newChannel);

    await act(async () => {
      channelMock.triggerStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    await act(async () => {
      newChannel.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    await flush();

    expect(onMissedNotifications).not.toHaveBeenCalled();
  });

  it('does not fetch catch-up when no userId is provided', async () => {
    renderHook(() => useRealTimeUpdates({}));

    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────

  it('cleans up channels on unmount and cancels pending reconnect timer', async () => {
    const { unmount } = renderHook(() => useRealTimeUpdates({ userId: 'u1' }));

    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    // Trigger a disconnect so a timer is queued
    await act(async () => {
      channelMock.triggerStatus('CHANNEL_ERROR');
      await Promise.resolve();
    });

    // Unmount before timer fires
    unmount();

    // Advance past the backoff window — no new channel() calls should happen
    const callsAtUnmount = supabaseMock.channel.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(supabaseMock.channel.mock.calls.length).toBe(callsAtUnmount);
  });

  // ── Graceful degradation ─────────────────────────────────────────────────

  it('logs a warning and stays disconnected when Supabase credentials are absent', () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useRealTimeUpdates({ userId: 'u1' }));

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('credentials not configured'),
    );

    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    warnSpy.mockRestore();
  });

  it('silently ignores a failed catch-up fetch and stays connected', async () => {
    const onMissedNotifications = vi.fn();
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useRealTimeUpdates({ userId: 'u1', onMissedNotifications }),
    );

    await act(async () => {
      channelMock.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    const [, , pgHandler] = channelMock.on.mock.calls[0] as [
      unknown,
      unknown,
      (p: unknown) => void,
    ];
    act(() => {
      pgHandler({
        eventType: 'UPDATE',
        new: { id: 'n-x', updated_at: '2024-06-01T09:00:00Z' },
      });
    });

    const newChannel = makeChannelMock();
    supabaseMock.channel.mockReturnValue(newChannel);

    await act(async () => {
      channelMock.triggerStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    await act(async () => {
      newChannel.triggerStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    await flush();

    // Channel recovers regardless of the failed catch-up
    expect(result.current.connectionStatus).toBe('connected');
    expect(onMissedNotifications).not.toHaveBeenCalled();
  });
});
