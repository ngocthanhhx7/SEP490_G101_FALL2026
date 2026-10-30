import { Router } from 'express';
import { requireSession, requireRoles } from '../middlewares/session.js';
import { createCustomerBookingsController } from '../controllers/customer-bookings.controller.js';
import { createCustomerBookingsService } from '../services/customer-bookings.service.js';
import { createNotificationService } from '../services/notifications/notification.service.js';
import { createMongoNotificationRepository } from '../services/notifications/mongo-notification.repository.js';
import { createNotificationRouter } from './notification.routes.js';

export function customerReadRuntime({ config, connection, sessionService, env, clock }) {
  const router = Router();
  const bookings = createCustomerBookingsService({ connection, clock, cursorSecret: config.auth.tokenSecret,
    enabled: env.BOOKING_CHECKOUT_ENABLED === 'true' || env.FINANCE_SOURCES_ENABLED === 'true' });
  router.get('/bookings', requireSession(sessionService, { clock }), requireRoles('CUSTOMER'),
    (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, createCustomerBookingsController(bookings).list);
  const notifications = createNotificationService({ repository: createMongoNotificationRepository({ connection,
    cursorSecret: config.auth.tokenSecret, clock }), clock });
  router.use('/notifications', createNotificationRouter({ service: notifications, sessionPort: sessionService, clock }));
  return { router };
}
