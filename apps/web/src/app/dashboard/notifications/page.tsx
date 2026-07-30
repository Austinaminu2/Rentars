'use client';

import NotificationPreferences from '@/components/shared/NotificationPreferences';
import { type AppNotification, useNotifications } from '@/hooks/useNotifications';
import { Bell, CheckCheck, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';

const TYPE_LABELS: Record<string, string> = {
  booking_created: 'New Booking',
  booking_confirmed: 'Booking Confirmed',
  booking_cancelled: 'Booking Cancelled',
  payment_received: 'Payment Received',
  booking_reminder: 'Booking Reminder',
  review_requested: 'Review Requested',
  review_submitted: 'New Review',
  host_response: 'Host Response',
  dispute_initiated: 'Dispute Initiated',
  new_property: 'New Listing',
  system_alert: 'System Alert',
};

type FilterType = 'all' | 'unread';

export default function NotificationsPage() {
  const { notifications, isLoading, unreadCount, markRead, markAllRead, removeNotification } =
    useNotifications();
  const [filter, setFilter] = useState<FilterType>('all');
  const [showSettings, setShowSettings] = useState(false);

  const displayed = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell size={24} className="text-gray-700 dark:text-gray-200" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition"
          aria-label="Notification settings"
        >
          <Settings size={18} />
          Settings
        </button>
      </div>

      {showSettings && (
        <div className="mb-8">
          <NotificationPreferences />
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all', 'unread'] as FilterType[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <CheckCheck size={16} />
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && displayed.length === 0 && (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Bell size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No notifications</p>
            <p className="text-sm mt-1">
              {filter === 'unread' ? 'All caught up!' : "You're all set."}
            </p>
          </div>
        )}

        {displayed.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onRead={markRead}
            onRemove={removeNotification}
          />
        ))}
      </div>
    </div>
  );
}

interface NotificationItemProps {
  notification: AppNotification;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
}

function NotificationItem({ notification: n, onRead, onRemove }: NotificationItemProps) {
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border transition ${
        !n.read
          ? 'bg-blue-50 dark:bg-blue-950 border-blue-100 dark:border-blue-900'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
      }`}
    >
      {!n.read && (
        <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          disabled={n.read}
          onClick={() => onRead(n.id)}
          className="w-full text-left"
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {TYPE_LABELS[n.type] ?? n.type}
          </p>
          {n.data?.message && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
              {String(n.data.message)}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
        </button>
      </div>
      <button
        type="button"
        onClick={() => onRemove(n.id)}
        className="shrink-0 p-1 text-gray-400 hover:text-red-500 transition rounded"
        aria-label="Remove notification"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
