import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createGroomingBookingController } from '../controllers/grooming-booking.controller.js';
import { createGroomingService } from '../services/grooming/grooming.service.js';
import { createGroomingShopServices } from '../services/grooming/grooming-shop-services.service.js';
import { createShopShiftSource } from '../services/grooming/shop-shift-source.service.js';
import { createGroomingSlots } from '../services/grooming/grooming-slots.service.js';
import { createGroomingPricing } from '../services/grooming/grooming-pricing.service.js';
import { createGroomingBooking } from '../services/grooming/grooming-booking.service.js';
import { createGroomingAppointmentCode } from '../services/grooming/grooming-appointment-code.service.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { createPickupFeeSettings } from '../services/pickup/pickup-fee-settings.service.js';
import { createCounterPickupService, createPickupDrivingRoute } from '../services/counter-booking/counter-pickup.service.js';

// Disabled unless GROOMING_BOOKING_ENABLED=true; needs authentication and provisioned grooming storage.
export function groomingRuntimeModule({ config, connection, env = {}, clock = Date.now, sessionService }) {
  if (env.GROOMING_BOOKING_ENABLED !== undefined && !['true', 'false'].includes(env.GROOMING_BOOKING_ENABLED)) throw new TypeError('Invalid GROOMING_BOOKING_ENABLED');
  if (env.GROOMING_BOOKING_ENABLED !== 'true' || !config.auth?.enabled || !connection?.db) return null;
  const shopServices = createGroomingShopServices({ connection, clock });
  const shiftSource = createShopShiftSource({ connection, clock });
  const pickup = createCounterPickupService({ connection, settings: createPickupFeeSettings({ connection, clock }),
    facilityCoordinates: env.BOOKING_FACILITY_COORDINATES ? JSON.parse(env.BOOKING_FACILITY_COORDINATES) : null,
    routeDistance: createPickupDrivingRoute({ baseUrl: config.ai?.routingUrl }) });
  const pricing = createGroomingPricing({ connection, clock, shopServices, hotline: env.GROOMING_SHOP_HOTLINE?.trim() || null,
    refusalLimit: env.PRODUCT_REFUSAL_LIMIT });
  const slots = createGroomingSlots({ connection, clock, shopServices, shiftSource });
  const booking = createGroomingBooking({ connection, clock, pricing, shiftSource, codes: createGroomingAppointmentCode({ connection }),
    facilityAddress: env.BOOKING_FACILITY_ADDRESS, hotline: env.GROOMING_SHOP_HOTLINE, pickup });
  const service = createGroomingService({
    shopServices, connection, clock, facilityAddress: env.BOOKING_FACILITY_ADDRESS, hotline: env.GROOMING_SHOP_HOTLINE, pricing, pickup,
    slots, booking
  });
  const session = sessionService ?? createSessionService({ connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const csrf = requireCsrf(session), controller = createGroomingBookingController(service), router = Router();
  const limiter = () => rateLimit({ windowMs: 300000, limit: 60, keyGenerator: req => String(req.auth.userId), standardHeaders: 'draft-8', legacyHeaders: false });
  const limit = limiter(), bookLimit = limiter();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, requireSession(session, { clock }), requireRoles('CUSTOMER'));
  router.get('/options', controller.options);
  router.post('/slots', csrf, limit, controller.slots);
  router.post('/quotes', csrf, limit, controller.quote);
  router.post('/pickup-quotes', csrf, limit, controller.pickupQuote);
  router.post('/appointments', csrf, bookLimit, controller.book);
  router.post('/appointments/:id/cancel', csrf, bookLimit, controller.cancelAppointment);
  router.get('/appointments', controller.listAppointments);
  router.get('/appointments/:id', controller.readAppointment);
  return { name: 'grooming', mount: '/api/v1/grooming', router, service, pricing, slots, booking };
}
