'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = 3_000;
const DELAYED_CONFIRMATION_THRESHOLD_MS = 15_000;

export type PaymentStatusValue =
  | 'idle'
  | 'awaiting_wallet_approval'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'timed_out';

interface PaymentStatusProps {
  /** Payment ID returned from /api/v1/payments/submit */
  paymentId?: string;
  /** Called when user explicitly asks to retry */
  onRetry?: () => void;
  /** Called when user cancels after failure */
  onCancel?: () => void;
  /** Controlled status override (e.g. 'awaiting_wallet_approval' before submitting) */
  status?: PaymentStatusValue;
  /** TX hash if already known */
  txHash?: string;
}

const STATE_CONFIG: Record<
  PaymentStatusValue,
  { icon: string; title: string; description: string; color: string }
> = {
  idle: {
    icon: '💳',
    title: 'Ready to Pay',
    description: 'Confirm your booking to proceed with payment.',
    color: 'text-gray-600',
  },
  awaiting_wallet_approval: {
    icon: '🔐',
    title: 'Waiting for Wallet Approval',
    description: 'Please approve the transaction in your Freighter wallet.',
    color: 'text-blue-600',
  },
  submitted: {
    icon: '⏳',
    title: 'Payment Submitted',
    description: 'Your payment is being confirmed on the Stellar network.',
    color: 'text-yellow-600',
  },
  confirmed: {
    icon: '✅',
    title: 'Payment Confirmed',
    description: 'Your USDC payment has been confirmed on Stellar.',
    color: 'text-green-600',
  },
  failed: {
    icon: '❌',
    title: 'Payment Failed',
    description: 'Your payment could not be processed. Please try again.',
    color: 'text-red-600',
  },
  timed_out: {
    icon: '⏱️',
    title: 'Payment Timed Out',
    description: 'Stellar confirmation took too long. Your funds have not been charged.',
    color: 'text-orange-600',
  },
};

/**
 * PaymentStatus — displays the current state of a USDC payment with polling.
 *
 * When `paymentId` is provided and status is 'submitted', this component
 * polls GET /api/v1/payments/:id/status every 3 seconds until confirmed,
 * failed, or timed_out.
 *
 * After 15 seconds in 'submitted', shows a delayed-confirmation banner.
 */
export function PaymentStatus({
  paymentId,
  onRetry,
  onCancel,
  status: controlledStatus,
  txHash: initialTxHash,
}: PaymentStatusProps) {
  const [internalStatus, setInternalStatus] = useState<PaymentStatusValue>('idle');
  const [txHash, setTxHash] = useState<string | undefined>(initialTxHash);
  const [isDelayed, setIsDelayed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = controlledStatus ?? internalStatus;
  const config = STATE_CONFIG[status];

  // Poll for status updates while submitted
  useEffect(() => {
    if (!paymentId || status !== 'submitted') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const token = localStorage.getItem('token');

    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/payments/${paymentId}/status`, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { status: PaymentStatusValue; txHash?: string };
        if (json.txHash) setTxHash(json.txHash);
        if (json.status !== 'submitted') {
          setInternalStatus(json.status);
          if (pollRef.current) clearInterval(pollRef.current);
          if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
        }
      } catch {
        // network error — keep polling
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll(); // immediate first check

    // Show delayed-confirmation banner after 15 seconds
    delayTimerRef.current = setTimeout(() => setIsDelayed(true), DELAYED_CONFIRMATION_THRESHOLD_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      setIsDelayed(false);
    };
  }, [paymentId, status]);

  const showRetry = status === 'failed' || status === 'timed_out';
  const showCancel = status === 'failed' || status === 'timed_out';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Payment status: ${config.title}`}
      className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm"
    >
      {/* Status icon */}
      <span className="text-5xl" aria-hidden="true">
        {config.icon}
      </span>

      {/* Status title */}
      <h2 className={`text-xl font-semibold ${config.color}`}>{config.title}</h2>

      {/* Description */}
      <p className="max-w-sm text-sm text-gray-600">{config.description}</p>

      {/* Delayed confirmation banner */}
      {status === 'submitted' && isDelayed && (
        <div
          role="alert"
          className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800 max-w-sm"
        >
          Your payment is being confirmed on the Stellar network. This may take up to 60 seconds.
        </div>
      )}

      {/* Spinner for in-progress states */}
      {(status === 'awaiting_wallet_approval' || status === 'submitted') && (
        <div
          aria-hidden="true"
          className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
        />
      )}

      {/* TX hash link */}
      {txHash && status === 'confirmed' && (
        <a
          href={
            process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
              ? `https://stellar.expert/explorer/public/tx/${txHash}`
              : `https://stellar.expert/explorer/testnet/tx/${txHash}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline font-mono"
        >
          View on Stellar Explorer ↗
        </a>
      )}

      {/* Action buttons */}
      {(showRetry || showCancel) && (
        <div className="flex gap-3">
          {showRetry && onRetry && (
            <Button onClick={onRetry} variant="default">
              Retry Payment
            </Button>
          )}
          {showCancel && onCancel && (
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
