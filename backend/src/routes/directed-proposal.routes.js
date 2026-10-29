import { createDirectedProposalController } from '../controllers/directed-proposal.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';

// Price, pet and payment snapshots are server-owned booking data. The browser
// submits only the selected sitter and requested slots.

/**
 * P42 route surface. P34 owns mounting this module in the application registry;
 * the route itself never accepts a customer id and always scopes reads and
 * writes through the authenticated session.
 */
export function createDirectedProposalRouter({
  service,
  sessionPort,
  allowedOrigins
} = {}) {
  if (
    !service ||
    typeof service.createProposal !== 'function' ||
    typeof service.confirmProposal !== 'function' ||
    typeof service.getProposal !== 'function'
  ) {
    throw new TypeError('A directed proposal service is required');
  }
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  router.use(requireSession(sessionPort));
  const customer = requireRoles('CUSTOMER');
  const csrf = requireCsrf(sessionPort, { allowedOrigins });

  const { create, read, confirm, preview } = createDirectedProposalController({
    service
  });

  router.get(
    '/visits/:visitId/directed-proposals/availability',
    customer,
    preview
  );
  router.post('/visits/:visitId/directed-proposals', customer, csrf, create);
  router.post('/visits/:visitId/proposals', customer, csrf, create);
  router.post(
    '/bookings/:bookingId/visits/:visitId/proposals',
    customer,
    csrf,
    createDirectedProposalController({ service })
      .createBookingsByBookingIdVisitsByVisitIdProposals
  );
  router.get('/directed-proposals/:proposalId', customer, read);
  router.post(
    '/directed-proposals/:proposalId/confirm',
    customer,
    csrf,
    confirm
  );
  router.get('/booking-proposals/:proposalId', customer, read);
  router.post(
    '/booking-proposals/:proposalId/confirm',
    customer,
    csrf,
    confirm
  );
  return router;
}

export function directedProposalModule({
  service,
  sessionPort,
  allowedOrigins
} = {}) {
  return {
    name: 'directed-proposals',
    mount: '/api/v1',
    router: createDirectedProposalRouter({
      service,
      sessionPort,
      allowedOrigins
    })
  };
}
