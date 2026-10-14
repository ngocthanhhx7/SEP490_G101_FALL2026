import { Router } from 'express';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { metadata, AppError } from '../utils/app-error.js';

// Export only. P34 owns registration; P01 must approve the new read/remedy route mapping.
export function createVisitBoardRouter({ service, sessionPort, allowedOrigins } = {}) {
  const router = Router();
  router.use(requireSession(sessionPort));
  router.param('visitId', (_req, _res, next, value) => /^[a-f0-9]{24}$/.test(value)
    ? next() : next(new AppError(422, 'VALIDATION_FAILED', 'Visit ID is invalid')));
  const staff = requireRoles('STAFF');
  const customer = requireRoles('CUSTOMER');
  const csrf = requireCsrf(sessionPort, { allowedOrigins });
  const send = (res, req, data, status = 200) => res.status(status).json({ data, meta: metadata(req) });
  const body = (req, fields) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).some(key => !fields.includes(key))) throw new AppError(422, 'VALIDATION_FAILED', 'Visit board request is invalid');
    if (fields.includes('sitterId') && !/^[a-f0-9]{24}$/.test(req.body.sitterId ?? '')) throw new AppError(422, 'VALIDATION_FAILED', 'Sitter ID is invalid');
    return req.body;
  };
  router.get('/staff/visit-board', staff, async (req, res) => send(res, req, await service.list({ actor: req.auth, query: req.query })));
  router.get('/visits/:visitId/dispatch', staff, async (req, res) => send(res, req, await service.detail({ actor: req.auth, visitId: req.params.visitId })));
  router.post('/visits/:visitId/remedies', staff, csrf, async (req, res) => send(res, req,
    await service.proposeRemedy({ ...body(req, ['expectedVersion', 'message', 'alternatives']), actor: req.auth,
      visitId: req.params.visitId, idempotencyKey: req.get('idempotency-key') }), 201));
  router.post('/visits/:visitId/remedies/:remedyId/responses', customer, csrf, async (req, res) => send(res, req,
    await service.respondRemedy({ ...body(req, ['expectedVersion', 'remedyVersion', 'choice', 'alternativeId', 'confirmed', 'message']),
      actor: req.auth, visitId: req.params.visitId, remedyId: req.params.remedyId, idempotencyKey: req.get('idempotency-key') })));
  router.post('/visits/:visitId/assignments', staff, csrf, async (req, res) => send(res, req,
    await service.manualAssign({ ...body(req, ['expectedVersion', 'sitterId', 'reason']), actor: req.auth,
      visitId: req.params.visitId, idempotencyKey: req.get('idempotency-key') })));
  return router;
}
