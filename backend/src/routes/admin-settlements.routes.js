import { Router } from 'express';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { createAdminSettlementController } from '../controllers/admin-settlement.controller.js';

export function adminSettlementModule({ service, sessionService }) {
  const router = Router();
  const controller = createAdminSettlementController(service);
  router.use(requireSession(sessionService), requireRoles('ADMIN'));
  router.get('/', controller.list);
  router.post('/:id/decisions', requireCsrf(sessionService), controller.decide);
  router.post('/:id/transfer-records', requireCsrf(sessionService), controller.recordTransfer);
  return { name: 'admin-settlements', mount: '/api/v1/admin/settlements', router };
}
