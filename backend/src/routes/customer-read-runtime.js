import { Router } from 'express';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { createCustomerBookingsController } from '../controllers/customer-bookings.controller.js';
import { createCustomerBookingsService } from '../services/customer-bookings.service.js';
import { createWebPushService } from '../services/notifications/web-push.service.js';
import { createNotificationService } from '../services/notifications/notification.service.js';
import { createMongoNotificationRepository } from '../services/notifications/mongo-notification.repository.js';
import { createNotificationRouter } from './notification.routes.js';
import { createMongoCustomerReviewRepository } from '../services/reviews/mongo-customer-review.repository.js';
import { createReviewService } from '../services/reviews/review.service.js';
import { createReviewRouter } from './review.routes.js';
import { createBookingDetailsController } from '../controllers/booking-details.controller.js';
import { createBookingDetailsService } from '../services/booking-proposals/booking-details.service.js';
import { createVisitTrackerRouter } from './visit-tracker.routes.js';
import { createVisitPickupService } from '../services/pickup/visit-pickup.service.js';

export function customerReadRuntime({ config, connection, sessionService, env, clock }) {
  const router = Router();
  const bookings = createCustomerBookingsService({ connection, clock, cursorSecret: config.auth.tokenSecret,
    enabled: env.BOOKING_CHECKOUT_ENABLED === 'true' || env.FINANCE_SOURCES_ENABLED === 'true' });
  router.get('/bookings', requireSession(sessionService, { clock }), requireRoles('CUSTOMER'),
    (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, createCustomerBookingsController(bookings).list);
  if (config.auth.enabled && env.BOOKING_CHECKOUT_ENABLED === 'true' && connection?.db) {
    const details = createBookingDetailsController(createBookingDetailsService({ connection, clock }), createVisitPickupService({ connection, clock }));
    router.get('/staff/bookings/:id',
      (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); },
      requireSession(sessionService, { clock }), requireRoles('STAFF', 'ADMIN'), details.readStaff);
    router.post('/staff/bookings/:id/visits/:visitId/pickup/:action',
      (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); },
      requireSession(sessionService, { clock }), requireRoles('STAFF', 'ADMIN'), requireCsrf(sessionService), details.recordPickup);
    router.use(createVisitTrackerRouter({ connection, sessionService, clock,
      travelEnabled: env.EMPLOYEE_SCHEDULING_ENABLED === 'true' && env.VISIT_TRAVEL_ENABLED === 'true',
      incidentEnabled: env.FINANCE_SOURCES_ENABLED === 'true' }));
  }
  const notifications = createNotificationService({ repository: createMongoNotificationRepository({ connection,
    cursorSecret: config.auth.tokenSecret, clock }), clock });
  const webPush = createWebPushService({ connection, config: config.webPush, sessionPort: sessionService, clock });
  router.use('/notifications', createNotificationRouter({ service: notifications, sessionPort: sessionService, webPush, clock }));
  if (env.FINANCE_SOURCES_ENABLED === 'true' && env.EMPLOYEE_SCHEDULING_ENABLED === 'true') {
    const reviews = createReviewService({ repository: createMongoCustomerReviewRepository({ connection }), clock });
    router.use('/reviews', createReviewRouter({ service: reviews, sessionService, clock }));
  }
  return { router, webPush: config.webPush ? webPush : null };
}
