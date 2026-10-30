import { Router } from 'express';
import { createSessionService } from '../services/session.service.js';
import {
  requireSession,
  requireRoles,
  requireCsrf
} from '../middlewares/session.js';
import { createPricingController } from '../controllers/pricing.controller.js';
import { createPricingService } from '../services/pricing/pricing.service.js';
import { createPricingManagement } from '../services/pricing/pricing-management.service.js';
import { createPricingRepository } from '../services/pricing/pricing.repository.js';
export function pricingRuntimeModule({ config, connection, clock = Date.now }) {
  if (!config.auth?.enabled) return null;
  const repository = createPricingRepository(connection, clock),
    service = createPricingService({ repository, clock }),
    management = createPricingManagement({ repository, clock });
  const session = createSessionService({
    connection,
    clock,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  const router = Router(),
    c = createPricingController({ service, management }),
    customer = requireRoles('CUSTOMER'),
    csrf = requireCsrf(session);
  router.use(
    (_req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      next();
    },
    requireSession(session, { clock })
  );
  router.post('/quotes', customer, csrf, c.quote);
  router.post('/basket-quotes', customer, csrf, c.basket);
  router.get('/quotes/:quoteId', customer, c.read);
  router.post('/policies', requireRoles('ADMIN'), csrf, c.policy);
  return { name: 'pricing', mount: '/api/v1/pricing', router };
}
