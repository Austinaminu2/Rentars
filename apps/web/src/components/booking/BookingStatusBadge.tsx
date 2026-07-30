import type { BookingStatus } from '@/types/booking';
import { normaliseStatus } from '@/types/booking';

interface BadgeProps {
  status: BookingStatus | string;
  className?: string;
}

const CONFIG: Record<string, { label: string; classes: string }> = {
  pending:   { label: 'Pending',   classes: 'bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300' },
  confirmed: { label: 'Confirmed', classes: 'bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300'  },
  completed: { label: 'Completed', classes: 'bg-green-100  text-green-800  dark:bg-green-900/40  dark:text-green-300' },
  cancelled: { label: 'Cancelled', classes: 'bg-gray-100   text-gray-600   dark:bg-gray-700/40   dark:text-gray-400'  },
  disputed:  { label: 'Disputed',  classes: 'bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300'   },
};

/**
 * Small pill badge that reflects the current booking lifecycle state.
 * Normalises both title-case (from the API) and lowercase inputs.
 */
export default function BookingStatusBadge({ status, className = '' }: BadgeProps) {
  const key    = normaliseStatus(String(status));
  const config = CONFIG[key] ?? { label: String(status), classes: 'bg-gray-100 text-gray-600' };

  return (
    <span
      role="status"
      aria-label={`Booking status: ${config.label}`}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes} ${className}`}
    >
      {config.label}
    </span>
  );
}
