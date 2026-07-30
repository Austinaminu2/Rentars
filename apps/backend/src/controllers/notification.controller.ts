import type { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import {
  deleteAllNotifications,
  deleteNotification,
  getNotifications,
  getNotificationsCursor,
  getPreferences,
  markAllAsRead,
  markAsRead,
  updatePreferences,
} from '../services/notification.service.js';
import {
  type PushSubscription,
  removePushSubscription,
  savePushSubscription,
} from '../services/push.service.js';
import { verifyPreferenceToken } from '../services/preferenceToken.js';

export async function listNotifications(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // If ?cursor param is present (or ?limit), use cursor pagination
  const hasCursorParam = 'cursor' in req.query;
  const hasLimitParam = 'limit' in req.query;

  if (hasCursorParam || hasLimitParam) {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    if (Number.isNaN(limit) || limit < 1) {
      res.status(422).json({ error: 'limit must be a positive integer' });
      return;
    }

    const result = await getNotificationsCursor(userId, cursor, limit);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.data);
    return;
  }

  // Fallback: legacy offset-compatible list (returns flat array)
  const result = await getNotifications(userId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

export async function readNotification(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = await markAsRead(req.params.id, userId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(204).send();
}

export async function readAllNotifications(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = await markAllAsRead(userId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(204).send();
}

export async function removeNotification(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = await deleteNotification(req.params.id, userId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(204).send();
}

export async function clearAllNotifications(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = await deleteAllNotifications(userId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ deleted: result.data });
}

export async function getNotificationPreferences(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = await getPreferences(userId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

export async function updateNotificationPreferences(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { email_notifications, push_notifications, notification_types } = req.body as {
    email_notifications?: boolean;
    push_notifications?: boolean;
    notification_types?: Record<string, boolean>;
  };

  const result = await updatePreferences(userId, {
    ...(email_notifications !== undefined && { email_notifications }),
    ...(push_notifications !== undefined && { push_notifications }),
    ...(notification_types !== undefined && { notification_types }),
  });

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

export async function registerPushSubscription(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const subscription = req.body as PushSubscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    res.status(400).json({ error: 'Invalid push subscription' });
    return;
  }

  const result = await savePushSubscription(userId, subscription);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json(result.data);
}

export async function unregisterPushSubscription(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ error: 'Missing endpoint' });
    return;
  }

  const result = await removePushSubscription(userId, endpoint);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(204).send();
}

// ─── Token-based preference management (no login required) ───────────────────

/**
 * GET /api/v1/notifications/manage-preferences?token=<signed-token>
 *
 * Resolves the token and returns the current preferences for the encoded user.
 * Intended for use by the public /preferences/manage frontend page.
 */
export async function getPreferencesByToken(req: Request, res: Response): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  const userId = verifyPreferenceToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const result = await getPreferences(userId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

/**
 * PATCH /api/v1/notifications/manage-preferences?token=<signed-token>
 *
 * Updates notification preferences using the token-encoded user — no auth
 * header required.  Accepts the same body shape as the authenticated PATCH
 * /preferences endpoint.
 *
 * A special `unsubscribe_all=true` shorthand disables all optional
 * email notifications in a single call (honour the unsubscribe link).
 */
export async function updatePreferencesByToken(req: Request, res: Response): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  const userId = verifyPreferenceToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const {
    email_notifications,
    push_notifications,
    notification_types,
    unsubscribe_all,
  } = req.body as {
    email_notifications?: boolean;
    push_notifications?: boolean;
    notification_types?: Record<string, boolean>;
    unsubscribe_all?: boolean;
  };

  // Honour the one-click unsubscribe shorthand
  if (unsubscribe_all) {
    const result = await updatePreferences(userId, { email_notifications: false });
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.data);
    return;
  }

  const result = await updatePreferences(userId, {
    ...(email_notifications !== undefined && { email_notifications }),
    ...(push_notifications !== undefined && { push_notifications }),
    ...(notification_types !== undefined && { notification_types }),
  });

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}
