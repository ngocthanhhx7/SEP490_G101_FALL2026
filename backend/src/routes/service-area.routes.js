import { Router } from 'express';
import { createServiceAreaController } from '../controllers/service-area.controller.js';
import { createServiceAreaManagement } from '../services/service-area-management.service.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
export function serviceAreaRuntimeModule({ config, connection, clock = Date.now, env = {}, sessionService }) {
  if (!config.auth?.enabled || !connection?.db || env.EMPLOYEE_SCHEDULING_ENABLED !== 'true') return null;
  const session = sessionService ?? createSessionService({ connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const router = Router(), c = createServiceAreaController(createServiceAreaManagement({ connection, clock }));
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); next(); }, requireSession(session, { clock }), requireRoles('ADMIN'));
  router.get('/', c.list);
  router.put('/', requireCsrf(session), c.change);
  return { name: 'service-area-management', mount: '/api/v1/admin/service-areas', router };
}
