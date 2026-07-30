/**
 * Role-based access control middleware.
 *
 * Usage:
 *   router.post('/admin/action', authenticate, authorizeRole('admin'), handler);
 *   router.post('/property', authenticate, authorizeRole('host', 'admin'), handler);
 *
 * Must be used after the `authenticate` middleware which populates req.user.
 */

import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth.middleware.js';

/**
 * Returns middleware that allows only the specified roles.
 * Responds 403 if the authenticated user's role is not in the allowed list.
 */
export function authorizeRole(...allowedRoles: string[]) {
  return function roleMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): void {
    const userRole = req.user?.role;

    if (!userRole) {
      res.status(403).json({
        error: { code: 'MISSING_ROLE', message: 'Access denied: no role assigned to this account.' },
      });
      return;
    }

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: `Access denied: requires one of [${allowedRoles.join(', ')}].`,
        },
      });
      return;
    }

    next();
  };
}
