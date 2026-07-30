'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, AlertCircle, RefreshCw } from 'lucide-react';
import { useHostDashboard } from '@/hooks/useHostDashboard';
import DashboardSummaryCards from '@/components/dashboard/DashboardSummaryCards';
import HostPropertiesTable from '@/components/dashboard/HostPropertiesTable';
import BookingStats from './components/BookingStats';
import EarningsSummary from './components/EarningsSummary';
import PaymentMethods from './components/PaymentMethods';
import PayoutHistory from './components/PayoutHistory';
import RecentTransactions from './components/RecentTransactions';
import AvailableBalance from './components/AvailableBalance';
import AddPropertyModal from './components/AddPropertyModal';
import EarningsTrendChart from './components/EarningsTrendChart';
import ComparativeGrowth from './components/ComparativeGrowth';
import OccupancyInsights from './components/OccupancyInsights';
import OccupancyHeatmap from './components/OccupancyHeatmap';
import ExportReportButton from './components/ExportReportButton';
import { mockHostData } from './mockData';

export default function HostDashboard() {
  const [showAddProperty, setShowAddProperty] = useState(false);
  const {
    summary,
    properties,
    isLoadingSummary,
    isLoadingProperties,
    summaryError,
    propertiesError,
    refetchSummary,
    refetchProperties,
    updatePropertyStatus,
  } = useHostDashboard();

  const handleAddProperty = () => {
    setShowAddProperty(false);
    // Refresh both after adding
    refetchSummary();
    refetchProperties();
  };

  // For heatmap we use real property ids when available, fall back to mock while loading
  const heatmapProperties =
    properties.length > 0
      ? properties.map((p) => ({ id: p.id, title: p.title }))
      : mockHostData.properties.map((p) => ({ id: p.id, title: p.title }));

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Host Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage your properties and earnings
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ExportReportButton
              monthlyMetrics={mockHostData.monthlyMetrics}
              payoutHistory={mockHostData.payoutHistory}
            />
            <button
              onClick={() => setShowAddProperty(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              <Plus size={20} aria-hidden="true" />
              Add Property
            </button>
          </div>
        </div>

        {/* ── Real API: Dashboard Summary ────────────────────────────────── */}
        {isLoadingSummary ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-gray-200 dark:bg-gray-800 rounded-xl" />
            ))}
          </div>
        ) : summaryError ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 rounded-xl border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            <AlertCircle size={18} />
            <span>Could not load dashboard summary: {summaryError}</span>
            <button onClick={refetchSummary} className="ml-auto flex items-center gap-1 hover:underline">
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        ) : summary ? (
          <DashboardSummaryCards summary={summary} />
        ) : null}

        {/* Available Balance (kept from existing earnings flow) */}
        <AvailableBalance
          amount={summary?.net_revenue ?? mockHostData.earningsStats.pendingPayout}
          onWithdraw={() => console.log('Withdraw clicked')}
        />

        {/* Booking Stats — use real active count when available */}
        <BookingStats
          activeBookings={summary?.active_bookings ?? mockHostData.bookingStats.activeBookings}
          completedBookings={mockHostData.bookingStats.completedBookings}
          cancelledBookings={mockHostData.bookingStats.cancelledBookings}
          totalReviews={mockHostData.bookingStats.totalReviews}
        />

        {/* Earnings breakdown with period selector */}
        <EarningsSummary />

        {/* Analytics charts (keep mock for now — charting needs historical data) */}
        <EarningsTrendChart data={mockHostData.monthlyMetrics} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComparativeGrowth metrics={mockHostData.monthlyMetrics} />
          <OccupancyInsights occupancy={mockHostData.occupancy} />
        </div>

        {/* Occupancy heatmap */}
        {heatmapProperties.length > 0 && (
          <OccupancyHeatmap properties={heatmapProperties} />
        )}

        {/* ── Real API: Properties Table ─────────────────────────────────── */}
        <section aria-labelledby="properties-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="properties-heading"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Your Properties
            </h2>
            <Link
              href="/list"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              List a new property →
            </Link>
          </div>

          {isLoadingProperties ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl" />
              ))}
            </div>
          ) : propertiesError ? (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 rounded-xl border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle size={18} />
              <span>{propertiesError}</span>
              <button onClick={refetchProperties} className="ml-auto flex items-center gap-1 hover:underline">
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          ) : (
            <HostPropertiesTable
              properties={properties}
              onStatusChange={updatePropertyStatus}
            />
          )}
        </section>

        {/* Transactions and Payouts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentTransactions transactions={mockHostData.recentTransactions} />
          <PayoutHistory payouts={mockHostData.payoutHistory} />
        </div>

        {/* Payment Methods */}
        <PaymentMethods onAddMethod={() => console.log('Add payment method')} />
      </div>

      <AddPropertyModal
        isOpen={showAddProperty}
        onClose={() => setShowAddProperty(false)}
        onSubmit={handleAddProperty}
      />
    </main>
  );
}
