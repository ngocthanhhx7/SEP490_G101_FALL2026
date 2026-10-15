import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { AppError, metadata } from '../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function ensure(service) {
  if (!service || typeof service.rateVisit !== 'function') throw new TypeError('Review service is required');
}

function body(req, allowed) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => !allowed.includes(key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Review request is invalid');
  }
  return req.body;
}

function send(res, req, data, status = 200) { res.status(status).json({ data, meta: metadata(req) }); }

export function createReviewRouter({ service, sessionPort, sessionService, allowedOrigins } = {}) {
  ensure(service);
  const session = sessionPort ?? sessionService;
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    res.vary('Cookie'); next();
  });
  router.use(requireSession(session));
  router.param('visitId', (req, _res, next, value) => ID.test(value) ? next() : next(new AppError(422, 'VALIDATION_FAILED', 'Visit ID is invalid')));
  router.param('reviewId', (req, _res, next, value) => ID.test(value) ? next() : next(new AppError(422, 'VALIDATION_FAILED', 'Review ID is invalid')));
  const csrf = requireCsrf(session, { allowedOrigins });

  router.post('/visits/:visitId', requireRoles('CUSTOMER'), csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'rating', 'comment', 'feedback', 'tags']);
    const result = await service.rateVisit({ ...input, actor: req.auth, visitId: req.params.visitId,
      idempotencyKey: req.get('Idempotency-Key') });
    return send(res, req, result, result?.pending ? 202 : 201);
  });
  router.post('/visits/:visitId/rating', requireRoles('CUSTOMER'), csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'rating', 'comment', 'feedback', 'tags']);
    const result = await service.rateVisit({ ...input, actor: req.auth, visitId: req.params.visitId,
      idempotencyKey: req.get('Idempotency-Key') });
    return send(res, req, result, result?.pending ? 202 : 201);
  });
  router.post('/visits/:visitId/ratings', requireRoles('CUSTOMER'), csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'rating', 'comment', 'feedback', 'tags']);
    const result = await service.rateVisit({ ...input, actor: req.auth, visitId: req.params.visitId,
      idempotencyKey: req.get('Idempotency-Key') });
    return send(res, req, result, result?.pending ? 202 : 201);
  });

  // The collection endpoint is useful to clients that keep visit IDs in the body;
  // P34 may mount either this route or the explicit visit route above.
  router.post('/', requireRoles('CUSTOMER'), csrf, async (req, res) => {
    const input = body(req, ['visitId', 'expectedVersion', 'rating', 'comment', 'feedback', 'tags']);
    const { visitId, ...fields } = input;
    if (!visitId) throw new AppError(422, 'VALIDATION_FAILED', 'visitId is required');
    const result = await service.rateVisit({ ...fields, actor: req.auth, visitId,
      idempotencyKey: req.get('Idempotency-Key') });
    return send(res, req, result, result?.pending ? 202 : 201);
  });

  router.get('/:reviewId', requireRoles('CUSTOMER', 'STAFF'), async (req, res) => {
    if (typeof service.get !== 'function') throw new AppError(503, 'REVIEW_UNAVAILABLE', 'Review read is unavailable');
    return send(res, req, await service.get({ actor: req.auth, reviewId: req.params.reviewId }));
  });
  return router;
}

export function reviewModule(options = {}) {
  return { name: 'reviews', mount: '/api/v1/reviews', router: createReviewRouter(options) };
}

export const createReviewsRouter = createReviewRouter;
