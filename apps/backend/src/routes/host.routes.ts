import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware.js';
import { getHostEarnings } from '@/controllers/earnings.controller.js';
import {
  getHostDashboard,
  listHostProperties,
  patchPropertyStatus,
} from '@/controllers/hostDashboard.controller.js';

const router = Router();

// GET /api/v1/host/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/earnings', authenticate, getHostEarnings);

// GET /api/v1/host/dashboard — summary stats for the host dashboard
router.get('/dashboard', authenticate, getHostDashboard);

// GET /api/v1/host/properties — host-scoped property listing with booking counts
router.get('/properties', authenticate, listHostProperties);

// PATCH /api/v1/host/properties/:id/status — publish/unpublish/draft a property
router.patch('/properties/:id/status', authenticate, patchPropertyStatus);

export default router;
