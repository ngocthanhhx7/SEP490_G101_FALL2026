import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { serviceModel } from '../models/service.model.js';
import { serviceVersionModel } from '../models/service-version.model.js';
import { servicePolicyVersionModel } from '../models/service-policy-version.model.js';
import { serviceAuditModel } from '../models/service-audit.model.js';
import { createSessionService } from '../services/session.service.js';
import { createServiceCatalogService } from '../services/service-catalog.service.js';
import { metadata } from '../utils/app-error.js';

function respond(res, req, status, data) {
  return res.status(status).json({ data, meta: metadata(req) });
}

export function serviceCatalogModule({ config, connection, priceProvider, catalogSettings, sessionService: suppliedSessionService,
  clock = Date.now } = {}) {
  if (!config || !connection || typeof priceProvider?.getActivePrice !== 'function'
    || typeof catalogSettings?.isEnabledAt !== 'function') {
    throw new TypeError('Service catalog integration ports are required');
  }
  const service = createServiceCatalogService({
    connection, Service: serviceModel(connection), ServiceVersion: serviceVersionModel(connection),
    PolicyVersion: servicePolicyVersionModel(connection), Audit: serviceAuditModel(connection),
    priceProvider, catalogSettings, clock
  });
  const router = Router();
  router.get('/', async (req, res) => respond(res, req, 200, await service.publicList()));

  if (config.auth?.enabled) {
    const sessionService = suppliedSessionService ?? createSessionService({
      connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret
    });
    const staff = [requireSession(sessionService, { clock }), requireRoles('STAFF')];
    const admin = [requireSession(sessionService, { clock }), requireRoles('ADMIN')];
    const csrf = requireCsrf(sessionService);

    router.get('/admin', ...staff, async (req, res) =>
      respond(res, req, 200, await service.listAdmin({ includePolicyText: true })));
    router.post('/admin', ...admin, csrf, async (req, res) =>
      respond(res, req, 201, await service.create({ body: req.body, actor: req.auth })));
    router.put('/admin/:id', ...admin, csrf, async (req, res) =>
      respond(res, req, 200, await service.update({ serviceId: req.params.id, body: req.body, actor: req.auth })));
    router.post('/admin/:id/policies', ...admin, csrf, async (req, res) =>
      respond(res, req, 201, await service.setPolicy({ serviceId: req.params.id, body: req.body, actor: req.auth })));
  }

  return { name: 'service-catalog', mount: '/api/v1/services', router, catalog: service };
}
