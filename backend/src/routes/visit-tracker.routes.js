import { Router } from 'express';
import { requireSession } from '../middlewares/session.js';
import { controllerAction } from '../controllers/controller-action.js';
import { createVisitTrackerService } from '../services/visit-tracker/visit-tracker.service.js';

export function createVisitTrackerRouter({ connection, sessionService, clock }) {
  const router = Router();
  const tracker = createVisitTrackerService({ connection, clock });
  router.get('/bookings/:bookingId/visits/:visitId/tracker', (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  }, requireSession(sessionService, { clock }),
  controllerAction(200, req => tracker.read(req.auth, req.params)));
  return router;
}
