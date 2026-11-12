import { fields } from '../validators/complaint.validator.js';
import { metadata } from '../utils/app-error.js';

const submitFields = ['expectedVersion', 'scope', 'bookingId', 'description', 'evidenceRefs',
  'summary', 'subject', 'category', 'requestedOutcome', 'details', 'message', 'photoRefs'];
const legacyResolutionFields = ['staffNotes', 'summary', 'resolution', 'actionsTaken', 'followUp', 'financialHold'];
const resolutionFields = ['handlingNotes', 'customerResult', 'proposal', ...legacyResolutionFields];

function send(req, res, data, status = 200) {
  return res.status(status).json({ data, meta: metadata(req) });
}

export function createComplaintController({ service }) {
  function submit(req, res, visitAlias) {
    const input = fields(req.body, visitAlias ? submitFields.filter(key => key !== 'scope') : [...submitFields, 'visitId']);
    return service.submit({ ...input, ...(visitAlias ? { visitId: req.params.visitId } : {}),
      actor: req.auth, idempotencyKey: req.get('Idempotency-Key') }).then(result => send(req, res, result, 201));
  }

  function command(method, allowed) {
    return async (req, res) => {
      const input = fields(req.body, ['expectedVersion', ...allowed]);
      return send(req, res, await service[method]({ ...input, actor: req.auth,
        complaintId: req.params.complaintId, idempotencyKey: req.get('Idempotency-Key') }));
    };
  }

  return {
    submitVisit: (req, res) => submit(req, res, true),
    submitRoot: (req, res) => submit(req, res, false),
    list: async (req, res) => send(req, res, await service.list({ actor: req.auth, query: req.query })),
    proposals: async (req, res) => send(req, res, await service.list({ actor: req.auth, query: req.query, proposals: true })),
    get: async (req, res) => send(req, res, await service.get({ actor: req.auth, complaintId: req.params.complaintId })),
    proposal: async (req, res) => send(req, res, await service.get({
      actor: req.auth, complaintId: req.params.complaintId, proposalOnly: true
    })),
    eligibility: async (req, res) => send(req, res, await service.eligibility({ actor: req.auth, bookingId: req.params.bookingId })),
    review: command('review', ['handlingNotes', ...legacyResolutionFields]),
    resolve: command('resolve', resolutionFields),
    object: command('object', ['reason', 'message', 'evidenceRefs']),
    decide: command('decide', ['customerResult', 'summary', 'decision', 'amountVnd', 'actionsTaken', 'financialHold', 'financialDecision']),
    decideRefund: command('decideRefund', ['outcome', 'amountVnd', 'reason']),
    evidence: async (req, res) => {
      const result = await service.evidence({ actor: req.auth,
        complaintId: req.params.complaintId, mediaId: req.params.mediaId });
      res.set({ 'Content-Type': result.contentType, 'Content-Disposition': 'attachment; filename="complaint-image"',
        'X-Content-Type-Options': 'nosniff' });
      return res.send(result.body);
    }
  };
}
