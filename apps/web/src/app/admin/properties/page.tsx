'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface AdminProperty {
  id: string;
  title: string;
  status: string;
  owner_id: string;
  price_per_night: number;
  created_at: string;
}

interface ConfirmAction {
  propertyId: string;
  action: 'suspend' | 'activate';
}

export default function AdminPropertiesPage() {
  const [properties, setProperties] = useState<AdminProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fetchProperties = (status?: string) => {
    setLoading(true);
    const url = new URL(`${API_URL}/api/v1/admin/properties`);
    if (status) url.searchParams.set('status', status);
    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => setProperties(json.data ?? []))
      .catch(() => setError('Failed to load properties'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProperties(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async () => {
    if (!confirm) return;
    setActionLoading(true);
    try {
      await fetch(`${API_URL}/api/v1/admin/properties/${confirm.propertyId}/${confirm.action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfirm(null);
      fetchProperties();
    } catch {
      setError('Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading properties...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
        <div className="flex gap-2">
          {(['all', 'active', 'suspended'] as const).map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              onClick={() => fetchProperties(s === 'all' ? undefined : s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price/night</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {properties.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No properties found</td></tr>
            )}
            {properties.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                <td className="px-4 py-3">
                  <Badge variant={p.status === 'active' ? 'default' : 'destructive'}>{p.status}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-600">${Number(p.price_per_night).toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-600">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 space-x-2">
                  {p.status !== 'suspended' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => setConfirm({ propertyId: p.id, action: 'suspend' })}
                    >
                      Suspend
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                      onClick={() => setConfirm({ propertyId: p.id, action: 'activate' })}
                    >
                      Activate
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        >
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h2 id="confirm-dialog-title" className="text-lg font-semibold mb-2">
              Confirm {confirm.action}
            </h2>
            <p className="text-gray-600 mb-4">
              Are you sure you want to {confirm.action} this property?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setConfirm(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant={confirm.action === 'suspend' ? 'destructive' : 'default'}
                onClick={handleAction}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing…' : confirm.action === 'suspend' ? 'Suspend' : 'Activate'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
