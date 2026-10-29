import { privateResponse } from '../middlewares/private-response.js';
import { createServicePriceController } from '../controllers/service-price.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';
import { servicePriceVersionModel } from '../models/service-price-version.model.js';
import { servicePriceAuditModel } from '../models/service-price-audit.model.js';
import { createSessionService } from '../services/session.service.js';
import { createServicePriceService } from '../services/service-price.service.js';

export function servicePriceModule({
  config,
  connection,
  serviceExists,
  sessionService: suppliedSessionService,
  clock = Date.now
} = {}) {
  if (!config || !connection || typeof serviceExists !== 'function') {
    throw new TypeError('Service price integration ports are required');
  }
  const service = createServicePriceService({
    connection,
    PriceVersion: servicePriceVersionModel(connection),
    Audit: servicePriceAuditModel(connection),
    serviceExists,
    clock
  });
  const router = Router();
  router.get(
    '/:serviceId/active',
    createServicePriceController({ service }).getByServiceIdActive
  );

  if (config.auth?.enabled) {
    const sessionService =
      suppliedSessionService ??
      createSessionService({
        connection,
        tokenSecret: config.auth.tokenSecret,
        csrfSecret: config.auth.csrfSecret
      });
    const staff = [
      privateResponse,
      requireSession(sessionService, { clock }),
      requireRoles('STAFF')
    ];
    const admin = [
      privateResponse,
      requireSession(sessionService, { clock }),
      requireRoles('ADMIN')
    ];
    const csrf = requireCsrf(sessionService);
    router.get(
      '/admin/:serviceId',
      ...staff,
      createServicePriceController({ service }).getAdminByServiceId
    );
    router.post(
      '/admin/:serviceId',
      ...admin,
      csrf,
      createServicePriceController({ service }).createAdminByServiceId
    );
  }

  return {
    name: 'service-prices',
    mount: '/api/v1/service-prices',
    router,
    prices: service
  };
}
