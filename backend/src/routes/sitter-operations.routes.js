import { createSitterOperationsController } from '../controllers/sitter-operations.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';

function requireService(service, methods) {
  if (
    !service ||
    methods.some((method) => typeof service[method] !== 'function')
  ) {
    throw new TypeError(
      `Sitter operation service is missing ${methods.join(', ')}`
    );
  }
}

/**
 * P24 route module. P34 owns mounting this module in the runtime registry;
 * exporting it here keeps the route contract reviewable without claiming a
 * Mongo/session integration that is still pending.
 */
export function sitterOperationsModule({
  offerService,
  visitService,
  reassignmentService,
  withdrawalService,
  sessionService,
  allowedOrigins
} = {}) {
  requireService(offerService, [
    'list',
    'detail',
    'assignments',
    'accept',
    'decline'
  ]);
  requireService(visitService, ['detail']);
  requireService(reassignmentService, ['reassign']);
  requireService(withdrawalService, ['withdraw']);
  if (
    typeof sessionService?.authenticate !== 'function' ||
    typeof sessionService?.verifyCsrf !== 'function'
  ) {
    throw new TypeError(
      'Sitter operation routes require an authenticated session service'
    );
  }
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  const authenticated = requireSession(sessionService);
  const csrf = requireCsrf(sessionService, { allowedOrigins });
  const sitter = requireRoles('PET_SITTER');
  const staff = requireRoles('STAFF', 'ADMIN');

  router.get(
    '/offers',
    authenticated,
    sitter,
    createSitterOperationsController({ offerService }).getOffers
  );
  router.get(
    '/offers/:offerId',
    authenticated,
    sitter,
    createSitterOperationsController({ offerService }).getOffersByOfferId
  );
  router.post(
    '/offers/:offerId/acceptances',
    authenticated,
    sitter,
    csrf,
    createSitterOperationsController({ offerService })
      .createOffersByOfferIdAcceptances
  );
  router.post(
    '/offers/:offerId/declines',
    authenticated,
    sitter,
    csrf,
    createSitterOperationsController({ offerService })
      .createOffersByOfferIdDeclines
  );
  router.get(
    '/assignments',
    authenticated,
    sitter,
    createSitterOperationsController({ offerService }).getAssignments
  );
  router.get(
    '/visits/:visitId',
    authenticated,
    sitter,
    createSitterOperationsController({ visitService }).getVisitsByVisitId
  );
  router.post(
    '/visits/:visitId/reassignments',
    authenticated,
    staff,
    csrf,
    createSitterOperationsController({ reassignmentService })
      .createVisitsByVisitIdReassignments
  );
  router.post(
    '/visits/:visitId/withdrawals',
    authenticated,
    sitter,
    csrf,
    createSitterOperationsController({ withdrawalService })
      .createVisitsByVisitIdWithdrawals
  );

  return { name: 'sitter-operations', mount: '/api/v1', router };
}

export const createSitterOperationsRouter = (options) =>
  sitterOperationsModule(options).router;
