import { createCustomerProfileController } from '../controllers/customer-profile.controller.js';
import { Router } from 'express';
import { createSessionService } from '../services/session.service.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import {
  requireSession,
  requireCsrf as csrfMiddleware
} from '../middlewares/session.js';
import { requireRoles } from '../middlewares/session.js';
import { identityModels } from '../models/identity.model.js';
import { userModel } from '../models/user.model.js';
import { createCustomerProfileService } from '../services/customer-profile.service.js';

export function customerProfileModule({
  connection,
  contactCrypto,
  requireAuthenticated,
  requireCsrf,
  clock
} = {}) {
  if (
    !connection ||
    typeof contactCrypto?.decrypt !== 'function' ||
    typeof requireAuthenticated !== 'function' ||
    typeof requireCsrf !== 'function'
  ) {
    throw new TypeError(
      'Database, contact crypto and session middleware are required'
    );
  }
  const User = userModel(connection);
  const { Contact } = identityModels(connection);
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  for (const [path, role] of [
    ['/profile', 'CUSTOMER'],
    ['/sitter-personal-profile', 'PET_SITTER'],
    ['/admin-personal-profile', 'ADMIN'],
    ['/staff-personal-profile', 'STAFF'],
    ['/sale-staff-personal-profile', 'SALE_STAFF']
  ]) {
    const profile = createCustomerProfileService({ User, Contact, contactCrypto, role, clock });
    const controller = createCustomerProfileController({ profile });
    const guard = [requireAuthenticated, requireRoles(role)];
    router.get(path, ...guard, controller.getProfile);
    router.patch(path, ...guard, requireCsrf, controller.updateProfile);
  }

  return { name: 'customer-profile', mount: '/api/v1/me', router };
}

export function customerProfileRuntimeModule({
  config,
  connection,
  clock = Date.now
}) {
  if (!config.auth?.enabled) return null;
  const sessionService = createSessionService({
    connection,
    clock,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  return customerProfileModule({
    connection,
    contactCrypto: createContactCrypto({
      lookupSecret: config.auth.contactLookupSecret,
      encryptionKey: config.auth.contactEncryptionKey
    }),
    requireAuthenticated: requireSession(sessionService, { clock }),
    requireCsrf: csrfMiddleware(sessionService),
    clock
  });
}
