'use client';

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Clock, CheckCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface EarningsSummaryData {
  gross: number;
  platform_fees: number;
  net: number;
  pending: number;
  released: number;
}

const PERIOD_OPTIONS = [
  { label: 'This month', days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'This year', days: 365 },
];

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function EarningsSummary() {
  const [periodDays, setPeriodDays] = useState(30);
  const [data, setData] = useState<EarningsSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;

    const to = new Date();
    const from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    setLoading(true);
    setError(null);

    fetch(
      `${API_URL}/api/v1/host/earnings?from=${isoDate(from)}&to=${isoDate(to)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((r) => (r.ok ? r.json() : r.json().then((b: { error?: string }) => Promise.reject(b.error ?? 'Failed'))))
      .then((d: EarningsSummaryData) => setData(d))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [periodDays]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Earnings Summary</h2>
        <select
          value={periodDays}
          onChange={(e) => setPeriodDays(Number(e.target.value))}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.days} value={opt.days}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading earnings…</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {data && !loading && (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <DollarSign size={20} className="text-blue-600 mt-0.5" />
            <div>
              <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">Gross Revenue</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-200">{data.gross} USDC</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <TrendingUp size={20} className="text-green-600 mt-0.5" />
            <div>
              <p className="text-xs text-green-700 dark:text-green-400 font-medium">Net Earnings</p>
              <p className="text-xl font-bold text-green-900 dark:text-green-200">{data.net} USDC</p>
              <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
                Platform fees: {data.platform_fees} USDC
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <Clock size={20} className="text-yellow-600 mt-0.5" />
            <div>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Pending (In Escrow)</p>
              <p className="text-xl font-bold text-yellow-900 dark:text-yellow-200">{data.pending} USDC</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <CheckCircle size={20} className="text-purple-600 mt-0.5" />
            <div>
              <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">Released</p>
              <p className="text-xl font-bold text-purple-900 dark:text-purple-200">{data.released} USDC</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
