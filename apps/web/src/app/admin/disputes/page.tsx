'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Dispute {
  id: string;
  property_id: string;
  user_id: string;
  status: string;
  check_in: string;
  check_out: string;
  total_price: number;
  created_at: string;
}

interface ResolveModal {
  disputeId: string;
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolveModal, setResolveModal] = useState<ResolveModal | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [outcome, setOutcome] = useState<'refund_tenant' | 'release_to_host' | 'split'>('release_to_host');
  const [actionLoading, setActionLoading] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fetchDisputes = () => {
    setLoading(true);
    fetch(`${API_URL}/api/v1/admin/disputes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => setDisputes(json.data ?? []))
      .catch(() => setError('Failed to load disputes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDisputes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResolve = async () => {
    if (!resolveModal || !resolutionNote.trim()) return;
    setActionLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/v1/admin/disputes/${resolveModal.disputeId}/resolve`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ resolution_note: resolutionNote, outcome }),
        },
      );
      if (!response.ok) throw new Error('Failed to resolve');
      setResolveModal(null);
      setResolutionNote('');
      fetchDisputes();
    } catch {
      setError('Failed to resolve dispute');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading disputes...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Disputes</h1>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-in</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {disputes.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No open disputes</td></tr>
            )}
            {disputes.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{d.id.slice(0, 8)}…</td>
                <td className="px-4 py-3">
                  <Badge variant="destructive">{d.status}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-600">{new Date(d.check_in).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-gray-900 font-medium">${Number(d.total_price).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResolveModal({ disputeId: d.id })}
                  >
                    Resolve
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resolveModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-dialog-title"
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        >
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl space-y-4">
            <h2 id="resolve-dialog-title" className="text-lg font-semibold">Resolve Dispute</h2>

            <div>
              <label htmlFor="outcome" className="block text-sm font-medium text-gray-700 mb-1">
                Outcome
              </label>
              <select
                id="outcome"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as typeof outcome)}
              >
                <option value="release_to_host">Release to host</option>
                <option value="refund_tenant">Refund tenant</option>
                <option value="split">Split</option>
              </select>
            </div>

            <div>
              <label htmlFor="resolution-note" className="block text-sm font-medium text-gray-700 mb-1">
                Resolution Note <span className="text-red-500">*</span>
              </label>
              <textarea
                id="resolution-note"
                rows={4}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none"
                placeholder="Explain the resolution decision..."
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setResolveModal(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleResolve}
                disabled={actionLoading || !resolutionNote.trim()}
              >
                {actionLoading ? 'Resolving…' : 'Resolve Dispute'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
