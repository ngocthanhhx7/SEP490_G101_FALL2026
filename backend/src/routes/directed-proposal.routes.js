import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { AppError, metadata } from '../utils/app-error.js';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
// Price, pet and payment snapshots are server-owned booking data. The browser
// submits only the selected sitter and requested slots.
const CREATE_FIELDS = ['bookingId', 'sitterId', 'slots'];
const CONFIRM_FIELDS = ['expectedVersion', 'selectedSlot'];

function parameter(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new AppError(422, 'VALIDATION_FAILED', `${label} is invalid`);
  }
  return value;
}

function body(req, fields) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => !fields.includes(key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Directed proposal request is invalid');
  }
  return req.body;
}

function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: metadata(req) });
}

/**
 * P42 route surface. P34 owns mounting this module in the application registry;
 * the route itself never accepts a customer id and always scopes reads and
 * writes through the authenticated session.
 */
export function createDirectedProposalRouter({ service, sessionPort, allowedOrigins } = {}) {
  if (!service || typeof service.createProposal !== 'function'
    || typeof service.confirmProposal !== 'function' || typeof service.getProposal !== 'function') {
    throw new TypeError('A directed proposal service is required');
  }
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  router.use(requireSession(sessionPort));
  const customer = requireRoles('CUSTOMER');
  const csrf = requireCsrf(sessionPort, { allowedOrigins });

  const create = async (req, res) => {
    const fields = body(req, CREATE_FIELDS);
    const visitId = parameter(req.params.visitId, 'visitId');
    send(res, req, await service.createProposal({
      ...fields,
      actor: req.auth,
      visitId,
      sitterId: parameter(fields.sitterId, 'sitterId'),
      idempotencyKey: req.get('idempotency-key')
    }), 201);
  };
  const read = async (req, res) => send(res, req, await service.getProposal({
    actor: req.auth, proposalId: parameter(req.params.proposalId, 'proposalId')
  }));
  const confirm = async (req, res) => {
    const fields = body(req, CONFIRM_FIELDS);
    send(res, req, await service.confirmProposal({
      ...fields,
      actor: req.auth,
      proposalId: parameter(req.params.proposalId, 'proposalId'),
      idempotencyKey: req.get('idempotency-key')
    }));
  };
  const preview = async (req, res) => {
    if (typeof service.previewProposal !== 'function') {
      throw new AppError(503, 'PROPOSAL_UNAVAILABLE', 'Directed availability is unavailable');
    }
    const sitterId = parameter(req.query.sitterId, 'sitterId');
    const bookingId = req.query.bookingId === undefined ? undefined : parameter(req.query.bookingId, 'bookingId');
    send(res, req, await service.previewProposal({ actor: req.auth,
      bookingId, visitId: parameter(req.params.visitId, 'visitId'), sitterId }));
  };

  router.get('/visits/:visitId/directed-proposals/availability', customer, preview);
  router.post('/visits/:visitId/directed-proposals', customer, csrf, create);
  router.post('/visits/:visitId/proposals', customer, csrf, create);
  router.post('/bookings/:bookingId/visits/:visitId/proposals', customer, csrf, async (req, res) => {
    req.body = { ...req.body, bookingId: parameter(req.params.bookingId, 'bookingId') };
    return create(req, res);
  });
  router.get('/directed-proposals/:proposalId', customer, read);
  router.post('/directed-proposals/:proposalId/confirm', customer, csrf, confirm);
  router.get('/booking-proposals/:proposalId', customer, read);
  router.post('/booking-proposals/:proposalId/confirm', customer, csrf, confirm);
  return router;
}

export function directedProposalModule({ service, sessionPort, allowedOrigins } = {}) {
  return { name: 'directed-proposals', mount: '/api/v1',
    router: createDirectedProposalRouter({ service, sessionPort, allowedOrigins }) };
}
