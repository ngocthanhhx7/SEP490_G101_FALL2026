import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { petRecordImportConfig } from '../config/pet-record-import.js';
import { createPetRecordImport } from '../services/pet-record-import.service.js';
import { createPetRecordImportController } from '../controllers/pet-record-import.controller.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { createMediaAdmission, createAdmissionMiddleware } from './private-image.routes.js';
import { errorPayload } from '../utils/app-error.js';
export function petRecordImportModule({ requireAuthenticated, csrf, service }) {
  const router = Router(), controller = createPetRecordImportController({ service });
  router.use((_req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); next(); }, requireAuthenticated, requireRoles('CUSTOMER'));
  router.get('/', controller.metadata);
  const limiter = rateLimit({ windowMs: 60000, limit: 2, keyGenerator: req => req.auth.userId, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json(errorPayload(req, 'PET_RECORD_QUOTA_EXCEEDED', 'Wait before another extraction')) });
  router.post('/', csrf, limiter, createAdmissionMiddleware({ admission: createMediaAdmission({ limit: 2 }), work: async (req, res) => {
    await new Promise((resolve, reject) => express.raw({ type: ['image/jpeg', 'image/png', 'application/pdf'], limit: '5mb' })(req, res, error => error ? reject(error) : resolve()));
    return controller.extract(req, res);
  } }));
  return { name: 'pet-record-import', mount: '/api/v1/pet-record-import', router };
}
export function petRecordImportRuntimeModule({ config, connection, env = process.env }) {
  if (!config.auth?.enabled) return null;
  const sessions = createSessionService({ connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  return petRecordImportModule({ requireAuthenticated: requireSession(sessions), csrf: requireCsrf(sessions), service: createPetRecordImport({ config: petRecordImportConfig(env) }) });
}
