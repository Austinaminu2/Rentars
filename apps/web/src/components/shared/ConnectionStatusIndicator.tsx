'use client';

import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import type { ConnectionStatus } from '@/hooks/useRealTimeUpdates';

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  /** If true, show a text label beside the icon. Defaults to false. */
  showLabel?: boolean;
  className?: string;
}

const CONFIG = {
  connected: {
    icon: Wifi,
    label: 'Live',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    title: 'Real-time updates connected',
  },
  reconnecting: {
    icon: RefreshCw,
    label: 'Reconnecting…',
    dot: 'bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    title: 'Reconnecting to real-time updates',
  },
  disconnected: {
    icon: WifiOff,
    label: 'Offline',
    dot: 'bg-gray-400',
    text: 'text-gray-500 dark:text-gray-400',
    title: 'Real-time updates disconnected',
  },
} as const satisfies Record<ConnectionStatus, object>;

/**
 * Subtle pill/icon that reflects the current real-time channel state.
 *
 * Usage:
 * ```tsx
 * const { connectionStatus } = useRealTimeUpdates({ userId });
 * <ConnectionStatusIndicator status={connectionStatus} />
 * ```
 */
export function ConnectionStatusIndicator({
  status,
  showLabel = false,
  className = '',
}: ConnectionStatusIndicatorProps) {
  const cfg = CONFIG[status];
  const Icon = cfg.icon;
  const isSpinning = status === 'reconnecting';

  return (
    <span
      role="status"
      aria-label={cfg.title}
      title={cfg.title}
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {status === 'connected' && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
            aria-hidden="true"
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${cfg.dot}`}
          aria-hidden="true"
        />
      </span>

      {/* Icon */}
      <Icon
        size={13}
        aria-hidden="true"
        className={`${cfg.text} ${isSpinning ? 'animate-spin' : ''}`}
      />

      {/* Optional label */}
      {showLabel && (
        <span className={`text-xs font-medium leading-none ${cfg.text}`}>
          {cfg.label}
        </span>
      )}
    </span>
  );
}
