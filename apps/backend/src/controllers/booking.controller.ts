import type { Request, Response } from 'express';
import { BookingService } from '@/services/booking.service.js';
import { getPropertyById } from '@/services/property.service.js';
import { generateIcs } from '@/utils/ics.js';
import type { AuthRequest } from '@/middleware/auth.middleware.js';

const bookingService = new BookingService();

export async function listUserBookings(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  if (Number.isNaN(limit) || limit < 1) {
    res.status(422).json({ error: 'limit must be a positive integer' });
    return;
  }

  const status = typeof req.query.status === 'string' ? req.query.status : null;

  const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : 'created';
  const sort = ['date', 'price', 'created'].includes(sortRaw) ? (sortRaw as 'date' | 'price' | 'created') : 'created';

  const orderRaw = typeof req.query.order === 'string' ? req.query.order : 'desc';
  const order = orderRaw === 'asc' ? 'asc' : 'desc';

  const result = await bookingService.getUserBookings(userId, cursor, limit, status, sort, order);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

export async function getBooking(req: Request, res: Response): Promise<void> {
  const result = await bookingService.getBookingById(req.params.id);

  if (!result.success) {
    res.status(404).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

export async function getBookingStatusHistory(req: Request, res: Response): Promise<void> {
  const result = await bookingService.getBookingStatusHistory(req.params.id);

  if (!result.success) {
    res.status(404).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

export async function createBooking(req: Request, res: Response): Promise<void> {
  const result = await bookingService.createBooking(req.body);

  if (!result.success) {
    const status = result.conflict ? 409 : 400;
    res.status(status).json({ error: result.error });
    return;
  }

  res.status(201).json(result.data);
}

export async function cancelBooking(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id ?? '';
  const result = await bookingService.cancelBooking(req.params.id, userId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

export async function confirmBooking(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id ?? '';
  const result = await bookingService.confirmBooking(req.params.id, userId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

/**
 * POST /api/v1/bookings/:id/complete
 *
 * Marks a Confirmed booking as Completed.
 * Only the booking tenant may call this endpoint.
 */
export async function completeBooking(req: Request, res: Response): Promise<void> {
  const authUser = (req as Request & { user?: { id: string } }).user;
  if (!authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = await bookingService.completeBooking(req.params.id, authUser.id);

  if (!result.success) {
    const statusCode =
      result.error?.startsWith('Forbidden') ? 403
      : result.error === 'Booking not found'  ? 404
      : 400;
    res.status(statusCode).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

/**
 * POST /api/v1/bookings/:id/dispute
 *
 * Opens a dispute on a Confirmed booking.
 * Only the booking tenant may call this endpoint.
 * Optional body: { reason: string }
 */
export async function disputeBooking(req: Request, res: Response): Promise<void> {
  const authUser = (req as Request & { user?: { id: string } }).user;
  if (!authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
  const result = await bookingService.disputeBooking(req.params.id, authUser.id, reason);

  if (!result.success) {
    const statusCode =
      result.error?.startsWith('Forbidden') ? 403
      : result.error === 'Booking not found'  ? 404
      : 400;
    res.status(statusCode).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

export async function updateBooking(req: Request, res: Response): Promise<void> {
  const result = await bookingService.updateBooking(req.params.id, req.body);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

export async function deleteBooking(req: Request, res: Response): Promise<void> {
  const result = await bookingService.deleteBooking(req.params.id);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(204).send();
}

/**
 * GET /api/v1/bookings/:id/calendar.ics
 *
 * Returns a downloadable .ics file for the booking.
 * Only the booking's tenant is allowed to fetch it.
 */
export async function getBookingCalendar(req: Request, res: Response): Promise<void> {
  const authUser = (req as Request & { user?: { id: string } }).user;

  const bookingResult = await bookingService.getBookingById(req.params.id);
  if (!bookingResult.success || !bookingResult.data) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  const booking = bookingResult.data;

  // Authorization: only the tenant may download their own calendar event
  if (!authUser || authUser.id !== booking.tenant_id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (!booking.check_in || !booking.check_out) {
    res.status(422).json({ error: 'Booking is missing date information' });
    return;
  }

  // Fetch property details for location and title
  let propertyTitle = 'Rental Stay';
  let propertyLocation = '';
  if (booking.property_id) {
    const propResult = await getPropertyById(booking.property_id);
    if (propResult.success && propResult.data) {
      const p = propResult.data;
      propertyTitle = p.title ?? propertyTitle;
      const parts = [p.address, p.city, p.country].filter(Boolean);
      propertyLocation = parts.join(', ');
    }
  }

  const description = [
    `Booking ID: ${booking.id}`,
    `Guests: ${booking.guest_count ?? 1}`,
    `Total: ${booking.total_price ?? ''} USDC`,
    `Status: ${booking.status ?? ''}`,
  ]
    .filter(Boolean)
    .join('\\n');

  const ics = generateIcs({
    uid: `booking-${booking.id}@rentars.app`,
    summary: `Stay at ${propertyTitle}`,
    description,
    location: propertyLocation,
    dtStart: booking.check_in,
    dtEnd: booking.check_out,
    created: booking.created_at,
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="booking-${booking.id}.ics"`);
  res.send(ics);
}

/**
 * GET /api/v1/bookings/:id/receipt.pdf
 *
 * Generates and streams a PDF receipt for the booking.
 * Only the booking's tenant or the property's host may download it.
 */
export async function getBookingReceipt(req: Request, res: Response): Promise<void> {
  const authUser = (req as Request & { user?: { id: string } }).user;

  if (!authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const bookingResult = await bookingService.getBookingById(req.params.id);
  if (!bookingResult.success || !bookingResult.data) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  const booking = bookingResult.data;

  // Fetch property to check host ownership
  let hostOwnerId: string | undefined;
  if (booking.property_id) {
    const propResult = await getPropertyById(booking.property_id);
    if (propResult.success && propResult.data) {
      hostOwnerId = propResult.data.owner_id;
    }
  }

  // Authorisation: tenant or host only
  const isTenant = authUser.id === booking.tenant_id;
  const isHost = !!hostOwnerId && authUser.id === hostOwnerId;

  if (!isTenant && !isHost) {
    res.status(403).json({ error: 'Forbidden: only the tenant or host may download this receipt' });
    return;
  }

  // Only allow receipts for completed/confirmed bookings
  const receiptableStatuses = ['Confirmed', 'Completed', 'confirmed', 'completed'];
  if (!booking.status || !receiptableStatuses.includes(booking.status)) {
    res.status(422).json({ error: 'Receipt is only available for confirmed or completed bookings' });
    return;
  }

  const receiptResult = await fetchReceiptData(req.params.id);
  if (!receiptResult.success || !receiptResult.data) {
    res.status(500).json({ error: receiptResult.error ?? 'Failed to fetch receipt data' });
    return;
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = generateReceiptPdf(receiptResult.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate PDF receipt' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${booking.id}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}

/**
 * POST /api/v1/bookings/:id/dispute
 *
 * Raise a dispute on a booking. Only the tenant or host may raise a dispute.
 */
export async function raiseDispute(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { reason, details } = req.body as { reason: string; details?: string };

  const result = await bookingService.raiseDispute(req.params.id, userId, reason, details);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

/**
 * POST /api/v1/bookings/:id/dispute/resolve
 *
 * Resolve a dispute on a booking. Only admins/moderators may resolve disputes.
 */
export async function resolveDispute(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // TODO: Check if user is admin/moderator
  // For now, we'll return 403 for all users until admin role check is implemented
  // In a real implementation, you would check user role here
  const isAdmin = false; // Placeholder - replace with actual admin check

  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: only admins may resolve disputes' });
    return;
  }

  const { resolution, admin_notes } = req.body as { 
    resolution: 'refund_tenant' | 'release_to_host'; 
    admin_notes?: string;
  };

  const result = await bookingService.resolveDispute(
    req.params.id, 
    userId, 
    resolution, 
    admin_notes
  );

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}
