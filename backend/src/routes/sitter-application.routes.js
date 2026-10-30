import { createSitterApplicationController } from '../controllers/sitter-application.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';
import { userModel } from '../models/user.model.js';
import { sitterApplicationModels } from '../models/sitter-application.model.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createSessionService } from '../services/session.service.js';
import { createSitterApplicationService } from '../services/sitter-application.service.js';
import { AppError } from '../utils/app-error.js';
import { createApplicationIntakeService } from '../services/applications/application-intake.service.js';
import { loadApplicantDocumentConfig } from '../config/r2.js';
import { createRegistrationPolicyService } from '../services/registration-policy.service.js';

function requireSameOrigin(req, _res, next) {
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (
    fetchSite === 'cross-site' ||
    (origin &&
      (() => {
        try {
          return (
            new URL(origin).origin !== `${req.protocol}://${req.get('host')}`
          );
        } catch {
          return true;
        }
      })())
  ) {
    return next(
      new AppError(403, 'FORBIDDEN', 'Request origin is not allowed')
    );
  }
  next();
}

export function sitterApplicationModule({
  config,
  connection,
  ports,
  clock = Date.now,
  authenticatedSubmission = false,
  uploadsAvailable = false
} = {}) {
  if (!config?.auth?.enabled || !connection || !ports?.privateMedia) {
    throw new TypeError(
      'Enabled authentication, database and private media ports are required'
    );
  }
  const models = sitterApplicationModels(connection);
  const contactCrypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  const intake = authenticatedSubmission ? createApplicationIntakeService({ connection, contactCrypto,
    media: ports.applicantDocuments, secret: config.auth.contactLookupSecret, uploadsAvailable }) : null;
  const service = createSitterApplicationService({
    connection,
    Applicant: models.SitterApplication,
    User: userModel(connection),
    Audit: models.SitterApplicationAudit,
    DownloadQuota: models.SitterApplicationDownloadQuota,
    SitterStatus: models.SitterStatus,
    contactCrypto,
    privateMedia: intake ?? ports.privateMedia,
    registrationPolicyService: authenticatedSubmission ? createRegistrationPolicyService({ connection, clock }) : undefined,
    lookupSecret: config.auth.contactLookupSecret,
    cursorSecret: config.auth.tokenSecret,
    clock
  });
  const sessionService = createSessionService({
    connection,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret,
    clock
  });
  const admin = [
    requireSession(sessionService, { clock }),
    requireRoles('ADMIN')
  ];
  const csrf = requireCsrf(sessionService);
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  if (intake) router.get('/intake', requireSession(sessionService, { clock }),
    createSitterApplicationController({ intake }).getIntake);

  router.post(
    '/',
    requireSameOrigin,
    ...(authenticatedSubmission ? [requireSession(sessionService, { clock }), csrf] : []),
    createSitterApplicationController({ service }).createRoot
  );

  router.get(
    '/',
    ...admin,
    createSitterApplicationController({ service }).getRoot
  );

  router.get(
    '/:applicationId',
    ...admin,
    createSitterApplicationController({ service }).getByApplicationId
  );

  router.post(
    '/:applicationId/review',
    ...admin,
    csrf,
    createSitterApplicationController({ service }).createByApplicationIdReview
  );

  router.post(
    '/:applicationId/interview',
    ...admin,
    csrf,
    createSitterApplicationController({ service })
      .createByApplicationIdInterview
  );

  router.post(
    '/:applicationId/decisions',
    ...admin,
    csrf,
    createSitterApplicationController({ service })
      .createByApplicationIdDecisions
  );

  router.post(
    '/:applicationId/sitter-status',
    ...admin,
    csrf,
    createSitterApplicationController({ service })
      .createByApplicationIdSitterStatus
  );

  router.get(
    '/:applicationId/documents/:documentId',
    ...admin,
    createSitterApplicationController({ service })
      .getByApplicationIdDocumentsByDocumentId
  );

  return { name: 'sitter-applications', mount: '/api/v1/applications', router };
}

export function sitterApplicationRuntimeModule(context) {
  if (!context.config.auth?.enabled) return null;
  return sitterApplicationModule({ ...context, authenticatedSubmission: true,
    uploadsAvailable: Boolean(loadApplicantDocumentConfig(context.env)) });
}
