import { privateResponse } from '../middlewares/private-response.js';
import { createUserAdminController } from '../controllers/user-admin.controller.js';
import { Router } from 'express';
import { identityModels } from '../models/identity.model.js';
import { userModel } from '../models/user.model.js';
import { userAdminAuditModel } from '../models/user-admin-audit.model.js';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createSessionService } from '../services/session.service.js';
import { createUserAdminService } from '../services/user-admin.service.js';

export function userAdminModule({ config, connection, clock = Date.now } = {}) {
  if (!config?.auth?.enabled || !connection)
    throw new TypeError(
      'Enabled authentication and a database connection are required'
    );
  const sessionService = createSessionService({
    connection,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  const models = identityModels(connection);
  const contactCrypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  const service = createUserAdminService({
    connection,
    User: userModel(connection),
    Contact: models.Contact,
    Audit: userAdminAuditModel(connection),
    sessionService,
    contactCrypto,
    cursorSecret: config.auth.tokenSecret,
    clock
  });
  const authenticatedAdmin = [
    requireSession(sessionService, { clock }),
    requireRoles('ADMIN')
  ];
  const csrfProtected = requireCsrf(sessionService);
  const router = Router();
  router.use(privateResponse);

  router.get(
    '/',
    ...authenticatedAdmin,
    createUserAdminController({ service }).getRoot
  );

  router.get(
    '/:id',
    ...authenticatedAdmin,
    createUserAdminController({ service }).getById
  );

  router.post(
    '/:id/lock-decisions',
    ...authenticatedAdmin,
    csrfProtected,
    createUserAdminController({ service }).createByIdLockDecisions
  );

  return { name: 'user-admin', mount: '/api/v1/users', router };
}
