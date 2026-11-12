import { Router } from 'express';
import { ID } from '../constants/complaint-fields.js';
import { createComplaintController } from '../controllers/complaint.controller.js';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { AppError } from '../utils/app-error.js';
import { createAdmissionMiddleware, createMediaAdmission } from './private-image.routes.js';

export function createComplaintRouter({ service, sessionPort, sessionService, allowedOrigins, clock = Date.now } = {}) {
  const session = sessionPort ?? sessionService;
  const router = Router();
  const controller = createComplaintController({ service });
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    res.vary('Cookie');
    next();
  });
  router.use(requireSession(session, { clock }));
  for (const param of ['visitId', 'bookingId', 'complaintId']) {
    router.param(param, (_req, _res, next, value) =>
      ID.test(value) ? next() : next(new AppError(422, 'VALIDATION_FAILED', 'Resource ID is invalid')));
  }
  const csrf = requireCsrf(session, { allowedOrigins });
  const read = requireRoles('CUSTOMER', 'PET_SITTER', 'STAFF');
  const customer = requireRoles('CUSTOMER');
  const staff = requireRoles('STAFF');
  const admin = requireRoles('ADMIN');
  const readEvidence = createAdmissionMiddleware({ admission: createMediaAdmission(), work: controller.evidence });

  router.get('/eligibility/bookings/:bookingId', customer, controller.eligibility);
  router.post('/visits/:visitId', customer, csrf, controller.submitVisit);
  router.post('/', customer, csrf, controller.submitRoot);
  router.get('/', read, controller.list);
  router.get('/refund-proposals', admin, controller.proposals);
  router.get('/cases/:complaintId', read, controller.get);
  router.get('/:complaintId', read, controller.get);
  router.get('/:complaintId/refund-proposal', admin, controller.proposal);
  router.get('/:complaintId/evidence/:mediaId/content', requireRoles('CUSTOMER', 'STAFF'), readEvidence);
  router.post('/:complaintId/review', staff, csrf, controller.review);
  router.post('/:complaintId/resolution', staff, csrf, controller.resolve);
  router.post('/:complaintId/objections', customer, csrf, controller.object);
  router.post('/cases/:complaintId/objections', customer, csrf, controller.object);
  router.post('/:complaintId/refund-decision', admin, csrf, controller.decideRefund);
  router.post('/:complaintId/decision', admin, csrf, controller.decide);
  return router;
}

export function complaintModule(options = {}) {
  return { name: 'complaints', mount: '/api/v1/complaints', router: createComplaintRouter(options) };
}

export const complaintsModule = complaintModule;
export const createComplaintsRouter = createComplaintRouter;
