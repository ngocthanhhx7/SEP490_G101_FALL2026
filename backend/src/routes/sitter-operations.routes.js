import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { AppError, metadata } from '../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

function body(req, allowed, required = []) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => !allowed.includes(key))
    || required.some(key => !Object.hasOwn(req.body, key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Sitter operation is invalid');
  }
  return req.body;
}

function resourceId(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) throw new AppError(422, 'VALIDATION_FAILED', `${field} is invalid`);
  return value;
}

function requireService(service, methods) {
  if (!service || methods.some(method => typeof service[method] !== 'function')) {
    throw new TypeError(`Sitter operation service is missing ${methods.join(', ')}`);
  }
}

/**
 * P24 route module. P34 owns mounting this module in the runtime registry;
 * exporting it here keeps the route contract reviewable without claiming a
 * Mongo/session integration that is still pending.
 */
export function sitterOperationsModule({ offerService, visitService, reassignmentService,
  withdrawalService, sessionService, allowedOrigins } = {}) {
  requireService(offerService, ['list', 'detail', 'assignments', 'accept', 'decline']);
  requireService(visitService, ['detail']);
  requireService(reassignmentService, ['reassign']);
  requireService(withdrawalService, ['withdraw']);
  if (typeof sessionService?.authenticate !== 'function' || typeof sessionService?.verifyCsrf !== 'function') {
    throw new TypeError('Sitter operation routes require an authenticated session service');
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

  router.get('/offers', authenticated, sitter, async (req, res) => {
    respond(res, req, 200, await offerService.list(req.auth, req.query));
  });
  router.get('/offers/:offerId', authenticated, sitter, async (req, res) => {
    respond(res, req, 200, await offerService.detail(req.auth, resourceId(req.params.offerId, 'offerId')));
  });
  router.post('/offers/:offerId/acceptances', authenticated, sitter, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion'], ['expectedVersion']);
    respond(res, req, 200, await offerService.accept(req.auth,
      resourceId(req.params.offerId, 'offerId'), input.expectedVersion, req.get('idempotency-key')));
  });
  router.post('/offers/:offerId/declines', authenticated, sitter, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion'], ['expectedVersion']);
    respond(res, req, 200, await offerService.decline(req.auth,
      resourceId(req.params.offerId, 'offerId'), input.expectedVersion, req.get('idempotency-key')));
  });
  router.get('/assignments', authenticated, sitter, async (req, res) => {
    respond(res, req, 200, await offerService.assignments(req.auth, req.query));
  });
  router.get('/visits/:visitId', authenticated, sitter, async (req, res) => {
    respond(res, req, 200, await visitService.detail(req.auth, resourceId(req.params.visitId, 'visitId')));
  });
  router.post('/visits/:visitId/reassignments', authenticated, staff, csrf, async (req, res) => {
    const input = body(req, ['newSitterId', 'expectedVersion', 'reason'], ['newSitterId', 'expectedVersion', 'reason']);
    respond(res, req, 200, await reassignmentService.reassign({ ...input, actor: req.auth,
      visitId: resourceId(req.params.visitId, 'visitId'), idempotencyKey: req.get('idempotency-key') }));
  });
  router.post('/visits/:visitId/withdrawals', authenticated, sitter, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'reason'], ['expectedVersion', 'reason']);
    respond(res, req, 200, await withdrawalService.withdraw({ ...input, actor: req.auth,
      visitId: resourceId(req.params.visitId, 'visitId'), idempotencyKey: req.get('idempotency-key') }));
  });

  return { name: 'sitter-operations', mount: '/api/v1', router };
}

export const createSitterOperationsRouter = options => sitterOperationsModule(options).router;
