import { Router } from 'express';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { metadata, AppError } from '../utils/app-error.js';

export function settlementRequestModule({ service, sessionService }) {
  const router = Router();
  router.use(requireSession(sessionService), requireRoles('PET_SITTER'));
  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store').json({ data: await service.readOwn({ actor: req.auth }), meta: metadata(req) });
  });
  router.post('/', requireCsrf(sessionService), async (req, res) => {
    if (!req.body || Object.keys(req.body).some(key => key !== 'earningIds')) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Only earningIds are accepted');
    }
    const data = await service.submit({ actor: req.auth, earningIds: req.body.earningIds,
      idempotencyKey: req.get('Idempotency-Key') });
    res.set('Cache-Control', 'no-store').status(201).json({ data, meta: metadata(req) });
  });
  return { name: 'settlement-requests', mount: '/api/v1/settlement-requests', router };
}
