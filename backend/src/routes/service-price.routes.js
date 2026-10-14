import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { servicePriceVersionModel } from '../models/service-price-version.model.js';
import { servicePriceAuditModel } from '../models/service-price-audit.model.js';
import { createSessionService } from '../services/session.service.js';
import { createServicePriceService } from '../services/service-price.service.js';
import { metadata } from '../utils/app-error.js';

function respond(res, req, status, data) {
  return res.status(status).json({ data, meta: metadata(req) });
}

export function servicePriceModule({ config, connection, serviceExists, sessionService: suppliedSessionService,
  clock = Date.now } = {}) {
  if (!config || !connection || typeof serviceExists !== 'function') {
    throw new TypeError('Service price integration ports are required');
  }
  const service = createServicePriceService({
    connection, PriceVersion: servicePriceVersionModel(connection),
    Audit: servicePriceAuditModel(connection), serviceExists, clock
  });
  const router = Router();
  router.get('/:serviceId/active', async (req, res) =>
    respond(res, req, 200, await service.getActivePrice(req.params.serviceId)));

  if (config.auth?.enabled) {
    const sessionService = suppliedSessionService ?? createSessionService({
      connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret
    });
    const staff = [requireSession(sessionService, { clock }), requireRoles('STAFF')];
    const admin = [requireSession(sessionService, { clock }), requireRoles('ADMIN')];
    const csrf = requireCsrf(sessionService);
    router.get('/admin/:serviceId', ...staff, async (req, res) =>
      respond(res, req, 200, { prices: await service.list(req.params.serviceId),
        latestVersion: await service.latestVersion(req.params.serviceId) }));
    router.post('/admin/:serviceId', ...admin, csrf, async (req, res) =>
      respond(res, req, 201, await service.createVersion({
        serviceId: req.params.serviceId, body: req.body, actor: req.auth
      })));
  }

  return { name: 'service-prices', mount: '/api/v1/service-prices', router, prices: service };
}
