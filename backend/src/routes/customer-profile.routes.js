import { Router } from 'express';
import { createSessionService } from '../services/session.service.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { requireSession, requireCsrf as csrfMiddleware } from '../middlewares/session.js';
import { requireRoles } from '../middlewares/session.js';
import { identityModels } from '../models/identity.model.js';
import { userModel } from '../models/user.model.js';
import { createCustomerProfileService } from '../services/customer-profile.service.js';
import { metadata } from '../utils/app-error.js';

export function customerProfileModule({ connection, contactCrypto, requireAuthenticated, requireCsrf } = {}) {
  if (!connection || typeof contactCrypto?.decrypt !== 'function'
    || typeof requireAuthenticated !== 'function' || typeof requireCsrf !== 'function') {
    throw new TypeError('Database, contact crypto and session middleware are required');
  }
  const User = userModel(connection);
  const { Contact } = identityModels(connection);
  const profile = createCustomerProfileService({ User, Contact, contactCrypto });
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const customerSession = [requireAuthenticated, requireRoles('CUSTOMER')];

  router.get('/profile', ...customerSession, async (req, res) => {
    const data = await profile.get(req.auth);
    res.status(200).json({ data, meta: metadata(req) });
  });

  router.patch('/profile', ...customerSession, requireCsrf, async (req, res) => {
    const data = await profile.update(req.auth, req.body);
    res.status(200).json({ data, meta: metadata(req) });
  });

  return { name: 'customer-profile', mount: '/api/v1/me', router };
}


export function customerProfileRuntimeModule({ config, connection, clock = Date.now }) {
  if (!config.auth?.enabled) return null;
  const sessionService = createSessionService({ connection, clock,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  return customerProfileModule({ connection,
    contactCrypto: createContactCrypto({ lookupSecret: config.auth.contactLookupSecret,
      encryptionKey: config.auth.contactEncryptionKey }),
    requireAuthenticated: requireSession(sessionService, { clock }),
    requireCsrf: csrfMiddleware(sessionService) });
}
