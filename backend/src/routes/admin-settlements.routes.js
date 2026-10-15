import { Router } from 'express';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { AppError, metadata } from '../utils/app-error.js';

export function adminSettlementModule({ service, sessionService }) {
  const router = Router();
  router.use(requireSession(sessionService), requireRoles('ADMIN'));
  router.get('/', async (req, res) => {
    if (Object.keys(req.query).some(key => key !== 'cursor')) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid query');
    res.set('Cache-Control', 'no-store').json({ data: await service.list({ actor: req.auth, cursor: req.query.cursor }), meta: metadata(req) });
  });
  for (const [path, method, fields] of [
    ['decisions', 'decide', ['decision', 'reason', 'expectedVersion']],
    ['transfer-records', 'recordTransfer', ['outcome', 'reference', 'evidenceReference', 'amountVnd', 'paidAt', 'expectedVersion']]
  ]) {
    router.post(`/:id/${path}`, requireCsrf(sessionService), async (req, res) => {
      if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => !fields.includes(key))) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Invalid command');
      }
      const data = await service[method]({ actor: req.auth, requestId: req.params.id, ...req.body,
        idempotencyKey: req.get('Idempotency-Key') });
      res.set('Cache-Control', 'no-store').status(data.status === 'TRANSFER_PENDING' ? 202 : 200).json({ data, meta: metadata(req) });
    });
  }
  return { name: 'admin-settlements', mount: '/api/v1/admin/settlements', router };
}
