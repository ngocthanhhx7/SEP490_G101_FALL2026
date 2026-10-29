import { createCustomerAddressController } from '../controllers/customer-address.controller.js';
import { Router } from 'express';
import { requireRoles } from '../middlewares/session.js';

function ensureService(service, methods) {
  if (
    !service ||
    methods.some((method) => typeof service[method] !== 'function')
  ) {
    throw new TypeError('Customer address service is required');
  }
}

export function customerAddressesModule({
  service,
  requireAuthenticated,
  requireCsrf
} = {}) {
  ensureService(service, ['list', 'create', 'update', 'archive']);
  if (
    typeof requireAuthenticated !== 'function' ||
    typeof requireCsrf !== 'function'
  ) {
    throw new TypeError('Session and CSRF middleware are required');
  }
  const router = Router();
  const customerSession = [requireAuthenticated, requireRoles('CUSTOMER')];

  router.get(
    '/',
    ...customerSession,
    createCustomerAddressController({ service }).getRoot
  );

  router.post(
    '/',
    ...customerSession,
    requireCsrf,
    createCustomerAddressController({ service }).createRoot
  );

  router.patch(
    '/:addressId',
    ...customerSession,
    requireCsrf,
    createCustomerAddressController({ service }).updateByAddressId
  );

  router.post(
    '/:addressId/archives',
    ...customerSession,
    requireCsrf,
    createCustomerAddressController({ service }).createByAddressIdArchives
  );

  return { name: 'customer-addresses', mount: '/api/v1/addresses', router };
}

export function visitAccessNotesModule({ service, requireAuthenticated } = {}) {
  ensureService(service, ['accessNotes']);
  if (typeof requireAuthenticated !== 'function')
    throw new TypeError('Session middleware is required');
  const router = Router();
  router.get(
    '/:visitId/access-notes',
    requireAuthenticated,
    requireRoles('PET_SITTER'),
    createCustomerAddressController({ service }).getByVisitIdAccessNotes
  );
  return { name: 'visit-access-notes', mount: '/api/v1/visits', router };
}
