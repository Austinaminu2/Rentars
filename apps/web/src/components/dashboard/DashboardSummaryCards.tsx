'use client';

import { Home, Calendar, TrendingUp, Clock } from 'lucide-react';
import type { DashboardSummary } from '@/hooks/useHostDashboard';

interface Props {
  summary: DashboardSummary;
}

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  description: string;
  color: string;
}

export default function DashboardSummaryCards({ summary }: Props) {
  const cards: StatCard[] = [
    {
      label: 'Total Properties',
      value: summary.total_properties,
      icon: <Home size={22} />,
      description: 'Properties you manage',
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400',
    },
    {
      label: 'Active Bookings',
      value: summary.active_bookings,
      icon: <Calendar size={22} />,
      description: 'Guests currently checked in',
      color: 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400',
    },
    {
      label: 'Upcoming (7 days)',
      value: summary.upcoming_reservations,
      icon: <Clock size={22} />,
      description: 'Check-ins in the next week',
      color: 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400',
    },
    {
      label: 'Net Revenue',
      value: `${summary.net_revenue.toLocaleString()} USDC`,
      icon: <TrendingUp size={22} />,
      description: `Gross: ${summary.total_revenue.toLocaleString()} USDC (after 5% fee)`,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-start gap-4"
        >
          <div className={`p-2 rounded-lg ${card.color}`} aria-hidden="true">
            {card.icon}
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{card.value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{card.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
