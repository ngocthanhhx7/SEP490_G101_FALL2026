import { Router } from 'express';
import { createEmployeeSchedulingController } from '../controllers/employee-scheduling.controller.js';
import { createEmployeeScheduleRepository } from '../services/employee-scheduling/employee-schedule.repository.js';
import { createEmployeeDispatchService } from '../services/employee-scheduling/employee-dispatch.service.js';
import { createBookingCarePlanService } from '../services/booking-proposals/booking-care-plan.service.js';
import { createEmployeeScheduleProposalService } from '../services/employee-scheduling/schedule-proposal.service.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { createConfiguredRoutingProvider } from '../services/sitter-matching/commercial-routing.service.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { rateLimit } from 'express-rate-limit';
import { createVisitTravelService } from '../services/employee-scheduling/visit-travel.service.js';
import { createVisitTravelController } from '../controllers/visit-travel.controller.js';

export function employeeSchedulingRuntimeModule({ config, connection, env = {}, clock = Date.now, sessionService, coverageAreas = DEMO_WORK_AREAS }) {
  if (env.EMPLOYEE_SCHEDULING_ENABLED !== undefined && !['true', 'false'].includes(env.EMPLOYEE_SCHEDULING_ENABLED)) throw new TypeError('Invalid EMPLOYEE_SCHEDULING_ENABLED');
  if (env.EMPLOYEE_SCHEDULING_ENABLED !== 'true' || !config.auth?.enabled || !connection?.db) return null;
  if (env.VISIT_TRAVEL_ENABLED !== undefined && !['true', 'false'].includes(env.VISIT_TRAVEL_ENABLED)) throw new TypeError('Invalid VISIT_TRAVEL_ENABLED');
  const routingProvider = createConfiguredRoutingProvider({ env, config, clock });
  const repository = createEmployeeScheduleRepository({ connection, clock, coverageAreas, routingProvider });
  const dispatch = createEmployeeDispatchService({ repository, clock }), carePlans = createBookingCarePlanService({ connection, clock });
  const session = sessionService ?? createSessionService({ connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const proposals = createEmployeeScheduleProposalService({ repository, dispatch, clock });
  const c = createEmployeeSchedulingController({ repository, dispatch, carePlans, proposals }), router = Router();
  const csrf = requireCsrf(session), sitter = requireRoles('PET_SITTER'), staff = requireRoles('STAFF', 'ADMIN');
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); next(); }, requireSession(session, { clock }));
  router.get('/availability', sitter, c.availability);
  router.put('/availability', sitter, csrf, c.saveAvailability);
  router.get('/calendar', sitter, c.calendar);
  router.get('/work-areas', sitter, c.areas);
  router.put('/work-areas', sitter, csrf, c.saveAreas);
  router.get('/offers', sitter, c.offers);
  router.get('/assignments', sitter, c.assignments);
  router.post('/offers/:id/acceptances', sitter, csrf, c.accept);
  router.post('/offers/:id/declines', sitter, csrf, c.decline);
  router.get('/dispatch', staff, c.queue);
  router.post('/visits/:id/invitations', staff, csrf, c.invite);
  router.post('/visits/:id/schedule-proposals', staff, csrf, c.propose);
  router.get('/proposals/:id', requireRoles('CUSTOMER'), c.proposal);
  router.post('/proposals/:id/confirmation', requireRoles('CUSTOMER'), csrf, c.confirmProposal);
  router.get('/care-plans', staff, c.plans);
  router.post('/care-plans/:id/preview', staff, csrf, c.previewPlan);
  router.post('/care-plans/:id/finalization', staff, csrf, c.finalizePlan);
  if (env.VISIT_TRAVEL_ENABLED === 'true') {
    const t = createVisitTravelController({ service: createVisitTravelService({ repository, routingProvider, clock }) });
    const reads = rateLimit({ windowMs: 60000, limit: 120, keyGenerator: req => String(req.auth.userId), standardHeaders: 'draft-8', legacyHeaders: false });
    const writes = rateLimit({ windowMs: 60000, limit: 20, keyGenerator: req => String(req.auth.userId), standardHeaders: 'draft-8', legacyHeaders: false });
    const eta = rateLimit({ windowMs: 60000, limit: 2, keyGenerator: req => String(req.auth.userId), standardHeaders: 'draft-8', legacyHeaders: false });
    router.get('/travel-visits', staff, reads, t.list);
    router.get('/visits/:id/travel', reads, t.get);
    router.post('/visits/:id/travel', sitter, csrf, writes, t.command);
    router.put('/visits/:id/travel/location', sitter, csrf, writes, t.locate);
    router.post('/visits/:id/travel/eta', csrf, eta, t.eta);
  }
  return { name: 'employee-scheduling', mount: '/api/v1/employee-scheduling', router, repository, dispatch, carePlans, proposals };
}
