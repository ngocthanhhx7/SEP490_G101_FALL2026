import { Router } from 'express';
import { requireSession, requireRoles } from '../middlewares/session.js';
import { createSitterManagementService } from '../services/sitter-management.service.js';
import { createSitterManagementController } from '../controllers/sitter-management.controller.js';

export function sitterManagementModule({ connection, sessionService, config, clock }) {
  const router = Router();
  const controller = createSitterManagementController(createSitterManagementService({ connection, clock, cursorSecret: config.auth.tokenSecret }));
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); next(); });
  router.use(requireSession(sessionService), requireRoles('STAFF'));
  router.get('/', controller.list);
  router.get('/reports', controller.reports);
  router.get('/:userId', controller.get);
  router.get('/:userId/activity', controller.activity);
  return { name: 'sitter-management', mount: '/api/v1/sitter-management', router };
}
