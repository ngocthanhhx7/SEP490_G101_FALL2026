import { createVisitBoardController } from '../controllers/visit-board.controller.js';
import { Router } from 'express';
import {
  requireSession,
  requireRoles,
  requireCsrf
} from '../middlewares/session.js';
import { AppError } from '../utils/app-error.js';

// Export only. P34 owns registration; P01 must approve the new read/remedy route mapping.
export function createVisitBoardRouter({
  service,
  sessionPort,
  allowedOrigins
} = {}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  router.use(requireSession(sessionPort));
  router.param('visitId', (_req, _res, next, value) =>
    /^[a-f0-9]{24}$/.test(value)
      ? next()
      : next(new AppError(422, 'VALIDATION_FAILED', 'Visit ID is invalid'))
  );
  const staff = requireRoles('STAFF');
  const customer = requireRoles('CUSTOMER');
  const csrf = requireCsrf(sessionPort, { allowedOrigins });
  router.get(
    '/staff/visit-board',
    staff,
    createVisitBoardController({ service }).getStaffVisitBoard
  );
  router.get(
    '/visits/:visitId/dispatch',
    staff,
    createVisitBoardController({ service }).getVisitsByVisitIdDispatch
  );
  router.post(
    '/visits/:visitId/remedies',
    staff,
    csrf,
    createVisitBoardController({ service }).createVisitsByVisitIdRemedies
  );
  router.post(
    '/visits/:visitId/remedies/:remedyId/responses',
    customer,
    csrf,
    createVisitBoardController({ service })
      .createVisitsByVisitIdRemediesByRemedyIdResponses
  );
  router.post(
    '/visits/:visitId/assignments',
    staff,
    csrf,
    createVisitBoardController({ service }).createVisitsByVisitIdAssignments
  );
  return router;
}
