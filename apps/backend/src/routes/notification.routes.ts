import { Router } from 'express';
import {
  clearAllNotifications,
  getNotificationPreferences,
  getPreferencesByToken,
  listNotifications,
  readAllNotifications,
  readNotification,
  registerPushSubscription,
  removeNotification,
  unregisterPushSubscription,
  updateNotificationPreferences,
  updatePreferencesByToken,
} from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// GET /api/v1/notifications
router.get('/', authenticate, listNotifications);

// PATCH /api/v1/notifications/read-all
router.patch('/read-all', authenticate, readAllNotifications);

// DELETE /api/v1/notifications/clear-all
router.delete('/clear-all', authenticate, clearAllNotifications);

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', authenticate, readNotification);

// DELETE /api/v1/notifications/:id
router.delete('/:id', authenticate, removeNotification);

// GET /api/v1/notifications/preferences  (authenticated)
router.get('/preferences', authenticate, getNotificationPreferences);

// PATCH /api/v1/notifications/preferences  (authenticated)
router.patch('/preferences', authenticate, updateNotificationPreferences);

// GET  /api/v1/notifications/manage-preferences?token=...  (token-based, no login)
router.get('/manage-preferences', getPreferencesByToken);

// PATCH /api/v1/notifications/manage-preferences?token=...  (token-based, no login)
router.patch('/manage-preferences', updatePreferencesByToken);

// POST /api/v1/notifications/push/subscribe
router.post('/push/subscribe', authenticate, registerPushSubscription);

// POST /api/v1/notifications/push/unsubscribe
router.post('/push/unsubscribe', authenticate, unregisterPushSubscription);

export default router;
