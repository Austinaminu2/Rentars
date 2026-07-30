/**
 * Booking service — orchestrates availability check → escrow creation →
 * DB insert → on-chain booking creation in a single atomic-ish flow with
 * rollback on failure.
 */

import { StrKey } from '@stellar/stellar-sdk';
import { supabase } from '@/config/supabase.js';
import {
  checkAvailability,
  cancelBookingOnChain,
  createBookingOnChain,
  updateBookingStatusOnChain,
} from '@/blockchain/bookingContract.js';
import { trustlessWorkClient } from '@/blockchain/trustlessWork.js';
import { loggingService } from './logging.service.js';
import { createNotification, getPreferences } from './notification.service.js';
import { emailService } from './email.service.js';
import { buildPreferenceUrlForUser } from './preferenceToken.js';
import { decodeCursor, buildCursorPage } from '../utils/cursor.js';
import type { CursorPaginatedResult } from './notification.service.js';
import type { ServiceResponse } from './index.js';
import {
  incCounter,
  bookingsCreatedTotal,
  escrowFailuresTotal,
} from '@/middleware/metrics.middleware.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Booking {
  id: string;
  property_id?: string;
  tenant_id?: string;
  check_in?: string;
  check_out?: string;
  guest_count?: number;
  total_price?: number;
  status?: string;
  escrow_id?: string;
  on_chain_id?: number;
  rules_acknowledged_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BookingStatusHistory {
  id: string;
  booking_id: string;
  status: string;
  changed_by?: string;
  notes?: string;
  created_at: string;
}

export interface CreateBookingInput {
  property_id: string;
  tenant_id: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  total_price: number;
  rules_acknowledged_at?: string;
  on_chain_property_id?: bigint;
}

/**
 * Interface for blockchain dependencies — kept narrow so it can be mocked in tests.
 */
export interface BlockchainServices {
  checkAvailability(propertyOnChainId: bigint, checkIn: bigint, checkOut: bigint): Promise<boolean>;

  createBookingOnChain(
    propertyId: bigint,
    userId: string,
    startDate: bigint,
    endDate: bigint,
    totalPrice: bigint,
  ): Promise<bigint>;

  cancelBookingOnChain(bookingId: bigint, callerAddress: string): Promise<void>;

  updateBookingStatusOnChain(
    bookingId: bigint,
    newStatus: string,
    callerAddress: string,
  ): Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchStellarAddress(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('stellar_address')
    .eq('id', userId)
    .single();
  return (data as { stellar_address?: string } | null)?.stellar_address ?? null;
}

// ─── Service class ────────────────────────────────────────────────────────────

export class BookingService {
  private readonly blockchain: BlockchainServices;

  constructor(blockchainServices?: BlockchainServices) {
    this.blockchain = blockchainServices ?? {
      checkAvailability,
      createBookingOnChain,
      cancelBookingOnChain,
      updateBookingStatusOnChain,
    };
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Retrieve a booking by its ID.
   *
   * @param id - UUID of the booking
   * @returns ServiceResponse with the booking data, or error if not found
   * @example
   * const result = await bookingService.getBookingById('f47ac10b-58cc-4372-a567-0e02b2c3d479');
   * if (result.success) {
   *   console.log(result.data.status); // 'Pending', 'Confirmed', etc.
   * }
   */
  async getBookingById(id: string): Promise<ServiceResponse<Booking>> {
    if (!id) {
      return { success: false, error: 'Booking ID is required' };
    }

    const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single();

    if (error) {
      return { success: false, error: 'Booking not found' };
    }

    return { success: true, data: data as Booking };
  }

  /**
   * Get the status history for a booking.
   *
   * @param bookingId - UUID of the booking
   * @returns ServiceResponse with the status history array
   */
  async getBookingStatusHistory(bookingId: string): Promise<ServiceResponse<BookingStatusHistory[]>> {
    if (!bookingId) {
      return { success: false, error: 'Booking ID is required' };
    }

    const { data, error } = await supabase
      .from('booking_status_history')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as BookingStatusHistory[] };
  }

