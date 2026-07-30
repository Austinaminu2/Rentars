/**
 * Payment service — manages USDC payment intent state for bookings.
 *
 * Status lifecycle:
 *   pending → submitted → confirmed | failed | timed_out
 *
 * All Stellar/Horizon interactions are handled by stellar.service.ts.
 * This service owns DB state only.
 */

import { supabase } from '@/config/supabase.js';
import { auditLogger } from './auditLogger.service.js';

export type PaymentStatus = 'pending' | 'submitted' | 'confirmed' | 'failed' | 'timed_out';

export interface Payment {
  id: string;
  booking_id: string;
  tenant_id: string;
  amount_usdc: number;
  stellar_tx_hash: string | null;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
}

export interface CreatePaymentIntentParams {
  bookingId: string;
  tenantId: string;
  amountUsdc: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create a new payment intent in 'pending' state.
 */
export async function createPaymentIntent(
  params: CreatePaymentIntentParams,
): Promise<Payment> {
  const { bookingId, tenantId, amountUsdc, metadata } = params;

  const { data, error } = await supabase
    .from('payments')
    .insert({
      booking_id: bookingId,
      tenant_id: tenantId,
      amount_usdc: amountUsdc,
      status: 'pending',
      metadata: metadata ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create payment intent: ${error?.message ?? 'unknown error'}`);
  }

  await auditLogger.log({
    actorId: tenantId,
    action: 'payment.submit',
    resourceType: 'payment',
    resourceId: (data as Payment).id,
    meta: { bookingId, amountUsdc },
  });

  return data as Payment;
}

/**
 * Update the payment status and optional tx hash.
 */
export async function updatePaymentStatus(
  paymentId: string,
  txHash: string | null,
  status: PaymentStatus,
): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .update({ status, stellar_tx_hash: txHash })
    .eq('id', paymentId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update payment status: ${error?.message ?? 'unknown'}`);
  }

  const auditAction =
    status === 'confirmed'
      ? ('payment.confirmed' as const)
      : status === 'failed'
        ? ('payment.failed' as const)
        : ('payment.submit' as const);

  await auditLogger.log({
    action: auditAction,
    resourceType: 'payment',
    resourceId: paymentId,
    meta: { status, txHash },
  });

  return data as Payment;
}

/**
 * Get a payment record by ID. Returns null if not found.
 */
export async function getPaymentStatus(paymentId: string): Promise<Payment | null> {
  const { data } = await supabase
    .from('payments')
    .select()
    .eq('id', paymentId)
    .single();
  return (data as Payment | null) ?? null;
}

/**
 * Get a payment record by booking ID. Returns null if not found.
 */
export async function getPaymentByBookingId(bookingId: string): Promise<Payment | null> {
  const { data } = await supabase
    .from('payments')
    .select()
    .eq('booking_id', bookingId)
    .single();
  return (data as Payment | null) ?? null;
}
