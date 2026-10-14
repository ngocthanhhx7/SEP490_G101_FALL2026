import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { AppError, metadata } from '../utils/app-error.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(body, allowed, required) {
  return isObject(body) && Object.keys(body).every(key => allowed.has(key))
    && required.every(key => Object.hasOwn(body, key));
}

function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

function requireService(refundService, method) {
  if (typeof refundService?.[method] !== 'function') {
    throw new TypeError(`Refund service must implement ${method}`);
  }
}

function middleware(sessionService) {
  if (typeof sessionService?.authenticate !== 'function' || typeof sessionService?.verifyCsrf !== 'function') {
    throw new TypeError('Refund routes require an authenticated session service');
  }
  return {
    authenticated: requireSession(sessionService),
    csrfProtected: requireCsrf(sessionService)
  };
}

export function refundProposalModule({ refundService, sessionService } = {}) {
  requireService(refundService, 'propose');
  const { authenticated, csrfProtected } = middleware(sessionService);
  const router = Router();

  router.post('/', authenticated, requireRoles('STAFF', 'ADMIN'), csrfProtected, async (req, res) => {
    const allowed = new Set(['sourceRef', 'amountVnd', 'reason', 'evidenceRefs']);
    if (!hasOnlyKeys(req.body, allowed, ['sourceRef', 'amountVnd', 'reason'])) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Refund proposal is invalid');
    }
    const result = await refundService.propose({ actor: req.auth, input: req.body,
      idempotencyKey: req.get('idempotency-key') });
    return respond(res, req, 201, result);
  });

  return { name: 'refund-proposals', mount: '/api/v1/refund-proposals', router };
}

export function refundLifecycleModule({ refundService, sessionService } = {}) {
  requireService(refundService, 'decide');
  requireService(refundService, 'recordTransfer');
  const { authenticated, csrfProtected } = middleware(sessionService);
  const router = Router();

  router.post('/:id/decisions', authenticated, requireRoles('ADMIN'), csrfProtected, async (req, res) => {
    const allowed = new Set(['decision', 'reason', 'expectedVersion']);
    if (!hasOnlyKeys(req.body, allowed, ['decision', 'reason', 'expectedVersion'])) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Refund decision is invalid');
    }
    const result = await refundService.decide({ actor: req.auth, refundId: req.params.id,
      ...req.body, idempotencyKey: req.get('idempotency-key') });
    return respond(res, req, 200, result);
  });

  router.post('/:id/transfer-records', authenticated, requireRoles('ADMIN'), csrfProtected, async (req, res) => {
    const allowed = new Set(['outcome', 'amountVnd', 'transferReference', 'evidenceReference', 'paidAt', 'expectedVersion']);
    if (!hasOnlyKeys(req.body, allowed, ['outcome', 'expectedVersion'])) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Refund transfer record is invalid');
    }
    const result = await refundService.recordTransfer({ actor: req.auth, refundId: req.params.id,
      ...req.body, idempotencyKey: req.get('idempotency-key') });
    const status = result.status === 'TRANSFER_PENDING' ? 202 : 200;
    return respond(res, req, status, result);
  });

  return { name: 'refund-lifecycle', mount: '/api/v1/refunds', router };
}
