import { Router } from 'express';
import { requireCsrf, requireSession } from '../middlewares/session.js';
import { AppError, metadata } from '../utils/app-error.js';

function response(res, req, status, data) {
  return res.status(status).json({ data, meta: metadata(req) });
}

function body(req, fields) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => !fields.includes(key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Notification request is invalid');
  }
  return req.body;
}

export function createNotificationRouter({ service, sessionPort, allowedOrigins, clock } = {}) {
  if (!service || typeof service.list !== 'function' || typeof service.markRead !== 'function'
    || typeof sessionPort?.authenticate !== 'function') throw new TypeError('Notification router dependencies are required');
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  router.use(requireSession(sessionPort, { clock }));
  const csrf = requireCsrf(sessionPort, { allowedOrigins });
  router.get('/', async (req, res) => response(res, req, 200, await service.list({
    actor: req.auth, cursor: req.query.cursor, unreadOnly: req.query.unreadOnly === 'true', limit: req.query.limit
  })));
  router.post('/:notificationId/read-receipts', csrf, async (req, res) => response(res, req, 200, await service.markRead({
    actor: req.auth, notificationId: req.params.notificationId, idempotencyKey: req.get('idempotency-key')
  })));
  if (typeof service.updatePreferences === 'function') {
    router.patch('/preferences', csrf, async (req, res) => response(res, req, 200, await service.updatePreferences({
      actor: req.auth, preferences: body(req, ['preferences']).preferences, idempotencyKey: req.get('idempotency-key')
    })));
  }
  if (typeof service.registerPushSubscription === 'function') {
    router.post('/subscriptions', csrf, async (req, res) => response(res, req, 201, await service.registerPushSubscription({
      actor: req.auth, subscription: body(req, ['subscription']).subscription, idempotencyKey: req.get('idempotency-key')
    })));
  }
  return router;
}

export function notificationModule(options = {}) {
  return { name: 'notifications', mount: '/api/v1/notifications', router: createNotificationRouter(options) };
}
