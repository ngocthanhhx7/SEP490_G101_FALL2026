import { Router } from 'express';
import { identityModels } from '../models/identity.model.js';
import { userModel } from '../models/user.model.js';
import { userAdminAuditModel } from '../models/user-admin-audit.model.js';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createSessionService } from '../services/session.service.js';
import { createUserAdminService } from '../services/user-admin.service.js';
import { AppError, metadata } from '../utils/app-error.js';

function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function userAdminModule({ config, connection, clock = Date.now } = {}) {
  if (!config?.auth?.enabled || !connection) throw new TypeError('Enabled authentication and a database connection are required');
  const sessionService = createSessionService({
    connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret
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
  const authenticatedAdmin = [requireSession(sessionService, { clock }), requireRoles('ADMIN')];
  const csrfProtected = requireCsrf(sessionService);
  const router = Router();

  router.get('/', ...authenticatedAdmin, async (req, res) => {
    const result = await service.list(req.query);
    return respond(res, req, 200, result);
  });

  router.get('/:id', ...authenticatedAdmin, async (req, res) => {
    return respond(res, req, 200, await service.getById(req.params.id));
  });

  router.post('/:id/lock-decisions', ...authenticatedAdmin, csrfProtected, async (req, res) => {
    if (!['LOCK', 'UNLOCK'].includes(req.body?.action)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Account decision is invalid');
    }
    const user = await service.decide({ userId: req.params.id, body: req.body, actor: req.auth });
    return respond(res, req, 200, { userId: user._id.toString(), state: user.state, version: user.version });
  });

  return { name: 'user-admin', mount: '/api/v1/users', router };
}
