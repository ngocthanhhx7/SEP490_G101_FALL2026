import express, { Router } from 'express';
import { requireSession, requireCsrf } from '../middlewares/session.js';
import { createSessionService } from '../services/session.service.js';
import { createPrivateImageService } from '../services/private-image.service.js';
import { MAX_IMAGE_BYTES } from '../services/r2-private-media.service.js';
import { loadR2Config } from '../config/r2.js';
import { AppError, metadata } from '../utils/app-error.js';

export function privateImageModule({ connection, media, secret, maxImagesPerUser,
  requireAuthenticated, csrf }) {
  const service = createPrivateImageService({ connection, media, secret, maxImagesPerUser });
  const router = Router();
  let inFlight = 0;
  async function bounded(work) {
    if (inFlight >= 4) throw new AppError(503, 'MEDIA_BUSY', 'Private media is busy');
    inFlight += 1;
    try { return await work(); }
    finally { inFlight -= 1; }
  }
  const parseImage = express.raw({ type: ['image/png', 'image/jpeg'], limit: MAX_IMAGE_BYTES });
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', Pragma: 'no-cache' });
    next();
  }, requireAuthenticated);
  router.post('/', csrf, async (req, res) => bounded(async () => {
      await new Promise((resolve, reject) => parseImage(req, res, error => error ? reject(error) : resolve()));
      const data = await service.upload({ actor: req.auth, body: req.body,
        contentType: req.get('content-type')?.split(';')[0], idempotencyKey: req.get('idempotency-key') });
      res.status(data.replayed ? 200 : 201).json({ data, meta: metadata(req) });
    }));
  router.get('/:id/content', async (req, res) => bounded(async () => {
    const result = await service.read({ actor: req.auth, id: req.params.id });
    res.set({ 'Content-Type': result.contentType, 'Content-Disposition': 'attachment; filename="private-image"' });
    res.send(result.body);
  }));
  return { name: 'private-images', mount: '/api/v1/private-images', router };
}

export function privateImageRuntimeModule({ config, connection, ports, env, clock = Date.now }) {
  if (!config.auth?.enabled) return null;
  const r2 = loadR2Config(env);
  if (!r2) return null;
  const session = createSessionService({ connection, clock,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  return privateImageModule({ connection, media: ports.privateMedia, secret: config.auth.tokenSecret,
    maxImagesPerUser: r2.maxImagesPerUser, requireAuthenticated: requireSession(session, { clock }),
    csrf: requireCsrf(session) });
}
