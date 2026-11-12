import { Router } from 'express';
import { createBookingChangeController } from '../controllers/booking-change.controller.js';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { createBookingChangeService } from '../services/booking-change/booking-change.service.js';
import { createNotificationService } from '../services/notifications/notification.service.js';
import { createMongoNotificationRepository } from '../services/notifications/mongo-notification.repository.js';

function privateResponse(_req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Cookie');
  next();
}

export function bookingChangeRuntimeModule({ config, connection, sessionService, repository, requeue, clock }) {
  const cursorSecret = config.auth.tokenSecret;
  const notifications = createNotificationService({
    repository: createMongoNotificationRepository({ connection, cursorSecret, clock }), clock
  });
  const service = createBookingChangeService({ connection, repository, notifications, cursorSecret, requeue, clock });
  const router = Router();
  const controller = createBookingChangeController(service);
  const authenticated = requireSession(sessionService, { clock });
  const customer = [privateResponse, authenticated, requireRoles('CUSTOMER')];
  const staff = [privateResponse, authenticated, requireRoles('STAFF', 'ADMIN')];
  const csrf = requireCsrf(sessionService);
  router.get('/bookings/:bookingId/change-options', ...customer, controller.options);
  router.post('/bookings/:bookingId/change-requests', ...customer, csrf, controller.submit);
  router.get('/staff/booking-change-requests', ...staff, controller.list);
  router.get('/staff/booking-change-requests/:id', ...staff, controller.detail);
  router.post('/staff/booking-change-requests/:id/decision', ...staff, csrf, controller.decide);
  return { router, service };
}
