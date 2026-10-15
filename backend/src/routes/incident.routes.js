import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { AppError, metadata } from '../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
function ensure(service) {
  if (!service || typeof service.report !== 'function' || typeof service.list !== 'function'
    || typeof service.detail !== 'function' || typeof service.resolve !== 'function') {
    throw new TypeError('Incident service is required');
  }
}
function body(req, allowed) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => !allowed.includes(key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Incident request is invalid');
  }
  return req.body;
}
function send(res, req, data, status = 200) { res.status(status).json({ data, meta: metadata(req) }); }

export function createIncidentRouter({ service, sessionPort, allowedOrigins } = {}) {
  ensure(service);
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    res.vary('Cookie'); next();
  });
  router.use(requireSession(sessionPort));
  router.param('caseId', (req, _res, next, value) => ID.test(value) ? next() : next(new AppError(422, 'VALIDATION_FAILED', 'Case ID is invalid')));
  router.param('incidentId', (req, _res, next, value) => ID.test(value) ? next() : next(new AppError(422, 'VALIDATION_FAILED', 'Incident ID is invalid')));
  const involved = requireRoles('CUSTOMER', 'PET_SITTER');
  const read = requireRoles('CUSTOMER', 'PET_SITTER', 'STAFF');
  const operational = requireRoles('STAFF');
  const csrf = requireCsrf(sessionPort, { allowedOrigins });

  router.post('/incidents', involved, csrf, async (req, res) => {
    const input = body(req, ['visitId', 'expectedVersion', 'severity', 'urgency', 'category', 'description', 'summary',
      'details', 'type', 'observedAt', 'immediateAction', 'contactPreference', 'evidenceRefs', 'photoRefs', 'timeline', 'petId']);
    return send(res, req, await service.report({ ...input, actor: req.auth, idempotencyKey: req.get('Idempotency-Key') }), 201);
  });
  router.post('/visits/:visitId/incidents', involved, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'severity', 'urgency', 'category', 'description', 'summary', 'details', 'type',
      'observedAt', 'immediateAction', 'contactPreference', 'evidenceRefs', 'photoRefs', 'timeline', 'petId']);
    return send(res, req, await service.report({ ...input, actor: req.auth, visitId: req.params.visitId,
      idempotencyKey: req.get('Idempotency-Key') }), 201);
  });
  router.get('/incidents', read, async (req, res) => send(res, req, await service.list({ actor: req.auth, query: req.query })));
  router.get('/visits/:visitId/incidents', read, async (req, res) => send(res, req,
    await service.list({ actor: req.auth, query: { ...req.query, visitId: req.params.visitId } })));
  router.get('/incidents/:incidentId', read, async (req, res) => send(res, req,
    await service.detail({ actor: req.auth, incidentId: req.params.incidentId })));
  router.get('/cases/:caseId', read, async (req, res) => send(res, req,
    await service.detail({ actor: req.auth, caseId: req.params.caseId })));
  router.post('/cases/:caseId/resolutions', operational, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'targetState', 'state', 'summary', 'resolution', 'actionsTaken',
      'customerContacted', 'veterinaryContacted', 'followUp', 'staffNotes', 'financialDecision']);
    return send(res, req, await service.resolve({ ...input, actor: req.auth, caseId: req.params.caseId,
      idempotencyKey: req.get('Idempotency-Key') }));
  });
  router.post('/incidents/:incidentId/resolutions', operational, csrf, async (req, res) => {
    const input = body(req, ['expectedVersion', 'targetState', 'state', 'summary', 'resolution', 'actionsTaken',
      'customerContacted', 'veterinaryContacted', 'followUp', 'staffNotes', 'financialDecision']);
    return send(res, req, await service.resolve({ ...input, actor: req.auth, incidentId: req.params.incidentId,
      idempotencyKey: req.get('Idempotency-Key') }));
  });
  return router;
}

export function incidentModule({ service, sessionPort, allowedOrigins } = {}) {
  return { name: 'incidents', mount: '/api/v1',
    router: createIncidentRouter({ service, sessionPort, allowedOrigins }) };
}

export const createIncidentRoutes = createIncidentRouter;
export const createIncidentsRouter = createIncidentRouter;
