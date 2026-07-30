import { Router } from 'express';
import {
  cancelBooking,
  completeBooking,
  confirmBooking,
  createBooking,
  deleteBooking,
  disputeBooking,
  getBooking,
  getBookingCalendar,
  getBookingReceipt,
  getBookingStatusHistory,
  listUserBookings,
  raiseDispute,
  resolveDispute,
  updateBooking,
} from '@/controllers/booking.controller.js';
import { authenticate } from '@/middleware/auth.middleware.js';
import { requireEmailVerified } from '@/middleware/emailVerified.middleware.js';
import { bookingRateLimiter } from '@/middleware/rateLimiter.js';
import {
  createBookingSchema,
  raiseDisputeSchema,
  resolveDisputeSchema,
  updateBookingSchema,
  validateBody,
} from '@/validators/booking.validator.js';

const router = Router();

// GET /api/v1/bookings — list current user's bookings (cursor pagination)
router.get('/', authenticate, listUserBookings);

// GET /api/v1/bookings/:id
router.get('/:id', authenticate, getBooking);

// GET /api/v1/bookings/:id/status-history
router.get('/:id/status-history', authenticate, getBookingStatusHistory);

// GET /api/v1/bookings/:id/calendar.ics
router.get('/:id/calendar.ics', authenticate, getBookingCalendar);

// GET /api/v1/bookings/:id/receipt.pdf
router.get('/:id/receipt.pdf', authenticate, getBookingReceipt);

// POST /api/v1/bookings  (requires email verification)
router.post(
  '/',
  authenticate,
  requireEmailVerified,
  bookingRateLimiter,
  validateBody(createBookingSchema),
  createBooking,
);

// POST /api/v1/bookings/:id/confirm
// Tenant confirms check-in → releases escrow to host → status: Confirmed
router.post('/:id/confirm', authenticate, confirmBooking);

// POST /api/v1/bookings/:id/complete
// Tenant marks stay as completed → status: Completed
router.post('/:id/complete', authenticate, completeBooking);

// POST /api/v1/bookings/:id/dispute
// Tenant raises a dispute → status: Disputed (escrow held)
// Body: { reason?: string }
router.post('/:id/dispute', authenticate, disputeBooking);

// POST /api/v1/bookings/:id/cancel
router.post('/:id/cancel', authenticate, cancelBooking);

// POST /api/v1/bookings/:id/dispute
router.post('/:id/dispute', authenticate, validateBody(raiseDisputeSchema), raiseDispute);

// POST /api/v1/bookings/:id/dispute/resolve
router.post('/:id/dispute/resolve', authenticate, validateBody(resolveDisputeSchema), resolveDispute);

// PATCH /api/v1/bookings/:id
router.patch('/:id', authenticate, validateBody(updateBookingSchema), updateBooking);

// DELETE /api/v1/bookings/:id
router.delete('/:id', authenticate, deleteBooking);

export default router;
