'use client';

import { useEffect, useState } from 'react';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import type { Property } from '@/types/property';
import PropertyCard from './PropertyCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type FetchedProperty = Property & { status?: string };

export default function RecentlyViewedSection() {
  const { ids } = useRecentlyViewed();
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    if (ids.length === 0) {
      setProperties([]);
      return;
    }

    let cancelled = false;

    Promise.all(
      ids.map((id) =>
        fetch(`${API_URL}/api/v1/properties/${id}`)
          .then((r) => (r.ok ? (r.json() as Promise<FetchedProperty>) : null))
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;

      const byId = new Map(
        results
          .filter((p): p is FetchedProperty => Boolean(p) && p!.status !== 'draft')
          .map((p) => [p.id, p]),
      );

      // Preserve the most-recent-first order from `ids`, dropping any that
      // failed to load (deleted) or are no longer public (draft).
      setProperties(ids.map((id) => byId.get(id)).filter((p): p is Property => Boolean(p)));
    });

    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (properties.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-6 py-4" data-testid="recently-viewed-section">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Recently viewed</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {properties.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </section>
  );
}
