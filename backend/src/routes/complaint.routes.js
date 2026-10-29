import { ID } from '../constants/complaint-fields.js';
import { createComplaintController } from '../controllers/complaint.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';
import { AppError } from '../utils/app-error.js';

function ensure(service) {
  const required = [
    'submit',
    'list',
    'get',
    'review',
    'resolve',
    'object',
    'decide'
  ];
  if (
    !service ||
    required.some((method) => typeof service[method] !== 'function')
  )
    throw new TypeError('Complaint service is required');
}

export function createComplaintRouter({
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
  router.param('complaintId', (req, _res, next, value) =>
    ID.test(value)
      ? next()
      : next(new AppError(422, 'VALIDATION_FAILED', 'Complaint ID is invalid'))
  );
  const csrf = requireCsrf(session, { allowedOrigins });
  const read = requireRoles('CUSTOMER', 'PET_SITTER', 'STAFF');
  const customer = requireRoles('CUSTOMER');
  const staff = requireRoles('STAFF');

  router.post(
    '/visits/:visitId',
    customer,
    csrf,
    createComplaintController({ service }).createVisitsByVisitId
  );

  router.post(
    '/',
    customer,
    csrf,
    createComplaintController({ service }).createRoot
  );

  router.get('/', read, createComplaintController({ service }).getRoot);
  router.get(
    '/cases/:complaintId',
    read,
    createComplaintController({ service }).getCasesByComplaintId
  );
  router.get(
    '/:complaintId',
    read,
    createComplaintController({ service }).getByComplaintId
  );

  router.post(
    '/:complaintId/review',
    staff,
    csrf,
    createComplaintController({ service }).createByComplaintIdReview
  );
  router.post(
    '/:complaintId/resolution',
    staff,
    csrf,
    createComplaintController({ service }).createByComplaintIdResolution
  );
  router.post(
    '/:complaintId/objections',
    customer,
    csrf,
    createComplaintController({ service }).createByComplaintIdObjections
  );
  router.post(
    '/:complaintId/decision',
    requireRoles('ADMIN'),
    csrf,
    createComplaintController({ service }).createByComplaintIdDecision
  );
  router.post(
    '/cases/:complaintId/objections',
    customer,
    csrf,
    createComplaintController({ service }).createCasesByComplaintIdObjections
  );
  return router;
}

export function complaintModule(options = {}) {
  return {
    name: 'complaints',
    mount: '/api/v1/complaints',
    router: createComplaintRouter(options)
  };
}

export const complaintsModule = complaintModule;
export const createComplaintsRouter = createComplaintRouter;
