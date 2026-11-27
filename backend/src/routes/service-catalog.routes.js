import { privateResponse } from '../middlewares/private-response.js';
import { createServiceCatalogController } from '../controllers/service-catalog.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';
import { serviceModel } from '../models/service.model.js';
import { serviceVersionModel } from '../models/service-version.model.js';
import { servicePolicyVersionModel } from '../models/service-policy-version.model.js';
import { createSessionService } from '../services/session.service.js';
import { createServiceCatalogService } from '../services/service-catalog.service.js';
import { createServiceLocationManagement } from '../services/counter-booking/service-location-management.service.js';
import { controllerAction } from '../controllers/controller-action.js';

export function serviceCatalogModule({
  config,
  connection,
  priceProvider,
  catalogSettings,
  env = {},
  sessionService: suppliedSessionService,
  clock = Date.now
} = {}) {
  if (
    !config ||
    !connection ||
    typeof priceProvider?.getActivePrice !== 'function' ||
    typeof catalogSettings?.isEnabledAt !== 'function'
  ) {
    throw new TypeError('Service catalog integration ports are required');
  }
  const service = createServiceCatalogService({
    connection,
    Service: serviceModel(connection),
    ServiceVersion: serviceVersionModel(connection),
    PolicyVersion: servicePolicyVersionModel(connection),
    priceProvider,
    catalogSettings,
    groomingBookingEnabled: env.GROOMING_BOOKING_ENABLED === 'true' && config.auth?.enabled === true,
    clock
  });
  const router = Router();
  router.get('/', createServiceCatalogController({ service }).getRoot);

  if (config.auth?.enabled) {
    const sessionService =
      suppliedSessionService ??
      createSessionService({
        connection,
        clock,
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
    const serviceLocations = createServiceLocationManagement({ connection, clock });
    router.put('/admin/:id/locations', ...admin, csrf,
      controllerAction(200, req => serviceLocations.update(req.auth, req.params.id, req.body)));

    router.get(
      '/admin',
      ...staff,
      createServiceCatalogController({ service }).getAdmin
    );
    router.post(
      '/admin',
      ...admin,
      csrf,
      createServiceCatalogController({ service }).createAdmin
    );
    router.put(
      '/admin/:id',
      ...admin,
      csrf,
      createServiceCatalogController({ service }).replaceAdminById
    );
    router.post(
      '/admin/:id/policies',
      ...admin,
      csrf,
      createServiceCatalogController({ service }).createAdminByIdPolicies
    );
  }

  return {
    name: 'service-catalog',
    mount: '/api/v1/services',
    router,
    catalog: service
  };
}
