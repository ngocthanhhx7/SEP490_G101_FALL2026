import { Router } from 'express';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { createSettlementRequestController } from '../controllers/settlement-request.controller.js';

export function settlementRequestModule({ service, sessionService }) {
  const router = Router();
  const controller = createSettlementRequestController(service);
  router.use(requireSession(sessionService), requireRoles('PET_SITTER'));
  router.get('/', controller.read);
  router.post('/', requireCsrf(sessionService), controller.submit);
  router.post('/:id/withdrawals', requireCsrf(sessionService), controller.withdraw);
  return { name: 'settlement-requests', mount: '/api/v1/settlement-requests', router };
}
