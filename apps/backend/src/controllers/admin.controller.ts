import type { Request, Response } from 'express';
import { rateLimitStore } from '@/services/rateLimitStore.service.js';
import { setFeatured, clearFeatured, FEATURED_CAP } from '@/services/property.service.js';
import { getTopQueries, getZeroResultQueries, getDailySearchVolume } from '@/services/searchAnalytics.service.js';
import { auditLogger } from '@/services/auditLogger.service.js';
import { supabase } from '@/config/supabase.js';
import type { AdminRequest } from '@/middleware/admin.middleware.js';
import { z } from 'zod';

// ─── Featured listings ────────────────────────────────────────────────────────

/** Zod schema for the set-featured request body. */
const setFeaturedSchema = z.object({
  /**
   * ISO 8601 datetime until which the property is featured.
   * Must be a future timestamp.
   */
  featured_until: z
    .string()
    .datetime({ message: 'featured_until must be a valid ISO 8601 datetime string' }),

  /**
   * Optional ordering tiebreaker (higher = shown first among featured listings).
   * Defaults to 0.  Capped at 100 to keep the range sensible.
   */
  weight: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(0),
});

/**
 * PUT /api/v1/admin/properties/:id/featured
 *
 * Mark a property as featured for a given time window.
 *
 * Body:
 *   featured_until  — ISO 8601 datetime (required, must be future)
 *   weight          — integer 0–100, ordering tiebreaker (optional, default 0)
 *
 * Response: the updated property row.
 */
export async function setFeaturedHandler(req: Request, res: Response): Promise<void> {
  const propertyId = req.params.id;
  if (!propertyId) {
    res.status(400).json({ error: 'Property ID is required' });
    return;
  }

  const parsed = setFeaturedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { featured_until, weight } = parsed.data;

  const result = await setFeatured(propertyId, featured_until, weight);
  if (!result.success) {
    // setFeatured returns a user-readable error for bad inputs (past date, not found)
    const status = result.error?.includes('required')
      ? 400
      : result.error?.includes('future')
        ? 422
        : 400;
    res.status(status).json({ error: result.error });
    return;
  }

  res.json({
    data: result.data,
    meta: {
      featured_cap: FEATURED_CAP,
      message: `Property will be featured until ${featured_until}.`,
    },
  });
}

/**
 * DELETE /api/v1/admin/properties/:id/featured
 *
 * Remove the featured status from a property immediately.
 * Sets featured_until to NULL and featured_weight to 0.
 *
 * Response: the updated property row.
 */
export async function clearFeaturedHandler(req: Request, res: Response): Promise<void> {
  const propertyId = req.params.id;
  if (!propertyId) {
    res.status(400).json({ error: 'Property ID is required' });
    return;
  }

  const result = await clearFeatured(propertyId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    data: result.data,
    meta: { message: 'Featured status removed.' },
  });
}

// ─── Search analytics dashboard ──────────────────────────────────────────────

