'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  email_verified: boolean;
}

interface ConfirmAction {
  userId: string;
  action: 'suspend' | 'activate';
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fetchUsers = () => {
    setLoading(true);
    fetch(`${API_URL}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => setUsers(json.data ?? []))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async () => {
    if (!confirm) return;
    setActionLoading(true);
    try {
      await fetch(`${API_URL}/api/v1/admin/users/${confirm.userId}/${confirm.action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfirm(null);
      fetchUsers();
    } catch {
      setError('Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading users...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Users</h1>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No users found</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.id}`} className="text-blue-600 hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.role === 'admin' ? 'destructive' : 'secondary'}>{u.role}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.status === 'active' ? 'default' : 'destructive'}>{u.status ?? 'active'}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-600">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 space-x-2">
                  {u.status !== 'suspended' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => setConfirm({ userId: u.id, action: 'suspend' })}
                    >
                      Suspend
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                      onClick={() => setConfirm({ userId: u.id, action: 'activate' })}
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

      {/* Confirmation modal */}
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
              Are you sure you want to {confirm.action} this user?
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
