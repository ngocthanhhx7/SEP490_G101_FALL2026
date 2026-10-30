import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createMapsController } from '../controllers/maps.controller.js';
import { createLocationSearchService } from '../services/maps/location-search.service.js';
import { createMapRenderService } from '../services/maps/map-render.service.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';

export function mapsRuntimeModule({ config, connection, env = {}, clock = Date.now, sessionService, service, renderService }) {
  if (env.MAPS_ENABLED !== undefined && !['true', 'false'].includes(env.MAPS_ENABLED)) throw new TypeError('Invalid MAPS_ENABLED');
  if (env.MAPS_ENABLED !== 'true' || !config.auth?.enabled) return null;
  const session = sessionService ?? createSessionService({ connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const c = createMapsController({ service: service ?? createLocationSearchService({ env }), renderService: renderService ?? createMapRenderService({ env }) }), router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); next(); },
    requireSession(session, { clock }), requireRoles('CUSTOMER', 'STAFF', 'ADMIN', 'PET_SITTER'));
  router.get('/render/*resource', rateLimit({ windowMs: 60000, limit: 600, keyGenerator: req => String(req.auth.userId),
    standardHeaders: 'draft-8', legacyHeaders: false }), c.render);
  router.use(requireCsrf(session));
  router.use(rateLimit({ windowMs: 60000, limit: 10, keyGenerator: req => String(req.auth.userId),
    standardHeaders: 'draft-8', legacyHeaders: false }));
  router.post('/search', c.search);
  router.post('/places/resolve', c.resolve);
  return { name: 'maps', mount: '/api/v1/maps', router };
}
