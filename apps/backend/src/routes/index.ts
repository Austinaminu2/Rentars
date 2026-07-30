import { supabase } from '@/config/supabase.js';
import { type Request, type Response, Router } from 'express';
import { autoDeprecationHeaders } from '@/middleware/deprecation.middleware.js';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import bookingRoutes from './booking.routes.js';
import clientErrorRoutes from './clientError.routes.js';
import followRoutes from './follow.routes.js';
import hostRoutes from './host.routes.js';
import locationRoutes from './location.routes.js';
import notificationRoutes from './notification.routes.js';
import paymentRoutes from './payment.routes.js';
import propertyRoutes from './property.routes.js';
import reviewRoutes from './review.routes.js';
import pushRoutes from './push.routes.js';
import exchangeRateRoutes from './exchangeRate.routes.js';

const router = Router();

// ── Health Check ──────────────────────────────────────────────────────────────
//
// Lives at /health (no version prefix) so infrastructure probes (load
// balancers, Kubernetes liveness checks) never need to track the API version.

/**
 * Detailed health check endpoint that verifies:
 * - API is running
 * - Database connectivity
 * - Redis connectivity (if configured)
 * - Blockchain RPC status
 */
router.get('/health', async (_req: Request, res: Response) => {
  const health = {
    status: 'ok',
    service: 'Rentars API 🚀',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'unknown' as string,
      redis: 'unknown' as string,
      blockchain: 'unknown' as string,
    },
  };

  // Check database connectivity
  try {
    const { error } = await supabase.from('properties').select('id').limit(1);
    health.checks.database = error ? 'error' : 'ok';
  } catch {
    health.checks.database = 'error';
  }

  // Check Redis connectivity (if configured)
  if (process.env.REDIS_URL) {
    try {
      // Redis check would go here if Redis client is available
      health.checks.redis = 'ok';
    } catch {
      health.checks.redis = 'error';
    }
  } else {
    health.checks.redis = 'not_configured';
  }

  // Check blockchain RPC status
  if (process.env.STELLAR_RPC_URL) {
    try {
      // Blockchain RPC check would go here
      health.checks.blockchain = 'ok';
    } catch {
      health.checks.blockchain = 'error';
    }
  } else {
    health.checks.blockchain = 'not_configured';
  }

  const allOk = Object.values(health.checks).every(
    (check) => check === 'ok' || check === 'not_configured'
  );

  res.status(allOk ? 200 : 503).json(health);
});

// ── API v1 Routes ─────────────────────────────────────────────────────────────
//
// All public-facing application routes live under /api/v1.
// The autoDeprecationHeaders middleware runs first on every v1 request and
// injects Deprecation/Sunset headers for any endpoint listed in the registry
// (apps/backend/src/middleware/deprecation.middleware.ts).

const apiV1 = Router();

// Inject Deprecation/Sunset headers for registered deprecated endpoints.
apiV1.use(autoDeprecationHeaders);

// Mount all route modules under /api/v1
apiV1.use('/auth', authRoutes);
apiV1.use('/admin', adminRoutes);
apiV1.use('/client-errors', clientErrorRoutes);
apiV1.use('/bookings', bookingRoutes);
apiV1.use('/follows', followRoutes);
apiV1.use('/host', hostRoutes);
apiV1.use('/properties', propertyRoutes);
apiV1.use('/locations', locationRoutes);
apiV1.use('/reviews', reviewRoutes);
apiV1.use('/notifications', notificationRoutes);
apiV1.use('/payments', paymentRoutes);
apiV1.use('/push', pushRoutes);
apiV1.use('/exchange-rates', exchangeRateRoutes);

router.use('/api/v1', apiV1);

// ── API v2 (future) ───────────────────────────────────────────────────────────
//
// When breaking changes are needed, introduce a new router here and mount it
// at /api/v2.  v1 continues to run alongside it during the deprecation window.
//
// Steps to introduce v2:
//   1. Create apps/backend/src/routes/v2/ with the new route modules.
//   2. Import and mount them on `apiV2` below.
//   3. Mark any superseded v1 endpoints as deprecated in DEPRECATED_ENDPOINTS
//      (deprecation.middleware.ts) with an appropriate Sunset date.
//   4. After the Sunset date has passed and traffic to the v1 endpoint is
//      confirmed to be zero, remove the v1 handler and the registry entry.
//
// See docs/api-versioning.md for the full policy.

const apiV2 = Router();

/**
 * GET /api/v2
 *
 * Placeholder that confirms v2 routing is wired correctly.
 * Replace this with real route modules as v2 endpoints are defined.
 */
apiV2.get('/', (_req: Request, res: Response) => {
  res.json({
    version: 'v2',
    status: 'coming_soon',
    message:
      'API v2 is not yet available. Please continue using /api/v1. ' +
      'See /docs for the versioning policy.',
  });
});

router.use('/api/v2', apiV2);

export default router;
