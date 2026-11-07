import express, { Router } from 'express';
import { createAvatarService } from '../services/avatar.service.js';
import { createAvatarController } from '../controllers/avatar.controller.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireCsrf } from '../middlewares/session.js';
import { createMediaAdmission, createAdmissionMiddleware } from './private-image.routes.js';

export function avatarModule({ connection, requireAuthenticated, csrf }) {
  const router = Router(), service = createAvatarService({ connection });
  const controller = createAvatarController({ service });
  const admission = createMediaAdmission({ limit: 2 });
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next();
  }, requireAuthenticated);
  for (const path of ['/me', '/pets/:petId']) {
    router.get(path, controller.metadata);
    router.get(path + '/content', controller.content);
    router.put(path, csrf, createAdmissionMiddleware({ admission, work: async (req, res) => {
      await new Promise((resolve, reject) => express.raw({ type: ['image/png', 'image/jpeg'], limit: '5mb' })(req, res, error => error ? reject(error) : resolve()));
      return controller.change(req, res);
    } }));
    router.delete(path, csrf, controller.change);
  }
  return { name: 'profile-avatars', mount: '/api/v1/avatars', router };
}
export function avatarRuntimeModule({ config, connection, clock = Date.now }) {
  if (!config.auth?.enabled) return null;
  const session = createSessionService({ connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  return avatarModule({ connection, requireAuthenticated: requireSession(session, { clock }), csrf: requireCsrf(session) });
}
