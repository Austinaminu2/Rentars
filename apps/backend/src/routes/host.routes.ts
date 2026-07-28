import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware.js';
import { getHostEarnings } from '@/controllers/earnings.controller.js';

const router = Router();

// GET /api/v1/host/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/earnings', authenticate, getHostEarnings);

export default router;
