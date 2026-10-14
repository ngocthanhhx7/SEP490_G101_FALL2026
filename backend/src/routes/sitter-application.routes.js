import { Router } from 'express';
import { requireCsrf, requireRoles, requireSession } from '../middlewares/session.js';
import { userModel } from '../models/user.model.js';
import { sitterApplicationModels } from '../models/sitter-application.model.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createSessionService } from '../services/session.service.js';
import { createSitterApplicationService } from '../services/sitter-application.service.js';
import { AppError, metadata } from '../utils/app-error.js';

function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

function requireSameOrigin(req, _res, next) {
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || (origin && (() => {
    try { return new URL(origin).origin !== `${req.protocol}://${req.get('host')}`; }
    catch { return true; }
  })())) {
    return next(new AppError(403, 'FORBIDDEN', 'Request origin is not allowed'));
  }
  next();
}

export function sitterApplicationModule({ config, connection, ports, clock = Date.now } = {}) {
  if (!config?.auth?.enabled || !connection || !ports?.privateMedia) {
    throw new TypeError('Enabled authentication, database and private media ports are required');
  }
  const models = sitterApplicationModels(connection);
  const service = createSitterApplicationService({
    connection,
    Applicant: models.SitterApplication,
    User: userModel(connection),
    Audit: models.SitterApplicationAudit,
    DownloadQuota: models.SitterApplicationDownloadQuota,
    SitterStatus: models.SitterStatus,
    contactCrypto: createContactCrypto({ lookupSecret: config.auth.contactLookupSecret,
      encryptionKey: config.auth.contactEncryptionKey }),
    privateMedia: ports.privateMedia,
    lookupSecret: config.auth.contactLookupSecret,
    cursorSecret: config.auth.tokenSecret,
    clock
  });
  const sessionService = createSessionService({ connection,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const admin = [requireSession(sessionService, { clock }), requireRoles('ADMIN')];
  const csrf = requireCsrf(sessionService);
  const router = Router();

  router.post('/', requireSameOrigin, async (req, res) => {
    const result = await service.submit({ body: req.body, idempotencyKey: req.get('idempotency-key'),
      correlationId: req.requestId });
    return respond(res, req, result.replayed ? 200 : 201, result);
  });

  router.get('/', ...admin, async (req, res) => respond(res, req, 200,
    await service.list({ query: req.query, actor: req.auth })));

  router.get('/:applicationId', ...admin, async (req, res) => respond(res, req, 200,
    await service.get({ applicationId: req.params.applicationId, actor: req.auth, correlationId: req.requestId })));

  router.post('/:applicationId/review', ...admin, csrf, async (req, res) => {
    const result = await service.startReview({ applicationId: req.params.applicationId,
      expectedVersion: req.body?.expectedVersion, idempotencyKey: req.get('idempotency-key'),
      actor: req.auth, correlationId: req.requestId });
    return respond(res, req, 200, result);
  });

  router.post('/:applicationId/decisions', ...admin, csrf, async (req, res) => {
    const result = await service.decide({ applicationId: req.params.applicationId, body: req.body,
      idempotencyKey: req.get('idempotency-key'), actor: req.auth, correlationId: req.requestId });
    return respond(res, req, 200, result);
  });

  router.post('/:applicationId/sitter-status', ...admin, csrf, async (req, res) => {
    const result = await service.changeSitterStatus({ applicationId: req.params.applicationId, body: req.body,
      idempotencyKey: req.get('idempotency-key'), actor: req.auth, correlationId: req.requestId });
    return respond(res, req, 200, result);
  });

  router.get('/:applicationId/documents/:documentId', ...admin, async (req, res) => {
    const capability = await service.documentReadCapability({ applicationId: req.params.applicationId,
      documentId: req.params.documentId, actor: req.auth, correlationId: req.requestId });
    res.set({ 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    return res.redirect(302, capability.url);
  });

  return { name: 'sitter-applications', mount: '/api/v1/applications', router };
}
