'use client';

import BookingCard from '@/app/dashboard/tenant-dashboard/components/BookingCard';
import type { BookingStatus, BookingSort, BookingOrder } from '@/hooks/useDashboard';

const STATUS_OPTIONS: { label: string; value: BookingStatus }[] = [
  { label: 'All', value: null },
  { label: 'Upcoming', value: 'pending' },
  { label: 'Active', value: 'confirmed' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Disputed', value: 'disputed' },
];

const SORT_OPTIONS: { label: string; value: BookingSort }[] = [
  { label: 'Date Created', value: 'created' },
  { label: 'Check-in Date', value: 'date' },
  { label: 'Price', value: 'price' },
];

interface BookingHistoryProps {
  bookings: Array<{
    id: string;
    propertyTitle: string;
    location: string;
    checkIn: Date;
    checkOut: Date;
    totalPrice: number;
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    escrowStatus: 'locked' | 'released' | 'refunded';
    thumbnail?: string;
  }>;
  statusFilter: BookingStatus;
  sort: BookingSort;
  order: BookingOrder;
  onStatusChange: (status: BookingStatus) => void;
  onSortChange: (sort: BookingSort) => void;
  onOrderChange: (order: BookingOrder) => void;
}

export default function BookingHistory({
  bookings,
  statusFilter,
  sort,
  order,
  onStatusChange,
  onSortChange,
  onOrderChange,
}: BookingHistoryProps) {
  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => onStatusChange(opt.value)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition ${
              statusFilter === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Sort:</label>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as BookingSort)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onOrderChange(order === 'asc' ? 'desc' : 'asc')}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            aria-label={`Sort ${order === 'asc' ? 'descending' : 'ascending'}`}
          >
            {order === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        </div>
      </div>

      {/* Booking grid or empty state */}
      {bookings.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
          {statusFilter ? (
            <p className="text-gray-500 dark:text-gray-400">
              No {statusFilter} bookings found. Try a different filter.
            </p>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">No bookings yet. Start exploring properties!</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} {...booking} />
          ))}
        </div>
      )}
    </div>
  );
}
