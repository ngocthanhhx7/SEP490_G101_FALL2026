import { Router } from 'express';
import { requireRoles } from '../middlewares/session.js';
import { metadata } from '../utils/app-error.js';

function ensureService(service, methods) {
  if (!service || methods.some(method => typeof service[method] !== 'function')) {
    throw new TypeError('Customer address service is required');
  }
}

function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function customerAddressesModule({ service, requireAuthenticated, requireCsrf } = {}) {
  ensureService(service, ['list', 'create', 'update', 'archive']);
  if (typeof requireAuthenticated !== 'function' || typeof requireCsrf !== 'function') {
    throw new TypeError('Session and CSRF middleware are required');
  }
  const router = Router();
  const customerSession = [requireAuthenticated, requireRoles('CUSTOMER')];

  router.get('/', ...customerSession, async (req, res) => {
    respond(res, req, 200, await service.list(req.auth, req.query));
  });

  router.post('/', ...customerSession, requireCsrf, async (req, res) => {
    respond(res, req, 201, await service.create(req.auth, req.body, req.get('Idempotency-Key')));
  });

  router.patch('/:addressId', ...customerSession, requireCsrf, async (req, res) => {
    respond(res, req, 200, await service.update(req.auth, req.params.addressId, req.body, req.get('Idempotency-Key')));
  });

  router.post('/:addressId/archives', ...customerSession, requireCsrf, async (req, res) => {
    respond(res, req, 200, await service.archive(req.auth, req.params.addressId, req.body, req.get('Idempotency-Key')));
  });

  return { name: 'customer-addresses', mount: '/api/v1/addresses', router };
}

export function visitAccessNotesModule({ service, requireAuthenticated } = {}) {
  ensureService(service, ['accessNotes']);
  if (typeof requireAuthenticated !== 'function') throw new TypeError('Session middleware is required');
  const router = Router();
  router.get('/:visitId/access-notes', requireAuthenticated, requireRoles('PET_SITTER'), async (req, res) => {
    respond(res, req, 200, await service.accessNotes(req.auth, req.params.visitId));
  });
  return { name: 'visit-access-notes', mount: '/api/v1/visits', router };
}
