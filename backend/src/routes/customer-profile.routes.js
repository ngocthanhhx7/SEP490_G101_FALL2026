import { Router } from 'express';
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
