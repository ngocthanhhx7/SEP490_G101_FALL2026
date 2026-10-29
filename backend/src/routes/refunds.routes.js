import { createRefundsController } from '../controllers/refunds.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';

function requireService(refundService, method) {
  if (typeof refundService?.[method] !== 'function') {
    throw new TypeError(`Refund service must implement ${method}`);
  }
}

function middleware(sessionService) {
  if (
    typeof sessionService?.authenticate !== 'function' ||
    typeof sessionService?.verifyCsrf !== 'function'
  ) {
    throw new TypeError(
      'Refund routes require an authenticated session service'
    );
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

  router.post(
    '/',
    authenticated,
    requireRoles('STAFF', 'ADMIN'),
    csrfProtected,
    createRefundsController({ refundService }).createRoot
  );

  return {
    name: 'refund-proposals',
    mount: '/api/v1/refund-proposals',
    router
  };
}

export function refundLifecycleModule({ refundService, sessionService } = {}) {
  requireService(refundService, 'decide');
  requireService(refundService, 'recordTransfer');
  const { authenticated, csrfProtected } = middleware(sessionService);
  const router = Router();

  router.post(
    '/:id/decisions',
    authenticated,
    requireRoles('ADMIN'),
    csrfProtected,
    createRefundsController({ refundService }).createByIdDecisions
  );

  router.post(
    '/:id/transfer-records',
    authenticated,
    requireRoles('ADMIN'),
    csrfProtected,
    createRefundsController({ refundService }).createByIdTransferRecords
  );

  return { name: 'refund-lifecycle', mount: '/api/v1/refunds', router };
}
