import { Router } from 'express';
import { requireSession, requireRoles } from '../middlewares/session.js';
import { createDashboardReadController } from '../controllers/dashboard-read.controller.js';

// Export-only composition helper; P34 owns the application registry.
export function createDashboardReadRouter({ service, sessionPort, path, roles, targetParam }) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  router.get(path, requireSession(sessionPort), requireRoles(...roles),
    createDashboardReadController({ service, targetParam }));
  return router;
}
