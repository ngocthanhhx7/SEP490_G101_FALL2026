import { Router } from 'express';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createSitterCapabilityService } from '../services/sitter-capability.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { createSitterManagementService } from '../services/sitter-management.service.js';
import { createSitterManagementController } from '../controllers/sitter-management.controller.js';

export function sitterManagementModule({ connection, sessionService, config, clock }) {
  const router = Router();
  const contactCrypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  const service = createSitterManagementService({ connection, clock, contactCrypto, cursorSecret: config.auth.tokenSecret });
  const controller = createSitterManagementController(service, createSitterCapabilityService({ connection, clock }));
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); next(); });
  router.use(requireSession(sessionService), requireRoles('STAFF'));
  router.get('/', controller.list);
  router.get('/reports', controller.reports);
  router.put('/:userId/capability', requireCsrf(sessionService), controller.capability);
  router.get('/:userId', controller.get);
  router.get('/:userId/activity', controller.activity);
  return { name: 'sitter-management', mount: '/api/v1/sitter-management', router };
}
