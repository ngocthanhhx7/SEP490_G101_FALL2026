import { createNotificationController } from '../controllers/notification.controller.js';
import { Router } from 'express';
import { requireCsrf, requireSession } from '../middlewares/session.js';

export function createNotificationRouter({
  service,
  sessionPort,
  allowedOrigins,
  clock
} = {}) {
  if (
    !service ||
    typeof service.list !== 'function' ||
    typeof service.markRead !== 'function' ||
    typeof sessionPort?.authenticate !== 'function'
  )
    throw new TypeError('Notification router dependencies are required');
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  router.use(requireSession(sessionPort, { clock }));
  const csrf = requireCsrf(sessionPort, { allowedOrigins });
  router.get('/', createNotificationController({ service }).getRoot);
  router.post(
    '/:notificationId/read-receipts',
    csrf,
    createNotificationController({ service }).createByNotificationIdReadReceipts
  );
  if (typeof service.updatePreferences === 'function') {
    router.patch(
      '/preferences',
      csrf,
      createNotificationController({ service }).updatePreferences
    );
  }
  if (typeof service.registerPushSubscription === 'function') {
    router.post(
      '/subscriptions',
      csrf,
      createNotificationController({ service }).createSubscriptions
    );
  }
  return router;
}

export function notificationModule(options = {}) {
  return {
    name: 'notifications',
    mount: '/api/v1/notifications',
    router: createNotificationRouter(options)
  };
}
