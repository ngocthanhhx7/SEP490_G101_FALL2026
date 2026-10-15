import { Router } from 'express';
import { requireSession, requireRoles } from '../middlewares/session.js';
import { metadata } from '../utils/app-error.js';

// Export-only composition helper; P34 owns the application registry.
export function createDashboardReadRouter({ service, sessionPort, path, roles, targetParam }) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  router.get(path, requireSession(sessionPort), requireRoles(...roles), async (req, res) => {
    const result = await service.read({ actor: req.auth, query: req.query,
      targetId: targetParam ? req.params[targetParam] : undefined });
    res.status(result.pending ? 202 : 200).json({ data: result.pending ? null : result.data,
      meta: { ...metadata(req), ...(result.pending ? { integration: 'INTEGRATION_PENDING' } : {}) } });
  });
  return router;
}
