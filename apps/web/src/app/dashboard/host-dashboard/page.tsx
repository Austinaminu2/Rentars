'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import BookingStats from './components/BookingStats';
import EarningsStats from './components/EarningsStats';
import EarningsSummary from './components/EarningsSummary';
import PaymentMethods from './components/PaymentMethods';
import PayoutHistory from './components/PayoutHistory';
import RecentTransactions from './components/RecentTransactions';
import AvailableBalance from './components/AvailableBalance';
import AddPropertyModal from './components/AddPropertyModal';
import PropertyList from './components/PropertyList';
import EarningsTrendChart from './components/EarningsTrendChart';
import ComparativeGrowth from './components/ComparativeGrowth';
import OccupancyInsights from './components/OccupancyInsights';
import OccupancyHeatmap from './components/OccupancyHeatmap';
import ExportReportButton from './components/ExportReportButton';
import { mockHostData } from './mockData';

export default function HostDashboard() {
  const [showAddProperty, setShowAddProperty] = useState(false);

  const handleAddProperty = (data: {
    title: string;
    location: string;
    pricePerNight: number;
    description: string;
  }) => {
    console.log('Adding property:', data);
    setShowAddProperty(false);
    // API call would go here
  };

  // Shape mockData.properties into the minimal { id, title } form the heatmap expects.
  // In production these would come from the real API; mock ids are strings.
  const heatmapProperties = mockHostData.properties.map((p) => ({
    id:    p.id,
    title: p.title,
  }));

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Host Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage your properties and earnings</p>
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

        {/* Available Balance */}
        <AvailableBalance
          amount={mockHostData.earningsStats.pendingPayout}
          onWithdraw={() => console.log('Withdraw clicked')}
        />

        {/* Stats */}
        <BookingStats {...mockHostData.bookingStats} />
        <EarningsStats {...mockHostData.earningsStats} />

        {/* Earnings breakdown with period selector */}
        <EarningsSummary />

        {/* Analytics */}
        <EarningsTrendChart data={mockHostData.monthlyMetrics} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComparativeGrowth metrics={mockHostData.monthlyMetrics} />
          <OccupancyInsights occupancy={mockHostData.occupancy} />
        </div>

        {/* Occupancy heatmap — host-only; the API enforces the ownership gate */}
        {heatmapProperties.length > 0 && (
          <OccupancyHeatmap properties={heatmapProperties} />
        )}

        {/* Properties */}
        <PropertyList properties={mockHostData.properties} />

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
