import { metadata } from '../utils/app-error.js';
import { id } from '../validators/pet-care.validator.js';
import { availabilityInput, workAreasInput, decisionInput, proposalConfirmationInput } from '../validators/employee-scheduling.validator.js';

export function createEmployeeSchedulingController({ repository, dispatch, carePlans, proposals }) {
  const send = (req, res, data) => res.json({ data, meta: metadata(req) });
  return {
    availability: async (req, res) => send(req, res, await repository.availability.getMine({ actor: req.auth })),
    calendar: async (req, res) => send(req, res, await repository.availability.listMyCalendar({ actor: req.auth,
      fromLocalDate: req.query.fromLocalDate, toLocalDate: req.query.toLocalDate })),
    saveAvailability: async (req, res) => send(req, res, await repository.availability.updateMine({ actor: req.auth,
      command: { ...availabilityInput(req.body), idempotencyKey: req.get('idempotency-key') } })),
    areas: async (req, res) => send(req, res, await repository.areas.getMine({ actor: req.auth })),
    saveAreas: async (req, res) => send(req, res, await repository.areas.replaceMine({ actor: req.auth,
      ...workAreasInput(req.body), idempotencyKey: req.get('idempotency-key') })),
    offers: async (req, res) => send(req, res, await dispatch.offers.list(req.auth, req.query)),
    assignments: async (req, res) => send(req, res, await dispatch.offers.assignments(req.auth, req.query)),
    accept: async (req, res) => send(req, res, await dispatch.offers.accept(req.auth, id(req.params.id), decisionInput(req.body).expectedVersion, req.get('idempotency-key'))),
    decline: async (req, res) => send(req, res, await dispatch.offers.decline(req.auth, id(req.params.id), decisionInput(req.body).expectedVersion, req.get('idempotency-key'))),
    queue: async (req, res) => send(req, res, await dispatch.queue(req.auth)),
    invite: async (req, res) => send(req, res, await dispatch.invite(req.auth, req.params.id, req.body, req.get('idempotency-key'))),
    plans: async (req, res) => send(req, res, await carePlans.list(req.auth)),
    previewPlan: async (req, res) => send(req, res, await carePlans.preview(req.auth, req.params.id, req.body)),
    finalizePlan: async (req, res) => send(req, res, await carePlans.finalize(req.auth, req.params.id, req.body, req.get('idempotency-key'))),
    propose: async (req, res) => send(req, res, await proposals.propose(req.auth, req.params.id, req.body, req.get('idempotency-key'))),
    proposal: async (req, res) => send(req, res, await proposals.getProposal({ actor: req.auth, proposalId: id(req.params.id) })),
    confirmProposal: async (req, res) => send(req, res, await proposals.confirmProposal({ actor: req.auth, proposalId: id(req.params.id),
      ...proposalConfirmationInput(req.body), idempotencyKey: req.get('idempotency-key') }))
  };
}
