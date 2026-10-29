import { ID } from '../constants/incident-fields.js';
import { createIncidentController } from '../controllers/incident.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';
import { AppError } from '../utils/app-error.js';

function ensure(service) {
  if (
    !service ||
    typeof service.report !== 'function' ||
    typeof service.list !== 'function' ||
    typeof service.detail !== 'function' ||
    typeof service.resolve !== 'function'
  ) {
    throw new TypeError('Incident service is required');
  }
}

export function createIncidentRouter({
  service,
  sessionPort,
  allowedOrigins
} = {}) {
  ensure(service);
  const router = Router();
  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer'
    });
    res.vary('Cookie');
    next();
  });
  router.use(requireSession(sessionPort));
  router.param('caseId', (req, _res, next, value) =>
    ID.test(value)
      ? next()
      : next(new AppError(422, 'VALIDATION_FAILED', 'Case ID is invalid'))
  );
  router.param('incidentId', (req, _res, next, value) =>
    ID.test(value)
      ? next()
      : next(new AppError(422, 'VALIDATION_FAILED', 'Incident ID is invalid'))
  );
  const involved = requireRoles('CUSTOMER', 'PET_SITTER');
  const read = requireRoles('CUSTOMER', 'PET_SITTER', 'STAFF');
  const operational = requireRoles('STAFF');
  const csrf = requireCsrf(sessionPort, { allowedOrigins });

  router.post(
    '/incidents',
    involved,
    csrf,
    createIncidentController({ service }).createIncidents
  );
  router.post(
    '/visits/:visitId/incidents',
    involved,
    csrf,
    createIncidentController({ service }).createVisitsByVisitIdIncidents
  );
  router.get(
    '/incidents',
    read,
    createIncidentController({ service }).getIncidents
  );
  router.get(
    '/visits/:visitId/incidents',
    read,
    createIncidentController({ service }).getVisitsByVisitIdIncidents
  );
  router.get(
    '/incidents/:incidentId',
    read,
    createIncidentController({ service }).getIncidentsByIncidentId
  );
  router.get(
    '/cases/:caseId',
    read,
    createIncidentController({ service }).getCasesByCaseId
  );
  router.post(
    '/cases/:caseId/resolutions',
    operational,
    csrf,
    createIncidentController({ service }).createCasesByCaseIdResolutions
  );
  router.post(
    '/incidents/:incidentId/resolutions',
    operational,
    csrf,
    createIncidentController({ service }).createIncidentsByIncidentIdResolutions
  );
  return router;
}

export function incidentModule({ service, sessionPort, allowedOrigins } = {}) {
  return {
    name: 'incidents',
    mount: '/api/v1',
    router: createIncidentRouter({ service, sessionPort, allowedOrigins })
  };
}

export const createIncidentRoutes = createIncidentRouter;
export const createIncidentsRouter = createIncidentRouter;