  /**
   * List bookings for a user (as tenant) with optional status filtering and
   * sorting, backed by cursor-based pagination.
   *
   * @param userId  - UUID of the tenant
   * @param cursor  - Opaque pagination cursor (omit for first page)
   * @param limit   - Page size (1–100, default 20)
   * @param status  - Filter by booking status
   * @param sort    - Sort field: 'date' (check_in) | 'price' (total_price) | 'created' (default)
   * @param order   - Sort direction: 'asc' | 'desc' (default 'desc')
   */
  async getUserBookings(
    userId: string,
    cursor?: string | null,
    limit = 20,
    status?: string | null,
    sort: 'date' | 'price' | 'created' = 'created',
    order: 'asc' | 'desc' = 'desc',
  ): Promise<ServiceResponse<CursorPaginatedResult<Booking>>> {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    const pageSize = Math.min(Math.max(1, limit), 100);
    const decoded = decodeCursor(cursor);

    const sortColumn = sort === 'date' ? 'check_in' : sort === 'price' ? 'total_price' : 'created_at';
    const ascending = order === 'asc';

    let query = supabase
      .from('bookings')
      .select('*')
      .eq('tenant_id', userId)
      .order(sortColumn, { ascending })
      .order('id', { ascending: false })
      .limit(pageSize + 1);

    if (status) {
      // Normalise to title-case to match DB values (Pending, Confirmed, etc.)
      const normalised = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      query = query.eq('status', normalised);
    }

    if (decoded && sort === 'created') {
      query = query.or(
        `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
      );
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const rows = (data ?? []) as Booking[];
    const page = buildCursorPage(rows, pageSize);

    return { success: true, data: page };
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Full booking creation flow:
   *   1. Fetch property + owner Stellar address
   *   2. Fetch buyer Stellar address
   *   3. Validate both Stellar addresses
   *   4. Check on-chain availability
   *   5. Create TrustlessWork escrow
   *   6. Insert booking into Supabase
   *   7. Create on-chain booking record
   */
  async createBooking(input: CreateBookingInput): Promise<ServiceResponse<Booking>> {
    const { property_id, tenant_id, check_in, check_out, guest_count, total_price, rules_acknowledged_at } = input;

    if (!property_id || !tenant_id || !check_in || !check_out) {
      return {
        success: false,
        error: 'property_id, tenant_id, check_in, and check_out are required',
      };
    }

    if (!total_price || total_price <= 0) {
      return { success: false, error: 'total_price must be a positive number' };
    }

    if (!guest_count || guest_count < 1) {
      return { success: false, error: 'guest_count must be at least 1' };
    }

    // Require rules acknowledgement
    if (!rules_acknowledged_at) {
      return {
        success: false,
        error: 'You must acknowledge the house rules before booking',
      };
    }

    const checkInDate = new Date(check_in);
    const checkOutDate = new Date(check_out);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return {
        success: false,
        error: 'check_in and check_out must be valid dates',
      };
    }

    if (checkInDate >= checkOutDate) {
      return { success: false, error: 'check_in must be before check_out' };
    }

    // 1. Fetch property + owner (include capacity and stay-length limits)
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('id, owner_id, on_chain_id, max_guests, min_nights, max_nights, check_in_time, check_out_time')
      .eq('id', property_id)
      .single();

    if (propertyError || !property) {
      return { success: false, error: 'Property not found' };
    }

    const prop = property as {
      id: string;
      owner_id: string;
      on_chain_id?: number;
      max_guests?: number;
      min_nights?: number;
      max_nights?: number | null;
      check_in_time?: string;
      check_out_time?: string;
    };

    // Capacity check
    if (prop.max_guests !== undefined && prop.max_guests !== null && guest_count > prop.max_guests) {
      return {
        success: false,
        error: `Guest count (${guest_count}) exceeds property capacity (${prop.max_guests})`,
      };
    }

    // Stay-length check
    const nights = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    const minNights = prop.min_nights ?? 1;
    if (nights < minNights) {
      return {
        success: false,
        error: `This property requires a minimum stay of ${minNights} night${minNights === 1 ? '' : 's'} (requested: ${nights})`,
      };
    }
    if (prop.max_nights !== null && prop.max_nights !== undefined && nights > prop.max_nights) {
      return {
        success: false,
        error: `This property allows a maximum stay of ${prop.max_nights} night${prop.max_nights === 1 ? '' : 's'} (requested: ${nights})`,
      };
    }

    // Same-day turnover check: if an existing booking checks out on our check-in day,
    // only allow it when the property's check_out_time precedes its check_in_time.
    if (prop.check_in_time && prop.check_out_time) {
      const { data: sameDayBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('property_id', property_id)
        .eq('check_out', check_in)
        .neq('status', 'Cancelled')
        .maybeSingle();

      if (sameDayBooking && prop.check_out_time >= prop.check_in_time) {
        return {
          success: false,
          error: `Same-day check-in is not available: the property's check-out time (${prop.check_out_time}) does not precede its check-in time (${prop.check_in_time})`,
        };
      }
    }

