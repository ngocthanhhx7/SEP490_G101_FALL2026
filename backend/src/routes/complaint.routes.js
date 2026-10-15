import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { AppError, metadata } from '../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function ensure(service) {
  const required = ['submit', 'list', 'get', 'review', 'resolve', 'object', 'decide'];
  if (!service || required.some(method => typeof service[method] !== 'function')) throw new TypeError('Complaint service is required');
}

function body(req, allowed) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => !allowed.includes(key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Complaint request is invalid');
  }
  return req.body;
}

function send(res, req, data, status = 200) { res.status(status).json({ data, meta: metadata(req) }); }

export function createComplaintRouter({ service, sessionPort, sessionService, allowedOrigins } = {}) {
  ensure(service);
  const session = sessionPort ?? sessionService;
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    res.vary('Cookie'); next();
  });
  router.use(requireSession(session));
  router.param('visitId', (req, _res, next, value) => ID.test(value) ? next() : next(new AppError(422, 'VALIDATION_FAILED', 'Visit ID is invalid')));
  router.param('complaintId', (req, _res, next, value) => ID.test(value) ? next() : next(new AppError(422, 'VALIDATION_FAILED', 'Complaint ID is invalid')));
  const csrf = requireCsrf(session, { allowedOrigins });
  const read = requireRoles('CUSTOMER', 'PET_SITTER', 'STAFF');
  const customer = requireRoles('CUSTOMER');
  const staff = requireRoles('STAFF');

  router.post('/visits/:visitId', customer, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'category', 'summary', 'subject', 'description', 'details', 'message', 'evidenceRefs', 'photoRefs', 'requestedOutcome']);
    const result = await service.submit({ ...input, actor: req.auth, visitId: req.params.visitId,
      idempotencyKey: req.get('Idempotency-Key') });
    return send(res, req, result, result?.pending ? 202 : 201);
  });

  router.post('/', customer, csrf, async (req, res) => {
    const input = body(req, ['visitId', 'expectedVersion', 'category', 'summary', 'subject', 'description', 'details', 'message', 'evidenceRefs', 'photoRefs', 'requestedOutcome']);
    const { visitId, ...fields } = input;
    if (!visitId) throw new AppError(422, 'VALIDATION_FAILED', 'visitId is required');
    const result = await service.submit({ ...fields, actor: req.auth, visitId,
      idempotencyKey: req.get('Idempotency-Key') });
    return send(res, req, result, result?.pending ? 202 : 201);
  });

  router.get('/', read, async (req, res) => send(res, req, await service.list({ actor: req.auth, query: req.query })));
  router.get('/cases/:complaintId', read, async (req, res) => send(res, req, await service.get({ actor: req.auth, complaintId: req.params.complaintId })));
  router.get('/:complaintId', read, async (req, res) => send(res, req, await service.get({ actor: req.auth, complaintId: req.params.complaintId })));

  router.post('/:complaintId/review', staff, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'summary', 'resolution', 'actionsTaken', 'followUp', 'staffNotes', 'financialHold']);
    return send(res, req, await service.review({ ...input, actor: req.auth, complaintId: req.params.complaintId,
      idempotencyKey: req.get('Idempotency-Key') }));
  });
  router.post('/:complaintId/resolution', staff, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'summary', 'resolution', 'actionsTaken', 'followUp', 'staffNotes', 'financialHold']);
    return send(res, req, await service.resolve({ ...input, actor: req.auth, complaintId: req.params.complaintId,
      idempotencyKey: req.get('Idempotency-Key') }));
  });
  router.post('/:complaintId/objections', customer, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'reason', 'message', 'evidenceRefs']);
    return send(res, req, await service.object({ ...input, actor: req.auth, complaintId: req.params.complaintId,
      idempotencyKey: req.get('Idempotency-Key') }));
  });
  router.post('/:complaintId/decision', requireRoles('ADMIN'), csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'summary', 'decision', 'actionsTaken', 'financialHold', 'financialDecision']);
    return send(res, req, await service.decide({ ...input, actor: req.auth, complaintId: req.params.complaintId,
      idempotencyKey: req.get('Idempotency-Key') }));
  });
  router.post('/cases/:complaintId/objections', customer, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'reason', 'message', 'evidenceRefs']);
    return send(res, req, await service.object({ ...input, actor: req.auth, complaintId: req.params.complaintId,
      idempotencyKey: req.get('Idempotency-Key') }));
  });
  return router;
}

export function complaintModule(options = {}) {
  return { name: 'complaints', mount: '/api/v1/complaints', router: createComplaintRouter(options) };
}

export const complaintsModule = complaintModule;
export const createComplaintsRouter = createComplaintRouter;
