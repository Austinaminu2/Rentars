import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware.js';
import { bookingRateLimiter } from '@/middleware/rateLimiter.js';
import { submitPayment, getStatus, retryPayment } from '@/controllers/payment.controller.js';

const router = Router();

// All payment routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/payments/submit
 * Submit a signed XDR to Stellar and create a tracked payment intent.
 */
router.post('/submit', bookingRateLimiter, submitPayment);

/**
 * GET /api/v1/payments/:id/status
 * Poll current payment status. Frontend polls every 3s while status=submitted.
 */
router.get('/:id/status', getStatus);

/**
 * POST /api/v1/payments/:id/retry
 * Retry a failed or timed-out payment safely (double-spend protected).
 */
router.post('/:id/retry', bookingRateLimiter, retryPayment);

export default router;