    // 2. Fetch Stellar addresses
    const [ownerStellarAddress, buyerStellarAddress] = await Promise.all([
      fetchStellarAddress(prop.owner_id),
      fetchStellarAddress(tenant_id),
    ]);

    // 3. Validate addresses
    if (!ownerStellarAddress || !StrKey.isValidEd25519PublicKey(ownerStellarAddress)) {
      return {
        success: false,
        error: 'Property owner does not have a valid Stellar address',
      };
    }

    if (!buyerStellarAddress || !StrKey.isValidEd25519PublicKey(buyerStellarAddress)) {
      return {
        success: false,
        error: 'Tenant does not have a valid Stellar address',
      };
    }

    // 4. Atomically reserve the booking (conflict check + host-block check + INSERT).
    //    This must happen before escrow so escrow is never created for a conflicting slot.
    const { data: reservedId, error: reservationError } = await supabase.rpc(
      'create_booking_atomic_v2',
      {
        p_property_id: property_id,
        p_tenant_id: tenant_id,
        p_check_in: check_in,
        p_check_out: check_out,
        p_total_price: total_price,
        p_guest_count: guest_count,
        p_rules_acknowledged_at: rules_acknowledged_at ?? null,
      },
    );

    if (reservationError) {
      const msg = reservationError.message ?? '';
      if (msg.includes('BOOKING_CONFLICT')) {
        return { success: false, error: 'Booking conflict: the requested dates overlap with an existing booking', conflict: true };
      }
      if (msg.includes('BOOKING_BLOCKED')) {
        return { success: false, error: 'These dates are blocked by the host', conflict: true };
      }
      return { success: false, error: reservationError.message };
    }

    const bookingId = reservedId as string;

    // 5. Check on-chain availability (advisory; non-blocking on error).
    if (prop.on_chain_id !== undefined && prop.on_chain_id !== null) {
      const checkInTs = BigInt(Math.floor(checkInDate.getTime() / 1000));
      const checkOutTs = BigInt(Math.floor(checkOutDate.getTime() / 1000));

      loggingService.logBlockchainOperation('checkAvailability', {
        propertyId: property_id,
        userId: tenant_id,
      });

      try {
        const available = await this.blockchain.checkAvailability(
          BigInt(prop.on_chain_id),
          checkInTs,
          checkOutTs,
        );

        if (!available) {
          // Roll back the DB reservation
          await supabase.from('bookings').delete().eq('id', bookingId);
          return {
            success: false,
            error: 'Property is not available for the requested dates',
          };
        }
      } catch (err) {
        loggingService.logBlockchainOperation(
          'checkAvailability',
          { propertyId: property_id, userId: tenant_id },
          undefined,
          String(err),
        );
        console.warn('[BookingService] On-chain availability check failed:', err);
      }
    }

    // 6. Create TrustlessWork escrow (after local reservation succeeds).
    let escrowId: string | undefined;

    loggingService.logBlockchainOperation('createEscrow', {
      propertyId: property_id,
      userId: tenant_id,
    });

