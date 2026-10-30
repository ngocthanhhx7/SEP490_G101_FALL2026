import { Router } from 'express';
import { requireSession, requireRoles } from '../middlewares/session.js';
import { createCustomerBookingsController } from '../controllers/customer-bookings.controller.js';
import { createCustomerBookingsService } from '../services/customer-bookings.service.js';
import { createNotificationService } from '../services/notifications/notification.service.js';
import { createMongoNotificationRepository } from '../services/notifications/mongo-notification.repository.js';
import { createNotificationRouter } from './notification.routes.js';
import { createMongoCustomerReviewRepository } from '../services/reviews/mongo-customer-review.repository.js';
import { createReviewService } from '../services/reviews/review.service.js';
import { createReviewRouter } from './review.routes.js';

export function customerReadRuntime({ config, connection, sessionService, env, clock }) {
  const router = Router();
  const bookings = createCustomerBookingsService({ connection, clock, cursorSecret: config.auth.tokenSecret,
    enabled: env.BOOKING_CHECKOUT_ENABLED === 'true' || env.FINANCE_SOURCES_ENABLED === 'true' });
  router.get('/bookings', requireSession(sessionService, { clock }), requireRoles('CUSTOMER'),
    (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, createCustomerBookingsController(bookings).list);
  const notifications = createNotificationService({ repository: createMongoNotificationRepository({ connection,
    cursorSecret: config.auth.tokenSecret, clock }), clock });
  router.use('/notifications', createNotificationRouter({ service: notifications, sessionPort: sessionService, clock }));
  if (env.FINANCE_SOURCES_ENABLED === 'true' && env.EMPLOYEE_SCHEDULING_ENABLED === 'true') {
    const reviews = createReviewService({ repository: createMongoCustomerReviewRepository({ connection }), clock });
    router.use('/reviews', createReviewRouter({ service: reviews, sessionService, clock }));
  }
  return { router };
}
