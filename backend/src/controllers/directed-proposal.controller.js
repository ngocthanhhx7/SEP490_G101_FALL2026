import { AppError } from '../utils/app-error.js';
import {
  CREATE_FIELDS,
  CONFIRM_FIELDS
} from '../constants/directed-proposal-fields.js';
import { body, parameter } from '../validators/directed-proposal.validator.js';

import { metadata } from '../utils/app-error.js';
function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function createDirectedProposalController({ service } = {}) {
  const create = async (req, res) => {
    const fields = body(req, CREATE_FIELDS);
    const visitId = parameter(req.params.visitId, 'visitId');
    send(
      res,
      req,
      await service.createProposal({
        ...fields,
        actor: req.auth,
        visitId,
        sitterId: parameter(fields.sitterId, 'sitterId'),
        idempotencyKey: req.get('idempotency-key')
      }),
      201
    );
  };
  const read = async (req, res) =>
    send(
      res,
      req,
      await service.getProposal({
        actor: req.auth,
        proposalId: parameter(req.params.proposalId, 'proposalId')
      })
    );
  const confirm = async (req, res) => {
    const fields = body(req, CONFIRM_FIELDS);
    send(
      res,
      req,
      await service.confirmProposal({
        ...fields,
        actor: req.auth,
        proposalId: parameter(req.params.proposalId, 'proposalId'),
        idempotencyKey: req.get('idempotency-key')
      })
    );
  };
  const preview = async (req, res) => {
    if (typeof service.previewProposal !== 'function') {
      throw new AppError(
        503,
        'PROPOSAL_UNAVAILABLE',
        'Directed availability is unavailable'
      );
    }
    const sitterId = parameter(req.query.sitterId, 'sitterId');
    const bookingId =
      req.query.bookingId === undefined
        ? undefined
        : parameter(req.query.bookingId, 'bookingId');
    send(
      res,
      req,
      await service.previewProposal({
        actor: req.auth,
        bookingId,
        visitId: parameter(req.params.visitId, 'visitId'),
        sitterId
      })
    );
  };

  return {
    create,
    read,
    confirm,
    preview,
    createBookingsByBookingIdVisitsByVisitIdProposals: async (req, res) => {
      req.body = {
        ...req.body,
        bookingId: parameter(req.params.bookingId, 'bookingId')
      };
      return create(req, res);
    }
  };
}
