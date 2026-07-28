'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useDashboard, type BookingStatus, type BookingSort, type BookingOrder } from '@/hooks/useDashboard';
import BookingHistory from '@/components/dashboard/BookingHistory';
import Analytics from '@/components/dashboard/Analytics';
import NotificationSystem from '@/components/dashboard/NotificationSystem';
import WalletTransaction from './components/WalletTransaction';
import BookingPreferences from './components/BookingPreferences';
import ExportBookingsButton from './components/ExportBookingsButton';

export default function TenantDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = (searchParams.get('status') as BookingStatus) ?? null;
  const sort = (searchParams.get('sort') as BookingSort) ?? 'created';
  const order = (searchParams.get('order') as BookingOrder) ?? 'desc';

  const { bookings, isLoading, error } = useDashboard(20, statusFilter, sort, order);

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`?${params.toString()}`);
  }

  const mockTransactions = [
    {
      id: '1',
      type: 'sent' as const,
      amount: 600,
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      description: 'Booking payment - Downtown Apartment',
    },
    {
      id: '2',
      type: 'received' as const,
      amount: 100,
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      description: 'Refund - Cancelled booking',
    },
  ];

  const formattedBookings = bookings.map((booking) => ({
    id: booking.id,
    propertyTitle: 'Property Name',
    location: 'City, State',
    checkIn: new Date(booking.check_in),
    checkOut: new Date(booking.check_out),
    totalPrice: booking.total_price,
    status: booking.status as 'pending' | 'confirmed' | 'completed' | 'cancelled',
    escrowStatus: booking.escrow_status as 'locked' | 'released' | 'refunded',
  }));

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tenant Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage your bookings and transactions</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportBookingsButton bookings={formattedBookings} />
            <NotificationSystem />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-8 text-gray-500">
            Loading your dashboard...
          </div>
        )}

        {/* Content */}
        {!isLoading && !error && (
          <>
            {/* Booking History with filters */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Bookings</h2>
              <BookingHistory
                bookings={formattedBookings}
                statusFilter={statusFilter}
                sort={sort}
                order={order}
                onStatusChange={(s) => updateParam('status', s)}
                onSortChange={(s) => updateParam('sort', s)}
                onOrderChange={(o) => updateParam('order', o)}
              />
            </div>

            {/* Analytics and Transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Analytics />
              <WalletTransaction transactions={mockTransactions} />
            </div>

            {/* Booking Preferences */}
            <BookingPreferences bookings={formattedBookings} />
          </>
        )}
      </div>
    </main>
  );
}
