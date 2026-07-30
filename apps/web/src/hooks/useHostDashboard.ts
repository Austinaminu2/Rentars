'use client';

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const BASE = `${API_URL}/api/v1/host`;

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface DashboardSummary {
  total_properties: number;
  active_bookings: number;
  upcoming_reservations: number;
  total_revenue: number;
  net_revenue: number;
}

export interface HostProperty {
  id: string;
  title: string;
  location: string;
  price_per_night: number;
  status: string;
  active_bookings: number;
  total_bookings: number;
  average_rating: number;
  review_count: number;
  images: string[];
  created_at: string;
}

export function useHostDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [properties, setProperties] = useState<HostProperty[]>([]);
  const [totalProperties, setTotalProperties] = useState(0);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await fetch(`${BASE}/dashboard`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load dashboard summary');
      const data: DashboardSummary = await res.json();
      setSummary(data);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  const fetchProperties = useCallback(async (page = 1, limit = 20) => {
    setIsLoadingProperties(true);
    setPropertiesError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await fetch(`${BASE}/properties?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load properties');
      const data: { properties: HostProperty[]; total: number } = await res.json();
      setProperties(data.properties);
      setTotalProperties(data.total);
    } catch (err) {
      setPropertiesError(err instanceof Error ? err.message : 'Failed to load properties');
    } finally {
      setIsLoadingProperties(false);
    }
  }, []);

  const updatePropertyStatus = useCallback(
    async (
      propertyId: string,
      status: 'draft' | 'published' | 'unpublished',
    ): Promise<boolean> => {
      try {
        const res = await fetch(`${BASE}/properties/${propertyId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) return false;
        // Refresh properties list after status update
        await fetchProperties();
        return true;
      } catch {
        return false;
      }
    },
    [fetchProperties],
  );

  useEffect(() => {
    fetchSummary();
    fetchProperties();
  }, [fetchSummary, fetchProperties]);

  return {
    summary,
    properties,
    totalProperties,
    isLoadingSummary,
    isLoadingProperties,
    summaryError,
    propertiesError,
    refetchSummary: fetchSummary,
    refetchProperties: fetchProperties,
    updatePropertyStatus,
  };
}
