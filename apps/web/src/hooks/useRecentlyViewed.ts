'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRecentlyViewedIds, recordRecentlyViewed } from '@/lib/recentlyViewed';

export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(getRecentlyViewedIds());
  }, []);

  const recordView = useCallback((propertyId: string) => {
    setIds(recordRecentlyViewed(propertyId));
  }, []);

  return { ids, recordView };
}