    try {
      const escrowResponse = await trustlessWorkClient.createBookingEscrow({
        propertyId: property_id,
        bookingId,
        buyerAddress: buyerStellarAddress,
        sellerAddress: ownerStellarAddress,
        amountUsdc: String(total_price),
        checkIn: check_in,
        checkOut: check_out,
      });
      escrowId = escrowResponse.escrowId;

      loggingService.logBlockchainOperation('createEscrow', {
        propertyId: property_id,
        userId: tenant_id,
        escrowId,
      });
    } catch (err) {
      loggingService.logBlockchainOperation(
        'createEscrow',
        { propertyId: property_id, userId: tenant_id },
        undefined,
        String(err),
      );
      incCounter(escrowFailuresTotal, { operation: 'create_escrow' });
      // Roll back the DB reservation so the slot is freed
      await supabase.from('bookings').delete().eq('id', bookingId);
      return {
        success: false,
        error: `Failed to create escrow: ${String(err)}`,
      };
    }

    // 7. Attach escrow_id to the reserved booking.
    const { data: bookingData, error: updateError } = await supabase
      .from('bookings')
      .update({ escrow_id: escrowId })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      // Attempt escrow rollback
      try {
        if (escrowId) await trustlessWorkClient.cancelEscrow(escrowId);
      } catch (rollbackErr) {
        console.error('[BookingService] Escrow rollback failed:', rollbackErr);
      }
      return { success: false, error: updateError.message };
    }

    const booking = bookingData as Booking;

    // Notify tenant (in-app)
    createNotification(tenant_id, 'booking_created', { booking_id: booking.id, property_id }).catch(
      () => {},
    );
    incCounter(bookingsCreatedTotal, { property_id });

    // Send detailed booking confirmation emails (tenant + host) — fire-and-forget,
    // never block the booking creation response.
    this.sendBookingEmails(booking, prop, tenant_id).catch((err) =>
      console.warn('[BookingService] Confirmation email dispatch failed:', err),
    );

    // 8. Create on-chain booking record (non-fatal on failure).
    if (prop.on_chain_id !== undefined && prop.on_chain_id !== null) {
      const checkInTs = BigInt(Math.floor(checkInDate.getTime() / 1000));
      const checkOutTs = BigInt(Math.floor(checkOutDate.getTime() / 1000));

      loggingService.logBlockchainOperation('createBookingOnChain', {
        bookingId: booking.id,
        propertyId: property_id,
        userId: tenant_id,
      });

      try {
        const onChainId = await this.blockchain.createBookingOnChain(
          BigInt(prop.on_chain_id),
          buyerStellarAddress,
          checkInTs,
          checkOutTs,
          BigInt(Math.round(total_price * 1e7)),
        );

        loggingService.logBlockchainOperation('createBookingOnChain', {
          bookingId: booking.id,
          propertyId: property_id,
          userId: tenant_id,
          onChainId: String(onChainId),
        });

        await supabase
          .from('bookings')
          .update({ on_chain_id: Number(onChainId) })
          .eq('id', booking.id);

        booking.on_chain_id = Number(onChainId);
      } catch (err) {
        loggingService.logBlockchainOperation(
          'createBookingOnChain',
          { bookingId: booking.id, propertyId: property_id, userId: tenant_id },
          undefined,
          String(err),
        );
        console.warn('[BookingService] On-chain booking creation failed:', err);
      }
    }

    return { success: true, data: booking };
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  /**
   * Cancel a booking: cancel the escrow, update DB status, and update
   * the on-chain booking status to Cancelled.
   */
  async cancelBooking(bookingId: string, userId: string): Promise<ServiceResponse<Booking>> {
    if (!bookingId) {
      return { success: false, error: 'Booking ID is required' };
    }

    const { data: bookingData, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !bookingData) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingData as Booking;

    if (booking.status === 'Cancelled') {
      return { success: false, error: 'Booking is already cancelled' };
    }

    // Cancel escrow
    if (booking.escrow_id) {
      loggingService.logBlockchainOperation('cancelEscrow', {
        bookingId,
        userId,
        escrowId: booking.escrow_id,
      });

      try {
        await trustlessWorkClient.cancelEscrow(booking.escrow_id);
      } catch (err) {
        loggingService.logBlockchainOperation(
          'cancelEscrow',
          {
            bookingId,
            userId,
            escrowId: booking.escrow_id,
          },
          undefined,
          String(err),
        );
        return {
          success: false,
          error: `Failed to cancel escrow: ${String(err)}`,
        };
      }
    }

    // Update DB status
    const { data: updatedData, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'Cancelled' })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Notify tenant
    if (booking.tenant_id) {
      createNotification(booking.tenant_id, 'booking_cancelled', { booking_id: bookingId }).catch(
        () => {},
      );
    }