const analyticsQuerySchema = z.object({
  start_date: z.string().datetime({ message: 'start_date must be a valid ISO 8601 datetime' }),
  end_date: z.string().datetime({ message: 'end_date must be a valid ISO 8601 datetime' }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/v1/admin/analytics/search/top-queries
 *
 * Returns the most frequently searched terms within a date range.
 *
 * Query params: start_date (ISO datetime), end_date (ISO datetime), limit (default 20, max 100)
 */
export async function getTopQueriesHandler(req: Request, res: Response): Promise<void> {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { start_date, end_date, limit } = parsed.data;

  if (new Date(end_date) <= new Date(start_date)) {
    res.status(400).json({ error: 'end_date must be after start_date' });
    return;
  }

  const result = await getTopQueries(start_date, end_date, limit);
  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  res.json({ data: result.data, meta: { start_date, end_date, limit } });
}

/**
 * GET /api/v1/admin/analytics/search/zero-results
 *
 * Returns the most frequently searched terms that yielded zero results.
 *
 * Query params: start_date (ISO datetime), end_date (ISO datetime), limit (default 20, max 100)
 */
export async function getZeroResultQueriesHandler(req: Request, res: Response): Promise<void> {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { start_date, end_date, limit } = parsed.data;

  if (new Date(end_date) <= new Date(start_date)) {
    res.status(400).json({ error: 'end_date must be after start_date' });
    return;
  }

  const result = await getZeroResultQueries(start_date, end_date, limit);
  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  res.json({ data: result.data, meta: { start_date, end_date, limit } });
}

/**
 * GET /api/v1/admin/analytics/search/volume
 *
 * Returns daily search volume within a date range.
 *
 * Query params: start_date (ISO datetime), end_date (ISO datetime)
 */
export async function getSearchVolumeHandler(req: Request, res: Response): Promise<void> {
  const schema = analyticsQuerySchema.omit({ limit: true });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { start_date, end_date } = parsed.data;

  if (new Date(end_date) <= new Date(start_date)) {
    res.status(400).json({ error: 'end_date must be after start_date' });
    return;
  }

  const result = await getDailySearchVolume(start_date, end_date);
  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  res.json({ data: result.data, meta: { start_date, end_date } });
}

// ─── Rate-limit summary ───────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/rate-limits
 *
 * Returns a summary of rate-limit rejections over a requested time window.
 * Requires admin authentication (handled by the route middleware).
 *
 * Query params:
 *   window  - time window in seconds (default 3600 = 1 hour; max 604800 = 7 days)
 *
 * Response shape:
 * {
 *   windowSeconds: number,
 *   since: ISO string,
 *   total: number,
 *   byRoute: [{ route, method, scope, count }]  // sorted by count desc
 * }
 */
export async function getRateLimitSummary(req: Request, res: Response): Promise<void> {
  const MAX_WINDOW = 60 * 60 * 24 * 7; // 7 days

  const rawWindow = req.query.window;
  let windowSeconds = 3600;

  if (rawWindow !== undefined) {
    const parsed = Number(rawWindow);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'Query parameter "window" must be a positive integer (seconds).' });
      return;
    }
    windowSeconds = Math.min(parsed, MAX_WINDOW);
  }

  const summary = await rateLimitStore.getSummary(windowSeconds);

  res.json({
    ...summary,
    // Alerting hint: expose a threshold flag operators can wire to external alerting
    alert: summary.total > Number(process.env.RATE_LIMIT_ALERT_THRESHOLD || '100'),
  });
}

// ─── User management ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/users
 * List all users with role, status, join date. Supports pagination.
 */
