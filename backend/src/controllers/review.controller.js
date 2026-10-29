import { body } from '../validators/review.validator.js';

import { AppError, metadata } from '../utils/app-error.js';
function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function createReviewController({ service } = {}) {
  return {
    createVisitsByVisitId: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'rating',
        'comment',
        'feedback',
        'tags'
      ]);
      const result = await service.rateVisit({
        ...input,
        actor: req.auth,
        visitId: req.params.visitId,
        idempotencyKey: req.get('Idempotency-Key')
      });
      return send(res, req, result, result?.pending ? 202 : 201);
    },
    createVisitsByVisitIdRating: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'rating',
        'comment',
        'feedback',
        'tags'
      ]);
      const result = await service.rateVisit({
        ...input,
        actor: req.auth,
        visitId: req.params.visitId,
        idempotencyKey: req.get('Idempotency-Key')
      });
      return send(res, req, result, result?.pending ? 202 : 201);
    },
    createVisitsByVisitIdRatings: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'rating',
        'comment',
        'feedback',
        'tags'
      ]);
      const result = await service.rateVisit({
        ...input,
        actor: req.auth,
        visitId: req.params.visitId,
        idempotencyKey: req.get('Idempotency-Key')
      });
      return send(res, req, result, result?.pending ? 202 : 201);
    },
    createRoot: async (req, res) => {
      const input = body(req, [
        'visitId',
        'expectedVersion',
        'rating',
        'comment',
        'feedback',
        'tags'
      ]);
      const { visitId, ...fields } = input;
      if (!visitId)
        throw new AppError(422, 'VALIDATION_FAILED', 'visitId is required');
      const result = await service.rateVisit({
        ...fields,
        actor: req.auth,
        visitId,
        idempotencyKey: req.get('Idempotency-Key')
      });
      return send(res, req, result, result?.pending ? 202 : 201);
    },
    createSitterVisitsByVisitId: async (req, res) => {
      if (
        typeof service.rateCustomer !== 'function' &&
        typeof service.rateSitter !== 'function'
      ) {
        throw new AppError(
          503,
          'REVIEW_UNAVAILABLE',
          'Sitter rating is unavailable'
        );
      }
      const input = body(req, [
        'expectedVersion',
        'rating',
        'comment',
        'feedback',
        'tags'
      ]);
      const rate = service.rateCustomer ?? service.rateSitter;
      const result = await rate({
        ...input,
        actor: req.auth,
        visitId: req.params.visitId,
        idempotencyKey: req.get('Idempotency-Key')
      });
      return send(res, req, result, result?.pending ? 202 : 201);
    },
    getByReviewId: async (req, res) => {
      if (typeof service.get !== 'function')
        throw new AppError(
          503,
          'REVIEW_UNAVAILABLE',
          'Review read is unavailable'
        );
      return send(
        res,
        req,
        await service.get({ actor: req.auth, reviewId: req.params.reviewId })
      );
    }
  };
}
