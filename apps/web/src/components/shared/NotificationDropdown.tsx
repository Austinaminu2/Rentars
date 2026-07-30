'use client';

import { useNotifications } from '@/hooks/useNotifications';

const LABELS: Record<string, string> = {
  booking_created: 'New booking created',
  booking_confirmed: 'Booking confirmed',
  booking_cancelled: 'Booking cancelled',
  payment_received: 'Payment received',
  booking_reminder: 'Booking reminder',
  review_requested: 'Review requested',
  review_submitted: 'New review submitted',
  host_response: 'Host responded to your review',
  dispute_initiated: 'Dispute initiated',
  new_property: 'New listing from a host you follow',
  system_alert: 'System alert',
};

interface NotificationDropdownProps {
  userId?: string;
  onClose: () => void;
}

export default function NotificationDropdown({ userId, onClose }: NotificationDropdownProps) {
  const { notifications, markRead, markAllRead } = useNotifications(userId);

  return (
    <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <span className="font-semibold text-sm">Notifications</span>
        <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
          Mark all read
        </button>
      </div>

      <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
        {notifications.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-500">No notifications</li>
        )}
        {notifications.map((n) => (
          <li
            key={n.id}
            onClick={() => { markRead(n.id); onClose(); }}
            className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition ${!n.read ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
          >
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {LABELS[n.type] ?? n.type}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(n.created_at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
