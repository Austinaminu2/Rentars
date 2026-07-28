import { supabase } from '@/config/supabase.js';
import type { ServiceResponse } from './index.js';

const PLATFORM_FEE_RATE = 0.05;

export interface EarningsSummary {
  gross: number;
  platform_fees: number;
  net: number;
  pending: number;
  released: number;
}

export class EarningsService {
  async getHostEarnings(
    hostId: string,
    from: string,
    to: string,
  ): Promise<ServiceResponse<EarningsSummary>> {
    if (!hostId) return { success: false, error: 'hostId is required' };
    if (!from || !to) return { success: false, error: 'from and to date range are required' };
    if (new Date(to) < new Date(from)) {
      return { success: false, error: 'to must be on or after from' };
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('total_price, status, properties!inner(owner_id)')
      .eq('properties.owner_id', hostId)
      .not('status', 'eq', 'Cancelled')
      .gte('created_at', from)
      .lte('created_at', to);

    if (error) return { success: false, error: error.message };

    let gross = 0;
    let pending = 0;
    let released = 0;

    for (const row of (data ?? []) as Array<{ total_price: number; status: string }>) {
      const price = Number(row.total_price) || 0;
      gross += price;
      if (row.status === 'Confirmed' || row.status === 'Completed') {
        released += price;
      } else {
        pending += price;
      }
    }

    const platform_fees = Math.round(gross * PLATFORM_FEE_RATE * 100) / 100;
    const net = Math.round((gross - platform_fees) * 100) / 100;
    const releasedNet = Math.round(released * 0.95 * 100) / 100;
    const pendingNet = Math.round(pending * 0.95 * 100) / 100;

    return {
      success: true,
      data: {
        gross: Math.round(gross * 100) / 100,
        platform_fees,
        net,
        pending: pendingNet,
        released: releasedNet,
      },
    };
  }
}
