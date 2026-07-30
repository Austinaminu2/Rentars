import { Router } from 'express';
import { requireAdmin } from '@/middleware/admin.middleware.js';
import {
  getRateLimitSummary,
  setFeaturedHandler,
  clearFeaturedHandler,
  getTopQueriesHandler,
  getZeroResultQueriesHandler,
  getSearchVolumeHandler,
  // User management
  listUsers,
  getUserDetail,
  suspendUser,
  activateUser,
  // Property management
  listAdminProperties,
  suspendProperty,
  activateProperty,
  // Bookings
  listAdminBookings,
  // Disputes
  listDisputes,
  resolveDispute,
  // Dashboard
  getDashboard,
} from '@/controllers/admin.controller.js';

const router = Router();

/**
 * All routes in this file require an admin JWT.
 */
router.use(requireAdmin);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', getDashboard);

// ── User management ───────────────────────────────────────────────────────────
router.get('/users', listUsers);
router.get('/users/:id', getUserDetail);
router.post('/users/:id/suspend', suspendUser);
router.post('/users/:id/activate', activateUser);

// ── Property management ───────────────────────────────────────────────────────
router.get('/properties', listAdminProperties);
router.post('/properties/:id/suspend', suspendProperty);
router.post('/properties/:id/activate', activateProperty);

// ── Featured listings ─────────────────────────────────────────────────────────
router.put('/properties/:id/featured', setFeaturedHandler);
router.delete('/properties/:id/featured', clearFeaturedHandler);

// ── Bookings (admin view) ─────────────────────────────────────────────────────
router.get('/bookings', listAdminBookings);

// ── Disputes ──────────────────────────────────────────────────────────────────
router.get('/disputes', listDisputes);
router.post('/disputes/:id/resolve', resolveDispute);

// ── Rate-limit summary ────────────────────────────────────────────────────────
router.get('/rate-limits', getRateLimitSummary);

// ── Search analytics dashboard ────────────────────────────────────────────────
router.get('/analytics/search/top-queries', getTopQueriesHandler);
router.get('/analytics/search/zero-results', getZeroResultQueriesHandler);
router.get('/analytics/search/volume', getSearchVolumeHandler);

export default router;

// ── Featured listings ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/properties/{id}/featured:
 *   put:
 *     tags: [Admin]
 *     summary: Mark a property as featured
 *     description: |
 *       Sets the featured window for a property.  The property will appear
 *       prominently in search results and on the homepage until featured_until
 *       passes.  At most FEATURED_CAP (6) listings surface at any time.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Property UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [featured_until]
 *             properties:
 *               featured_until:
 *                 type: string
 *                 format: date-time
 *                 description: ISO 8601 datetime until which the property is featured (must be future)
 *               weight:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 default: 0
 *                 description: Ordering tiebreaker — higher value appears first
 *     responses:
 *       200:
 *         description: Property updated with new featured window
 *       400:
 *         description: Missing or invalid fields
 *       422:
 *         description: featured_until is not a future date
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an admin
 */
router.put('/properties/:id/featured', setFeaturedHandler);

/**
 * @openapi
 * /api/v1/admin/properties/{id}/featured:
 *   delete:
 *     tags: [Admin]
 *     summary: Remove featured status from a property
 *     description: |
 *       Immediately clears featured_until and featured_weight.
 *       The property will no longer appear in featured listings.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Property UUID
 *     responses:
 *       200:
 *         description: Featured status removed
 *       400:
 *         description: Invalid property ID
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an admin
 */
router.delete('/properties/:id/featured', clearFeaturedHandler);

// ── Rate-limit summary ────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/rate-limits:
 *   get:
 *     tags: [Admin]
 *     summary: Rate-limit rejection summary
 *     description: |
 *       Returns aggregated counts of rate-limit rejections grouped by route,
 *       method, and limiter scope over a configurable time window.
 *       Identities are hashed — no raw IP addresses or user IDs are exposed.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: window
 *         schema:
 *           type: integer
 *           default: 3600
 *         description: Time window in seconds (max 604800 = 7 days)
 *     responses:
 *       200:
 *         description: Summary payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 windowSeconds: { type: integer }
 *                 since: { type: string, format: date-time }
 *                 total: { type: integer }
 *                 alert: { type: boolean }
 *                 byRoute:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       route: { type: string }
 *                       method: { type: string }
 *                       scope: { type: string }
 *                       count: { type: integer }
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an admin
 */
router.get('/rate-limits', getRateLimitSummary);

// ── Search analytics dashboard ────────────────────────────────────────────────

/**
 * GET /api/v1/admin/analytics/search/top-queries
 * Query: start_date, end_date (ISO datetime), limit (1–100, default 20)
 */
router.get('/analytics/search/top-queries', getTopQueriesHandler);

/**
 * GET /api/v1/admin/analytics/search/zero-results
 * Query: start_date, end_date (ISO datetime), limit (1–100, default 20)
 */
router.get('/analytics/search/zero-results', getZeroResultQueriesHandler);

/**
 * GET /api/v1/admin/analytics/search/volume
 * Query: start_date, end_date (ISO datetime)
 */
router.get('/analytics/search/volume', getSearchVolumeHandler);

// ── Audit log ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/audit-logs
 * Query: actorId, action, targetType, targetId (optional filters), limit (default 50, max 200)
 */
router.get('/audit-logs', getAuditLogsHandler);

export default router;
