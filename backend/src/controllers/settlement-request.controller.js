import { metadata, AppError } from '../utils/app-error.js';

export function createSettlementRequestController(service) {
  return {
    withdraw: async (req, res) => {
      if (!req.body || Array.isArray(req.body)
        || Object.keys(req.body).some(key => key !== 'expectedVersion')) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Only expectedVersion is accepted');
      }
      const data = await service.withdraw({ actor: req.auth, requestId: req.params.id,
        expectedVersion: req.body.expectedVersion, idempotencyKey: req.get('Idempotency-Key') });
      res.set('Cache-Control', 'no-store').json({ data, meta: metadata(req) });
    },
    read: async (req, res) => {
      res.set('Cache-Control', 'no-store').json({
        data: await service.readOwn({ actor: req.auth }), meta: metadata(req)
      });
    },
    submit: async (req, res) => {
      if (!req.body || Array.isArray(req.body)
        || Object.keys(req.body).some(key => key !== 'earningIds')) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Only earningIds are accepted');
      }
      const data = await service.submit({ actor: req.auth, earningIds: req.body.earningIds,
        idempotencyKey: req.get('Idempotency-Key') });
      res.set('Cache-Control', 'no-store').status(201).json({ data, meta: metadata(req) });
    }
  };
}
