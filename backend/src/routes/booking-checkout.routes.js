import { Router } from 'express';
import { createBookingCheckoutController } from '../controllers/booking-checkout.controller.js';
import { createBookingCheckoutService } from '../services/booking-proposals/booking-checkout.service.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { loadPayosConfig, createPayosProvider } from '../services/providers/payos/payos.provider.js';
import { point } from '../validators/pet-care.validator.js';
import { createCheckoutAvailabilityService } from '../services/booking-proposals/checkout-availability.service.js';
import { createEmployeeScheduleRepository } from '../services/employee-scheduling/employee-schedule.repository.js';
import { createConfiguredRoutingProvider } from '../services/sitter-matching/commercial-routing.service.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { rateLimit } from 'express-rate-limit';

export function bookingCheckoutRuntimeModule({ config, connection, env = {}, clock = Date.now, sessionService, provider }) {
  if (env.BOOKING_CHECKOUT_ENABLED !== undefined && !['true', 'false'].includes(env.BOOKING_CHECKOUT_ENABLED)) throw new TypeError('Invalid BOOKING_CHECKOUT_ENABLED');
  if (env.BOOKING_CHECKOUT_ENABLED !== 'true' || !config.auth?.enabled || !connection?.db) return null;
  let webOrigin;
  if (env.BOOKING_WEB_ORIGIN) {
    const url = new URL(env.BOOKING_WEB_ORIGIN);
    if (url.origin !== env.BOOKING_WEB_ORIGIN || url.username || url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new TypeError('Invalid BOOKING_WEB_ORIGIN');
    webOrigin = url.origin;
  }
  const payos = provider ? null : loadPayosConfig(env);
  let facilityCoordinates;
  if (env.BOOKING_FACILITY_COORDINATES) {
    facilityCoordinates = JSON.parse(env.BOOKING_FACILITY_COORDINATES);
    point(facilityCoordinates);
  }
  const availability = createCheckoutAvailabilityService({ connection, clock, facilityAddress: env.BOOKING_FACILITY_ADDRESS, facilityCoordinates,
    repository: env.EMPLOYEE_SCHEDULING_ENABLED === 'true' ? createEmployeeScheduleRepository({ connection, clock, coverageAreas: DEMO_WORK_AREAS,
      routingProvider: createConfiguredRoutingProvider({ env, config, clock }) }) : null });
  const service = createBookingCheckoutService({ connection, clock, selectionGuard: availability.guard, provider: provider ?? (payos ? createPayosProvider(payos) : null),
    webOrigin, facilityAddress: env.BOOKING_FACILITY_ADDRESS, facilityCoordinates });
  const session = sessionService ?? createSessionService({ connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const router = Router(), c = createBookingCheckoutController(service), csrf = requireCsrf(session);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, requireSession(session, { clock }), requireRoles('CUSTOMER'));
  router.post('/bookings', csrf, c.confirm);
  router.post('/availability', csrf, rateLimit({ windowMs: 300000, limit: 60, keyGenerator: req => req.auth.userId,
    standardHeaders: 'draft-8', legacyHeaders: false }), createBookingCheckoutController(availability).availability);
  router.get('/options', c.options);
  router.get('/bookings/:id', c.read);
  router.post('/bookings/:id/payment-link', csrf, c.paymentLink);
  return { name: 'booking-checkout', mount: '/api/v1/checkout', router, service };
}
