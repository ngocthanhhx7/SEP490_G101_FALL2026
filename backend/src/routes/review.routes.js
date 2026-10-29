import { ID } from '../constants/review-fields.js';
import { createReviewController } from '../controllers/review.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';
import { AppError } from '../utils/app-error.js';

function ensure(service) {
  if (!service || typeof service.rateVisit !== 'function')
    throw new TypeError('Review service is required');
}

export function createReviewRouter({
  service,
  sessionPort,
  sessionService,
  allowedOrigins
} = {}) {
  ensure(service);
  const session = sessionPort ?? sessionService;
  const router = Router();
  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer'
    });
    res.vary('Cookie');
    next();
  });
  router.use(requireSession(session));
  router.param('visitId', (req, _res, next, value) =>
    ID.test(value)
      ? next()
      : next(new AppError(422, 'VALIDATION_FAILED', 'Visit ID is invalid'))
  );
  router.param('reviewId', (req, _res, next, value) =>
    ID.test(value)
      ? next()
      : next(new AppError(422, 'VALIDATION_FAILED', 'Review ID is invalid'))
  );
  const csrf = requireCsrf(session, { allowedOrigins });

  router.post(
    '/visits/:visitId',
    requireRoles('CUSTOMER'),
    csrf,
    createReviewController({ service }).createVisitsByVisitId
  );
  router.post(
    '/visits/:visitId/rating',
    requireRoles('CUSTOMER'),
    csrf,
    createReviewController({ service }).createVisitsByVisitIdRating
  );
  router.post(
    '/visits/:visitId/ratings',
    requireRoles('CUSTOMER'),
    csrf,
    createReviewController({ service }).createVisitsByVisitIdRatings
  );

  // The collection endpoint is useful to clients that keep visit IDs in the body;
  // P34 may mount either this route or the explicit visit route above.
  router.post(
    '/',
    requireRoles('CUSTOMER'),
    csrf,
    createReviewController({ service }).createRoot
  );

  router.post(
    '/sitter/visits/:visitId',
    requireRoles('PET_SITTER'),
    csrf,
    createReviewController({ service }).createSitterVisitsByVisitId
  );

  router.get(
    '/:reviewId',
    requireRoles('CUSTOMER', 'STAFF'),
    createReviewController({ service }).getByReviewId
  );
  return router;
}

export function reviewModule(options = {}) {
  return {
    name: 'reviews',
    mount: '/api/v1/reviews',
    router: createReviewRouter(options)
  };
}

export const createReviewsRouter = createReviewRouter;
