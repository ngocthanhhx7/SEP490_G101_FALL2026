import { Router } from 'express';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { createSessionService } from '../services/session.service.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createCustomerPhoneDirectory } from '../services/product-sales/customer-phone-directory.service.js';
import { petCareModels } from '../models/pet-care.model.js';
import { createPetCareManagement } from '../services/pet-care-management.service.js';
import { createServiceAreaCatalog } from '../services/service-area-catalog.service.js';
import { createCounterCustomerService } from '../services/counter-booking/counter-customer.service.js';
import { createCounterDirectoryService } from '../services/counter-booking/counter-directory.service.js';
import { createCounterBookingController } from '../controllers/counter-booking.controller.js';
import { createPickupFeeSettings } from '../services/pickup/pickup-fee-settings.service.js';
import { createCounterPickupService, createPickupDrivingRoute } from '../services/counter-booking/counter-pickup.service.js';
import { createCounterCheckout } from '../services/counter-booking/counter-checkout.service.js';
import { createPricingService } from '../services/pricing/pricing.service.js';
import { createPricingRepository } from '../services/pricing/pricing.repository.js';
import { createPayosProvider, loadPayosConfig } from '../services/providers/payos/payos.provider.js';

// PR-2 is deliberately opt-in while the PR-1 pickup and atomic payment
// components are under construction. Customer/pet operations are real; checkout
// fails closed rather than writing a partially paid grooming or visit order.
export function counterBookingRuntimeModule({
  config, connection, env = {}, clock = Date.now, sessionService, catalog,
  services, bookingCheckout, grooming
}) {
  if (env.COUNTER_BOOKING_ENABLED !== undefined && !['true', 'false'].includes(env.COUNTER_BOOKING_ENABLED))
    throw new TypeError('Invalid COUNTER_BOOKING_ENABLED');
  if (env.COUNTER_BOOKING_ENABLED !== 'true' || !config?.auth?.enabled || !connection?.db) return null;

  const session = sessionService ?? createSessionService({
    connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret
  });
  const directory = services?.directory ?? (() => {
    const contactCrypto = createContactCrypto({
      lookupSecret: config.auth.contactLookupSecret,
      encryptionKey: config.auth.contactEncryptionKey
    });
    const petCare = createPetCareManagement({
      repository: { connection, models: petCareModels(connection) }, clock,
      coverageAreas: () => createServiceAreaCatalog(connection).list()
    });
    const customers = createCounterCustomerService({
      connection, contactCrypto, petCare, contacts: createCustomerPhoneDirectory({ connection, contactCrypto })
    });
    if (typeof catalog?.publicList !== 'function') throw new TypeError('Counter booking requires the shared service catalog');
    return createCounterDirectoryService({ connection, customers, petCare, catalog });
  })();
  const pickup = services?.pickup ?? createCounterPickupService({
      connection,
      settings: createPickupFeeSettings({ connection, clock }),
      facilityCoordinates: env.BOOKING_FACILITY_COORDINATES
        ? JSON.parse(env.BOOKING_FACILITY_COORDINATES) : null,
      routeDistance: createPickupDrivingRoute({ baseUrl: config.ai?.routingUrl })
    });
  const checkout = services?.checkout ?? (bookingCheckout && grooming && env.FINANCE_SOURCES_ENABLED === 'true'
    ? createCounterCheckout({ connection, clock, pickup, checkout: bookingCheckout, grooming,
      pricing: createPricingService({ repository: createPricingRepository(connection, clock), clock }),
      provider: loadPayosConfig(env) ? createPayosProvider(loadPayosConfig(env)) : null,
      webOrigin: env.BOOKING_WEB_ORIGIN })
    : null);
  const controller = createCounterBookingController({
    directory, pickup, checkout
  });
  const router = Router(), csrf = requireCsrf(session);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); },
    requireSession(session, { clock }), requireRoles('SALE_STAFF', 'ADMIN'));
  router.get('/services', controller.catalog);
  router.get('/pet-catalog', controller.petCatalog);
  router.post('/customer-lookups', csrf, controller.lookup);
  router.post('/customers', csrf, controller.createCustomer);
  router.post('/customers/:customerId/pets', csrf, controller.createPet);
  router.post('/customers/:customerId/addresses', csrf, controller.createAddress);
  router.post('/pickup-quotes', csrf, controller.pickupQuote);
  router.get('/slots', controller.slots);
  router.post('/slots', csrf, controller.slots);
  router.post('/previews', csrf, controller.preview);
  router.post('/receipts/:receiptId/status', csrf, controller.status);
  router.post('/receipts/:receiptId/cancel', csrf, controller.cancel);
  router.post('/', csrf, controller.checkout);
  return { name: 'counter-bookings', mount: '/api/v1/counter-bookings', router, directory, checkout };
}