export async function listUsers(req: AdminRequest, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('users')
    .select('id, email, role, status, created_at, email_verified', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  res.json({ data, meta: { page, limit, total: count ?? 0 } });
}

/**
 * GET /api/v1/admin/users/:id
 * User detail with booking history.
 */
export async function getUserDetail(req: AdminRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const [userResult, bookingsResult] = await Promise.all([
    supabase
      .from('users')
      .select('id, email, role, status, created_at, email_verified')
      .eq('id', id)
      .single(),
    supabase
      .from('bookings')
      .select('id, property_id, status, check_in, check_out, total_price, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (userResult.error || !userResult.data) {
    res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    return;
  }

  res.json({ data: { user: userResult.data, bookings: bookingsResult.data ?? [] } });
}

/**
 * POST /api/v1/admin/users/:id/suspend
 */
export async function suspendUser(req: AdminRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const { error } = await supabase
    .from('users')
    .update({ status: 'suspended' })
    .eq('id', id);

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  await auditLogger.log({
    actorId: req.adminId,
    action: 'admin.user_suspend',
    resourceType: 'user',
    resourceId: id,
    ip: req.ip,
  });

  res.json({ message: 'User suspended.' });
}

/**
 * POST /api/v1/admin/users/:id/activate
 */
export async function activateUser(req: AdminRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const { error } = await supabase
    .from('users')
    .update({ status: 'active' })
    .eq('id', id);

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  await auditLogger.log({
    actorId: req.adminId,
    action: 'admin.user_activate',
    resourceType: 'user',
    resourceId: id,
    ip: req.ip,
  });

  res.json({ message: 'User activated.' });
}

// ─── Property management ──────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/properties
 * List all properties with status filter support.
 */
export async function listAdminProperties(req: AdminRequest, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;

  let query = supabase
    .from('properties')
    .select('id, title, status, owner_id, price_per_night, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  res.json({ data, meta: { page, limit, total: count ?? 0 } });
}

/**
 * POST /api/v1/admin/properties/:id/suspend
 */
export async function suspendProperty(req: AdminRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const { error } = await supabase
    .from('properties')
    .update({ status: 'suspended' })
    .eq('id', id);

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  await auditLogger.log({
    actorId: req.adminId,
    action: 'admin.property_suspend',
    resourceType: 'property',
    resourceId: id,
    ip: req.ip,
  });

  res.json({ message: 'Property suspended.' });
}

/**
 * POST /api/v1/admin/properties/:id/activate
 */
export async function activateProperty(req: AdminRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const { error } = await supabase
    .from('properties')
    .update({ status: 'active' })
    .eq('id', id);

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  await auditLogger.log({
    actorId: req.adminId,
    action: 'admin.property_activate',
    resourceType: 'property',
    resourceId: id,
    ip: req.ip,
  });

  res.json({ message: 'Property activated.' });
}

// ─── Bookings (admin view) ────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/bookings
 * List all bookings with status filter support.
 */
export async function listAdminBookings(req: AdminRequest, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;

  let query = supabase
    .from('bookings')
    .select('id, property_id, user_id, status, check_in, check_out, total_price, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  res.json({ data, meta: { page, limit, total: count ?? 0 } });
}

// ─── Dispute management ───────────────────────────────────────────────────────

const resolveDisputeSchema = z.object({
  resolution_note: z.string().min(1, 'resolution_note is required').max(2000),
  outcome: z.enum(['refund_tenant', 'release_to_host', 'split']).optional(),
});

/**
 * GET /api/v1/admin/disputes
 * List open disputes.
 */
export async function listDisputes(req: AdminRequest, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('bookings')
    .select('id, property_id, user_id, status, check_in, check_out, total_price, created_at', { count: 'exact' })
    .eq('status', 'disputed')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  res.json({ data, meta: { page, limit, total: count ?? 0 } });
}

/**
 * POST /api/v1/admin/disputes/:id/resolve
 * Resolve a dispute with a resolution note.
 */
export async function resolveDispute(req: AdminRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const parsed = resolveDisputeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors } });
    return;
  }

  const { resolution_note, outcome } = parsed.data;

  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'dispute_resolved',
      dispute_resolution_note: resolution_note,
      dispute_resolved_at: new Date().toISOString(),
      dispute_outcome: outcome ?? null,
    })
    .eq('id', id)
    .eq('status', 'disputed');

  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }

  await auditLogger.log({
    actorId: req.adminId,
    action: 'dispute.resolve',
    resourceType: 'dispute',
    resourceId: id,
    ip: req.ip,
    meta: { resolution_note, outcome },
  });

  res.json({ message: 'Dispute resolved.', resolution_note, outcome });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/dashboard
 * Aggregate stats + recent security events.
 */
export async function getDashboard(req: AdminRequest, res: Response): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [usersResult, propertiesResult, bookingsThisWeekResult, disputesResult, recentAuditResult] =
    await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'disputed'),
      supabase
        .from('audit_logs')
        .select('id, timestamp, actor_id, action, resource_type, resource_id, ip')
        .order('timestamp', { ascending: false })
        .limit(10),
    ]);

  res.json({
    data: {
      totalUsers: usersResult.count ?? 0,
      activeListings: propertiesResult.count ?? 0,
      bookingsThisWeek: bookingsThisWeekResult.count ?? 0,
      openDisputes: disputesResult.count ?? 0,
      recentSecurityEvents: recentAuditResult.data ?? [],
    },
  });
}
