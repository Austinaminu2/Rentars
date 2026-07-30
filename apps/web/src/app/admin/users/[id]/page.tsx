'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Booking {
  id: string;
  property_id: string;
  status: string;
  check_in: string;
  check_out: string;
  total_price: number;
  created_at: string;
}

interface UserDetail {
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
    email_verified: boolean;
  };
  bookings: Booking[];
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/v1/admin/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => setDetail(json.data))
      .catch(() => setError('Failed to load user detail'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!detail) return null;

  const { user, bookings } = detail;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="text-blue-600 hover:underline text-sm">
          ← Users
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{user.email}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Account Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">ID:</span> <span className="font-mono">{user.id}</span></div>
          <div><span className="text-gray-500">Role:</span> <Badge variant="secondary" className="ml-1">{user.role}</Badge></div>
          <div>
            <span className="text-gray-500">Status:</span>{' '}
            <Badge variant={user.status === 'active' ? 'default' : 'destructive'} className="ml-1">
              {user.status ?? 'active'}
            </Badge>
          </div>
          <div><span className="text-gray-500">Email verified:</span> {user.email_verified ? '✅' : '❌'}</div>
          <div><span className="text-gray-500">Joined:</span> {new Date(user.created_at).toLocaleDateString()}</div>
        </CardContent>
      </Card>

      <section aria-labelledby="booking-history-title">
        <h2 id="booking-history-title" className="text-lg font-semibold text-gray-900 mb-3">
          Booking History
        </h2>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-in</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-out</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No bookings</td></tr>
              )}
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3"><Badge variant="secondary">{b.status}</Badge></td>
                  <td className="px-4 py-3 text-gray-600">{new Date(b.check_in).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(b.check_out).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">${Number(b.total_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
