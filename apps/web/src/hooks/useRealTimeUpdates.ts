'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ── Reconnection config ────────────────────────────────────────────────────────

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

/** Exponential backoff with ±25 % jitter so concurrent clients don't stampede. */
function calcDelay(attempt: number): number {
  const base = Math.min(
    BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, attempt),
    BACKOFF_MAX_MS,
  );
  const jitter = base * 0.25 * (Math.random() * 2 - 1); // ±25 %
  return Math.max(0, base + jitter);
}

// ── Connection status ──────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

// ── Public API ─────────────────────────────────────────────────────────────────

export interface RealtimeOptions {
  userId?: string;
  onBookingStatusChange?: (booking: unknown) => void;
  onNewBookingNotification?: (booking: unknown) => void;
  onEscrowStatusChange?: (escrow: unknown) => void;
  /** Called with notifications missed while disconnected, deduplicated. */
  onMissedNotifications?: (notifications: unknown[]) => void;
}

export interface RealtimeResult {
  /** Current connection status of the real-time channel. */
  connectionStatus: ConnectionStatus;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useRealTimeUpdates(options: RealtimeOptions = {}): RealtimeResult {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  // Keep a stable ref to options so the subscription effect doesn't need to
  // re-run every time the caller passes a new object literal.
  const optionsRef = useRef<RealtimeOptions>(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Persists across reconnection cycles
  const lastSeenIdRef = useRef<string | null>(null);
  const lastSeenAtRef = useRef<string | null>(null);

  // Reconnection bookkeeping
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Keep the current Supabase client and its channel subscriptions
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const subscriptionsRef = useRef<ReturnType<
    ReturnType<ReturnType<typeof createClient>['channel']>['subscribe']
  >[]>([]);

  /** Fetch notifications created after lastSeenAt and merge them in. */
  const catchUpMissedNotifications = useCallback(async () => {
    const { userId, onMissedNotifications } = optionsRef.current;
    if (!userId || !lastSeenAtRef.current) return;

    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;

    try {
      const params = new URLSearchParams({ after: lastSeenAtRef.current, limit: '50' });
      const res = await fetch(
        `${API_URL}/api/v1/notifications?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;

      const body: unknown = await res.json();
      const items = Array.isArray(body)
        ? body
        : Array.isArray((body as { data?: unknown[] }).data)
          ? (body as { data: unknown[] }).data
          : [];

      if (items.length === 0) return;

      // Deduplicate against the last seen id
      const fresh = items.filter((n) => {
        const item = n as { id?: string };
        return item.id !== lastSeenIdRef.current;
      });

      if (fresh.length > 0) {
        onMissedNotifications?.(fresh);
      }
    } catch {
      // Network errors during catch-up are non-fatal; data will arrive later
    }
  }, []);

  const cleanup = useCallback(() => {
    subscriptionsRef.current.forEach((sub) => {
      try {
        // RealtimeChannel returned by .subscribe() — remove it from the client
        supabaseRef.current?.removeChannel(sub as Parameters<typeof supabaseRef.current.removeChannel>[0]);
      } catch {
        /* ignore */
      }
    });
    subscriptionsRef.current = [];
  }, []);

  const connect = useCallback(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[useRealTimeUpdates] Supabase credentials not configured');
      return;
    }

    cleanup();

    try {
      if (!supabaseRef.current) {
        supabaseRef.current = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }

      const { userId } = optionsRef.current;

      // ── Booking status changes ───────────────────────────────────────────────
      const bookingChannel = supabaseRef.current
        .channel('rt-bookings')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: userId ? `tenant_id=eq.${userId}` : undefined,
          },
          (payload) => {
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as { id?: string; updated_at?: string };
              if (row.id) lastSeenIdRef.current = row.id;
              if (row.updated_at) lastSeenAtRef.current = row.updated_at;
              optionsRef.current.onBookingStatusChange?.(payload.new);
              toast.success('Booking status updated');
            }
          },
        )
        .subscribe((status) => {
          if (!isMountedRef.current) return;

          if (status === 'SUBSCRIBED') {
            retryAttemptRef.current = 0;
            setConnectionStatus('connected');
            catchUpMissedNotifications();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnectionStatus('reconnecting');
            scheduleReconnect();
          }
        });

      subscriptionsRef.current.push(bookingChannel as unknown as ReturnType<
        ReturnType<ReturnType<typeof createClient>['channel']>['subscribe']
      >);

      // ── Host new-booking notifications ───────────────────────────────────────
      if (userId) {
        const hostChannel = supabaseRef.current
          .channel('rt-host-notifications')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'bookings',
              filter: `owner_id=eq.${userId}`,
            },
            (payload) => {
              const row = payload.new as { id?: string; created_at?: string };
              if (row.id) lastSeenIdRef.current = row.id;
              if (row.created_at) lastSeenAtRef.current = row.created_at;
              optionsRef.current.onNewBookingNotification?.(payload.new);
              toast.success('New booking received!');
            },
          )
          .subscribe();

        subscriptionsRef.current.push(hostChannel as unknown as ReturnType<
          ReturnType<ReturnType<typeof createClient>['channel']>['subscribe']
        >);
      }

      // ── Escrow status updates ────────────────────────────────────────────────
      const escrowChannel = supabaseRef.current
        .channel('rt-escrow-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'escrow_transactions',
          },
          (payload) => {
            const row = payload.new as { id?: string; updated_at?: string; status?: string };
            if (row.id) lastSeenIdRef.current = row.id;
            if (row.updated_at) lastSeenAtRef.current = row.updated_at;
            optionsRef.current.onEscrowStatusChange?.(payload.new);
            if (payload.eventType === 'UPDATE') {
              if (row.status === 'released') toast.success('Escrow released!');
              else if (row.status === 'locked') toast('Escrow locked');
            }
          },
        )
        .subscribe();

      subscriptionsRef.current.push(escrowChannel as unknown as ReturnType<
        ReturnType<ReturnType<typeof createClient>['channel']>['subscribe']
      >);

    } catch (error) {
      console.error('[useRealTimeUpdates] Failed to set up subscriptions:', error);
      setConnectionStatus('reconnecting');
      scheduleReconnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup, catchUpMissedNotifications]);

  // Forward-declare so connect() can reference it before it's defined
  // (the real implementation is assigned below)
  // eslint-disable-next-line prefer-const
  let scheduleReconnect: () => void;

  // eslint-disable-next-line prefer-const
  scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

    const attempt = retryAttemptRef.current;
    const delay = calcDelay(attempt);
    retryAttemptRef.current = attempt + 1;

    console.log(
      `[useRealTimeUpdates] Reconnecting in ${Math.round(delay)}ms (attempt ${attempt + 1})`,
    );

    retryTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) connect();
    }, delay);
  }, [connect]);

  // ── Mount / unmount ──────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[useRealTimeUpdates] Supabase credentials not configured');
      return;
    }

    connect();

    return () => {
      isMountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      cleanup();
    };
    // connect / cleanup are stable callbacks — intentional dep list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connectionStatus };
}
