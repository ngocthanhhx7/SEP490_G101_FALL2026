import { Router } from 'express';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { createSitterPublicProfileController } from '../controllers/sitter-public-profile.controller.js';
import { createSitterPublicProfileService } from '../services/sitter-public-profile.service.js';

export function sitterPublicProfileModule({ connection, sessionService, config, clock }) {
  const router = Router();
  const controller = createSitterPublicProfileController(createSitterPublicProfileService({ connection, clock,
    cursorSecret: config.auth.tokenSecret }));
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); next(); });
  router.get('/me', requireSession(sessionService), requireRoles('PET_SITTER'), controller.own);
  router.put('/me', requireSession(sessionService), requireRoles('PET_SITTER'), requireCsrf(sessionService), controller.submit);
  router.get('/', requireSession(sessionService), requireRoles('STAFF'), controller.list);
  router.post('/:userId/reviews', requireSession(sessionService), requireRoles('STAFF'), requireCsrf(sessionService), controller.review);
  return { name: 'sitter-public-profiles', mount: '/api/v1/sitter-public-profiles', router };
}
