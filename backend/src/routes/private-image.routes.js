import express, { Router } from 'express';
import { requireSession, requireCsrf } from '../middlewares/session.js';
import { createSessionService } from '../services/session.service.js';
import { createPrivateImageService } from '../services/private-image.service.js';
import { createPrivateImageController } from '../controllers/private-image.controller.js';
import { MAX_IMAGE_BYTES } from '../services/r2-private-media.service.js';
import { loadR2Config, loadApplicantDocumentConfig } from '../config/r2.js';
import { applicantDocumentModels } from '../models/private-image.model.js';
import { AppError } from '../utils/app-error.js';

const admissionByConnection = new WeakMap();

export function privateImageModule({ connection, media, secret, maxImagesPerUser,
  requireAuthenticated, csrf, maxInFlight = 4, imageModels, storagePrefix = 'private-images',
  name = 'private-images', mount = '/api/v1/private-images' }) {
  const service = createPrivateImageService({ connection, media, secret, maxImagesPerUser, imageModels, storagePrefix });
  const controller = createPrivateImageController({ service });
  const router = Router();
  let admission = admissionByConnection.get(connection);
  if (!admission) {
    admission = createMediaAdmission({ limit: maxInFlight });
    admissionByConnection.set(connection, admission);
  }
  const parseImage = express.raw({ type: ['image/png', 'image/jpeg'], limit: MAX_IMAGE_BYTES });
  const upload = admitted(admission, async (req, res) => {
    await parseBody(parseImage, req, res);
    return controller.upload(req, res);
  });
  const read = admitted(admission, controller.read);
  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      Pragma: 'no-cache'
    });
    next();
  }, requireAuthenticated);
  router.post('/', csrf, upload);
  router.get('/:id/content', read);
  return { name, mount, router };
}

export function createMediaAdmission({ limit = 4 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 64) throw new TypeError('Invalid media capacity');
  let active = 0;
  return Object.freeze({
    get active() { return active; },
    tryAcquire() {
      if (active >= limit) return null;
      active += 1;
      let released = false;
      return Object.freeze({
        release() {
          if (released) return;
          released = true;
          active -= 1;
        }
      });
    }
  });
}

export function parseBody(parser, req, res) {
  return new Promise((resolve, reject) => {
    try {
      parser(req, res, error => error ? reject(error) : resolve());
    } catch (error) {
      reject(error);
    }
  });
}

export function createAdmissionMiddleware({ admission, work }) {
  if (!admission || typeof admission.tryAcquire !== 'function' || typeof work !== 'function') {
    throw new TypeError('Admission middleware dependencies are required');
  }
  return (req, res, next) => {
    const lease = admission.tryAcquire();
    if (!lease) return next(new AppError(503, 'MEDIA_BUSY', 'Private media is busy'));
    let workSettled = false;
    let responseTerminal = false;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      lease.release();
      res.removeListener('finish', onFinish);
      res.removeListener('close', onClose);
    };
    const maybeRelease = () => {
      if (!workSettled) return;
      // Keep the lease while Express is still flushing a download buffer.
      if (responseTerminal || !res.headersSent) release();
    };
    const onFinish = () => {
      responseTerminal = true;
      maybeRelease();
    };
    const onClose = () => {
      responseTerminal = true;
      // A client abort must not release a slot until the current work settles.
      maybeRelease();
    };
    res.once('finish', onFinish);
    res.once('close', onClose);
    Promise.resolve().then(() => work(req, res)).then(() => {
      workSettled = true;
      maybeRelease();
    }).catch(error => {
      workSettled = true;
      release();
      next(error);
    });
  };
}

function admitted(admission, work) {
  return createAdmissionMiddleware({ admission, work });
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

export function applicantDocumentRuntimeModule({ config, connection, ports, env, clock = Date.now }) {
  if (!config.auth?.enabled) return null;
  const documents = loadApplicantDocumentConfig(env);
  if (!documents) return null;
  const session = createSessionService({ connection, clock,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  return privateImageModule({ connection, media: ports.applicantDocuments, secret: config.auth.tokenSecret,
    imageModels: applicantDocumentModels(connection), storagePrefix: 'applicant-documents',
    name: 'applicant-documents', mount: '/api/v1/applicant-documents',
    maxImagesPerUser: documents.maxImagesPerUser, requireAuthenticated: requireSession(session, { clock }),
    csrf: requireCsrf(session) });
}
