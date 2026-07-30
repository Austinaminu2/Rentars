import type { Response } from 'express';
import type { AuthRequest } from '@/middleware/auth.middleware.js';
import {
  getHostDashboardSummary,
  getHostProperties,
  updatePropertyStatus,
} from '@/services/hostDashboard.service.js';

/**
 * GET /api/v1/host/dashboard
 *
 * Returns a summary of the authenticated host's properties, bookings,
 * upcoming reservations, and revenue metrics.
 */
export async function getHostDashboard(req: AuthRequest, res: Response): Promise<void> {
  const hostId = req.userId;
  if (!hostId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = await getHostDashboardSummary(hostId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

/**
 * GET /api/v1/host/properties
 *
 * Returns the authenticated host's properties with booking counts and ratings.
 * Supports pagination via ?page=&limit= query params.
 */
export async function listHostProperties(req: AuthRequest, res: Response): Promise<void> {
  const hostId = req.userId;
  if (!hostId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  if (Number.isNaN(page) || page < 1) {
    res.status(422).json({ error: 'page must be a positive integer' });
    return;
  }
  if (Number.isNaN(limit) || limit < 1 || limit > 100) {
    res.status(422).json({ error: 'limit must be between 1 and 100' });
    return;
  }

  const result = await getHostProperties(hostId, page, limit);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}

/**
 * PATCH /api/v1/host/properties/:id/status
 *
 * Updates the status (draft / published / unpublished) of a property.
 * Only the authenticated owner may change their property status.
 */
export async function patchPropertyStatus(req: AuthRequest, res: Response): Promise<void> {
  const hostId = req.userId;
  if (!hostId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const propertyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { status } = req.body as { status?: string };

  if (!status || !['draft', 'published', 'unpublished'].includes(status)) {
    res.status(422).json({
      error: "status must be one of: 'draft', 'published', 'unpublished'",
    });
    return;
  }

  const result = await updatePropertyStatus(
    propertyId,
    hostId,
    status as 'draft' | 'published' | 'unpublished',
  );

  if (!result.success) {
    const isForbidden = result.error?.includes('Forbidden');
    res.status(isForbidden ? 403 : 400).json({ error: result.error });
    return;
  }

  res.json(result.data);
}
