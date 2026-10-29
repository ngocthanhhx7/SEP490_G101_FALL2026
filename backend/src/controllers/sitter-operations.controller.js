import { body, resourceId } from '../validators/sitter-operations.validator.js';

import { metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function createSitterOperationsController({
  offerService,
  visitService,
  reassignmentService,
  withdrawalService
} = {}) {
  return {
    getOffers: async (req, res) => {
      respond(res, req, 200, await offerService.list(req.auth, req.query));
    },
    getOffersByOfferId: async (req, res) => {
      respond(
        res,
        req,
        200,
        await offerService.detail(
          req.auth,
          resourceId(req.params.offerId, 'offerId')
        )
      );
    },
    createOffersByOfferIdAcceptances: async (req, res) => {
      const input = body(req, ['expectedVersion'], ['expectedVersion']);
      respond(
        res,
        req,
        200,
        await offerService.accept(
          req.auth,
          resourceId(req.params.offerId, 'offerId'),
          input.expectedVersion,
          req.get('idempotency-key')
        )
      );
    },
    createOffersByOfferIdDeclines: async (req, res) => {
      const input = body(req, ['expectedVersion'], ['expectedVersion']);
      respond(
        res,
        req,
        200,
        await offerService.decline(
          req.auth,
          resourceId(req.params.offerId, 'offerId'),
          input.expectedVersion,
          req.get('idempotency-key')
        )
      );
    },
    getAssignments: async (req, res) => {
      respond(
        res,
        req,
        200,
        await offerService.assignments(req.auth, req.query)
      );
    },
    getVisitsByVisitId: async (req, res) => {
      respond(
        res,
        req,
        200,
        await visitService.detail(
          req.auth,
          resourceId(req.params.visitId, 'visitId')
        )
      );
    },
    createVisitsByVisitIdReassignments: async (req, res) => {
      const input = body(
        req,
        ['newSitterId', 'expectedVersion', 'reason'],
        ['newSitterId', 'expectedVersion', 'reason']
      );
      respond(
        res,
        req,
        200,
        await reassignmentService.reassign({
          ...input,
          actor: req.auth,
          visitId: resourceId(req.params.visitId, 'visitId'),
          idempotencyKey: req.get('idempotency-key')
        })
      );
    },
    createVisitsByVisitIdWithdrawals: async (req, res) => {
      const input = body(
        req,
        ['expectedVersion', 'reason'],
        ['expectedVersion', 'reason']
      );
      respond(
        res,
        req,
        200,
        await withdrawalService.withdraw({
          ...input,
          actor: req.auth,
          visitId: resourceId(req.params.visitId, 'visitId'),
          idempotencyKey: req.get('idempotency-key')
        })
      );
    }
  };
}