    // Update on-chain status (non-fatal)
    if (booking.on_chain_id !== undefined && booking.on_chain_id !== null) {
      const callerAddress = await fetchStellarAddress(userId);

      if (callerAddress) {
        loggingService.logBlockchainOperation('cancelBookingOnChain', {
          bookingId,
          userId,
        });

        try {
          await this.blockchain.cancelBookingOnChain(BigInt(booking.on_chain_id), callerAddress);
        } catch (err) {
          loggingService.logBlockchainOperation(
            'cancelBookingOnChain',
            {
              bookingId,
              userId,
            },
            undefined,
            String(err),
          );
          console.warn('[BookingService] On-chain cancellation failed:', err);
        }
      }
    }

    return { success: true, data: updatedData as Booking };
  }

  // ── Confirm ────────────────────────────────────────────────────────────────

  /**
   * Confirm a booking: release the escrow to the property owner, then update
   * DB and on-chain status to Confirmed.
   */
  async confirmBooking(bookingId: string, userId: string): Promise<ServiceResponse<Booking>> {
    if (!bookingId) {
      return { success: false, error: 'Booking ID is required' };
    }

    const { data: bookingData, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !bookingData) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingData as Booking;

    if (booking.status === 'Confirmed') {
      return { success: false, error: 'Booking is already confirmed' };
    }

    if (booking.status === 'Cancelled') {
      return { success: false, error: 'Cannot confirm a cancelled booking' };
    }

    // Release escrow to owner
    if (booking.escrow_id) {
      loggingService.logBlockchainOperation('releaseEscrow', {
        bookingId,
        userId,
        escrowId: booking.escrow_id,
      });

      try {
        await trustlessWorkClient.releaseEscrow(booking.escrow_id, 'Booking confirmed by tenant');
      } catch (err) {
        loggingService.logBlockchainOperation(
          'releaseEscrow',
          {
            bookingId,
            userId,
            escrowId: booking.escrow_id,
          },
          undefined,
          String(err),
        );
        return {
          success: false,
          error: `Failed to release escrow: ${String(err)}`,
        };
      }
    }

    // Update DB status
    const { data: updatedData, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'Confirmed' })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Notify tenant
    if (booking.tenant_id) {
      createNotification(booking.tenant_id, 'booking_confirmed', { booking_id: bookingId }).catch(
        () => {},
      );
    }

    // Update on-chain status (non-fatal)
    if (booking.on_chain_id !== undefined && booking.on_chain_id !== null) {
      const callerAddress = await fetchStellarAddress(userId);

      if (callerAddress) {
        loggingService.logBlockchainOperation('updateBookingStatusOnChain', {
          bookingId,
          userId,
        });

        try {
          await this.blockchain.updateBookingStatusOnChain(
            BigInt(booking.on_chain_id),
            'Confirmed',
            callerAddress,
          );
        } catch (err) {
          loggingService.logBlockchainOperation(
            'updateBookingStatusOnChain',
            {
              bookingId,
              userId,
            },
            undefined,
            String(err),
          );
          console.warn('[BookingService] On-chain status update failed:', err);
        }
      }
    }

    return { success: true, data: updatedData as Booking };
  }

  // ── Complete ───────────────────────────────────────────────────────────────

  /**
   * Mark a booking as Completed.
   *
   * Allowed transitions: Confirmed → Completed.
   * Only the tenant (or admin) may complete a booking. Completing releases the
   * escrow to the host if it hasn't been released yet, then marks the booking
   * Completed in the DB and on-chain.
   *
   * @param bookingId - UUID of the booking to complete
   * @param userId    - ID of the caller (must be the tenant)
   */
  async completeBooking(bookingId: string, userId: string): Promise<ServiceResponse<Booking>> {
    if (!bookingId) {
      return { success: false, error: 'Booking ID is required' };
    }

    const { data: bookingData, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !bookingData) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingData as Booking;

    // State-machine: only Confirmed bookings can be completed
    if (booking.status === 'Completed') {
      return { success: false, error: 'Booking is already completed' };
    }
    if (booking.status !== 'Confirmed') {
      return {
        success: false,
        error: `Cannot complete a booking in '${booking.status}' status. Only Confirmed bookings can be completed.`,
      };
    }

    // Authorisation: only the tenant may mark as completed
    if (booking.tenant_id && booking.tenant_id !== userId) {
      return { success: false, error: 'Forbidden: only the tenant can complete a booking' };
    }

    // Release escrow if still open (idempotent — if already released this is a no-op on TW)
    if (booking.escrow_id) {
      loggingService.logBlockchainOperation('releaseEscrowComplete', {
        bookingId,
        userId,
        escrowId: booking.escrow_id,
      });

      try {
        await trustlessWorkClient.releaseEscrow(booking.escrow_id, 'Booking completed by tenant');
      } catch (err) {
        loggingService.logBlockchainOperation(
          'releaseEscrowComplete',
          { bookingId, userId, escrowId: booking.escrow_id },
          undefined,
          String(err),
        );
        // Log but don't block — the DB transition must still succeed
        console.warn('[BookingService] Escrow release on complete failed:', err);
      }
    }

    // Update DB status
    const { data: updatedData, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'Completed' })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Notify tenant
    if (booking.tenant_id) {
      createNotification(booking.tenant_id, 'booking_completed', { booking_id: bookingId }).catch(
        () => {},
      );
    }

    // Update on-chain status (non-fatal)
    if (booking.on_chain_id !== undefined && booking.on_chain_id !== null) {
      const callerAddress = await fetchStellarAddress(userId);
      if (callerAddress) {
        loggingService.logBlockchainOperation('updateBookingStatusOnChain', {
          bookingId,
          userId,
          newStatus: 'Completed',
        });

        try {
          await this.blockchain.updateBookingStatusOnChain(
            BigInt(booking.on_chain_id),
            'Completed',
            callerAddress,
          );
        } catch (err) {
          loggingService.logBlockchainOperation(
            'updateBookingStatusOnChain',
            { bookingId, userId },
            undefined,
            String(err),
          );
          console.warn('[BookingService] On-chain complete status update failed:', err);
        }
      }
    }

    return { success: true, data: updatedData as Booking };
  }

  // ── Dispute ────────────────────────────────────────────────────────────────

  /**
   * Open a dispute on a booking.
   *
   * Allowed transitions: Confirmed → Disputed.
   * Only the tenant may open a dispute. The escrow is locked (not released)
   * until an admin resolves the dispute via resolveDispute().
   *
   * @param bookingId - UUID of the booking to dispute
   * @param userId    - ID of the caller (must be the tenant)
   * @param reason    - Optional human-readable reason for the dispute
   */
  async disputeBooking(
    bookingId: string,
    userId: string,
    reason?: string,
  ): Promise<ServiceResponse<Booking>> {
    if (!bookingId) {
      return { success: false, error: 'Booking ID is required' };
    }

    const { data: bookingData, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !bookingData) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingData as Booking;

    // State-machine: only Confirmed bookings can be disputed
    if (booking.status === 'Disputed') {
      return { success: false, error: 'Booking is already in dispute' };
    }
    if (booking.status !== 'Confirmed') {
      return {
        success: false,
        error: `Cannot dispute a booking in '${booking.status}' status. Only Confirmed bookings can be disputed.`,
      };
    }

    // Authorisation: only the tenant may raise a dispute
    if (booking.tenant_id && booking.tenant_id !== userId) {
      return { success: false, error: 'Forbidden: only the tenant can open a dispute' };
    }

    // Dispute on-chain (advisory — the DB transition is authoritative)
    if (booking.on_chain_id !== undefined && booking.on_chain_id !== null) {
      const callerAddress = await fetchStellarAddress(userId);
      if (callerAddress) {
        loggingService.logBlockchainOperation('disputeBookingOnChain', {
          bookingId,
          userId,
        });

        try {
          const { disputeBookingOnChain } = await import('@/blockchain/bookingContract.js');
          await disputeBookingOnChain(callerAddress, BigInt(booking.on_chain_id));
        } catch (err) {
          loggingService.logBlockchainOperation(
            'disputeBookingOnChain',
            { bookingId, userId },
            undefined,
            String(err),
          );
          console.warn('[BookingService] On-chain dispute failed:', err);
        }
      }
    }

    // Update DB status (+ persist dispute reason in a metadata column if available)
    const updatePayload: Record<string, unknown> = { status: 'Disputed' };
    if (reason) {
      updatePayload['dispute_reason'] = reason;
    }

    const { data: updatedData, error: updateError } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      // Fallback: try without dispute_reason in case column doesn't exist yet
      if (reason) {
        const { data: fallback, error: fallbackError } = await supabase
          .from('bookings')
          .update({ status: 'Disputed' })
          .eq('id', bookingId)
          .select()
          .single();

        if (fallbackError) {
          return { success: false, error: fallbackError.message };
        }

        if (booking.tenant_id) {
          createNotification(booking.tenant_id, 'booking_disputed', { booking_id: bookingId }).catch(
            () => {},
          );
        }

        return { success: true, data: fallback as Booking };
      }

      return { success: false, error: updateError.message };
    }

    // Notify tenant & property owner
    if (booking.tenant_id) {
      createNotification(booking.tenant_id, 'booking_disputed', { booking_id: bookingId }).catch(
        () => {},
      );
    }

    return { success: true, data: updatedData as Booking };
  }

  // ── Update / Delete ────────────────────────────────────────────────────────

  /**
   * Update mutable fields of an existing booking.
   *
   * @param id - UUID of the booking
   * @param payload - Partial booking fields to update
   * @returns ServiceResponse with the updated booking
   * @throws Does not throw; errors are returned in the ServiceResponse
   */
  async updateBooking(id: string, payload: Partial<Booking>): Promise<ServiceResponse<Booking>> {
    if (!id) {
      return { success: false, error: 'Booking ID is required' };
    }

    if (Object.keys(payload).length === 0) {
      return { success: false, error: 'No fields provided for update' };
    }

    const { data, error } = await supabase
      .from('bookings')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Booking };
  }

  /**
   * Permanently delete a booking record.
   *
   * @param id - UUID of the booking to delete
   * @returns ServiceResponse with no data on success
   */
  async deleteBooking(id: string): Promise<ServiceResponse<void>> {
    if (!id) {
      return { success: false, error: 'Booking ID is required' };
    }

    const { error } = await supabase.from('bookings').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  // ── Dispute ────────────────────────────────────────────────────────────────

  /**
   * Raise a dispute on a booking. Only the tenant or host (property owner) may raise a dispute.
   *
   * @param bookingId - UUID of the booking
   * @param userId - UUID of the user raising the dispute
   * @param reason - Reason for the dispute
   * @param details - Optional additional details
   * @returns ServiceResponse with the updated booking
   */
  async raiseDispute(
    bookingId: string,
    userId: string,
    reason: string,
    details?: string
  ): Promise<ServiceResponse<Booking>> {
    if (!bookingId) {
      return { success: false, error: 'Booking ID is required' };
    }

    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    // Fetch the booking
    const { data: bookingData, error: fetchError } = await supabase
      .from('bookings')
      .select('*, properties!inner(owner_id)')
      .eq('id', bookingId)
      .single();

    if (fetchError || !bookingData) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingData as Booking & { properties: { owner_id: string } };
    const hostId = booking.properties.owner_id;

    // Authorization: only tenant or host may raise dispute
    if (booking.tenant_id !== userId && hostId !== userId) {
      return { success: false, error: 'Only the tenant or host may raise a dispute' };
    }

    // Check booking status
    if (booking.status === 'Cancelled') {
      return { success: false, error: 'Cannot dispute a cancelled booking' };
    }

    if (booking.status === 'Completed') {
      return { success: false, error: 'Cannot dispute a completed booking' };
    }

    if ((booking as unknown as { dispute_status?: string }).dispute_status === 'raised') {
      return { success: false, error: 'A dispute has already been raised for this booking' };
    }

    // Update booking status to Disputed and dispute_status to raised
    const { data: updatedData, error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'Disputed',
        dispute_status: 'raised',
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Notify both parties
    const otherPartyId = booking.tenant_id === userId ? hostId : booking.tenant_id;

    if (booking.tenant_id) {
      createNotification(booking.tenant_id, 'system_alert', {
        booking_id: bookingId,
        message: 'A dispute has been raised on your booking',
        reason,
      }).catch(() => {});
    }

    if (otherPartyId) {
      createNotification(otherPartyId, 'system_alert', {
        booking_id: bookingId,
        message: 'A dispute has been raised on a booking',
        reason,
      }).catch(() => {});
    }

    loggingService.logBlockchainOperation('raiseDispute', {
      bookingId,
      userId,
      reason,
    });

    return { success: true, data: updatedData as Booking };
  }

  /**
   * Resolve a dispute on a booking. Only admins/moderators may resolve disputes.
   *
   * @param bookingId - UUID of the booking
   * @param userId - UUID of the admin resolving the dispute
   * @param resolution - 'refund_tenant' or 'release_to_host'
   * @param adminNotes - Optional admin notes
   * @returns ServiceResponse with the updated booking
   */
  async resolveDispute(
    bookingId: string,
    userId: string,
    resolution: 'refund_tenant' | 'release_to_host',
    adminNotes?: string
  ): Promise<ServiceResponse<Booking>> {
    if (!bookingId) {
      return { success: false, error: 'Booking ID is required' };
    }

    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    // TODO: Check if user is an admin/moderator
    // For now, we'll assume the authorization check happens at the controller level

    // Fetch the booking
    const { data: bookingData, error: fetchError } = await supabase
      .from('bookings')
      .select('*, properties!inner(owner_id)')
      .eq('id', bookingId)
      .single();

    if (fetchError || !bookingData) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingData as Booking & { properties: { owner_id: string } };

    if ((booking as unknown as { dispute_status?: string }).dispute_status !== 'raised') {
      return { success: false, error: 'No active dispute on this booking' };
    }

    // Handle escrow resolution
    if (booking.escrow_id) {
      loggingService.logBlockchainOperation('resolveDisputeEscrow', {
        bookingId,
        userId,
        resolution,
      });

      try {
        if (resolution === 'release_to_host') {
          await trustlessWorkClient.releaseEscrow(booking.escrow_id, `Dispute resolved: ${adminNotes ?? 'Released to host'}`);
        } else {
          await trustlessWorkClient.cancelEscrow(booking.escrow_id);
        }
      } catch (err) {
        loggingService.logBlockchainOperation(
          'resolveDisputeEscrow',
          { bookingId, userId, resolution },
          undefined,
          String(err)
        );
        return {
          success: false,
          error: `Failed to resolve escrow: ${String(err)}`,
        };
      }
    }

    // Update booking
    const { data: updatedData, error: updateError } = await supabase
      .from('bookings')
      .update({
        status: resolution === 'release_to_host' ? 'Completed' : 'Cancelled',
        dispute_status: 'resolved',
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Notify both parties
    const hostId = booking.properties.owner_id;
    const resolutionMessage = resolution === 'release_to_host' 
      ? 'Dispute resolved in favor of host' 
      : 'Dispute resolved in favor of tenant';

    if (booking.tenant_id) {
      createNotification(booking.tenant_id, 'system_alert', {
        booking_id: bookingId,
        message: resolutionMessage,
      }).catch(() => {});
    }

    if (hostId) {
      createNotification(hostId, 'system_alert', {
        booking_id: bookingId,
        message: resolutionMessage,
      }).catch(() => {});
    }

    loggingService.logBlockchainOperation('resolveDispute', {
      bookingId,
      userId,
      resolution,
    });

    return { success: true, data: updatedData as Booking };
  }
}
