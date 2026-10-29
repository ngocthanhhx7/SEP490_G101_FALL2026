import { body } from '../validators/complaint.validator.js';

import { AppError, metadata } from '../utils/app-error.js';
function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function createComplaintController({ service } = {}) {
  return {
    createVisitsByVisitId: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'category',
        'summary',
        'subject',
        'description',
        'details',
        'message',
        'evidenceRefs',
        'photoRefs',
        'requestedOutcome'
      ]);
      const result = await service.submit({
        ...input,
        actor: req.auth,
        visitId: req.params.visitId,
        idempotencyKey: req.get('Idempotency-Key')
      });
      return send(res, req, result, result?.pending ? 202 : 201);
    },
    createRoot: async (req, res) => {
      const input = body(req, [
        'visitId',
        'expectedVersion',
        'category',
        'summary',
        'subject',
        'description',
        'details',
        'message',
        'evidenceRefs',
        'photoRefs',
        'requestedOutcome'
      ]);
      const { visitId, ...fields } = input;
      if (!visitId)
        throw new AppError(422, 'VALIDATION_FAILED', 'visitId is required');
      const result = await service.submit({
        ...fields,
        actor: req.auth,
        visitId,
        idempotencyKey: req.get('Idempotency-Key')
      });
      return send(res, req, result, result?.pending ? 202 : 201);
    },
    getRoot: async (req, res) =>
      send(res, req, await service.list({ actor: req.auth, query: req.query })),
    getCasesByComplaintId: async (req, res) =>
      send(
        res,
        req,
        await service.get({
          actor: req.auth,
          complaintId: req.params.complaintId
        })
      ),
    getByComplaintId: async (req, res) =>
      send(
        res,
        req,
        await service.get({
          actor: req.auth,
          complaintId: req.params.complaintId
        })
      ),
    createByComplaintIdReview: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'summary',
        'resolution',
        'actionsTaken',
        'followUp',
        'staffNotes',
        'financialHold'
      ]);
      return send(
        res,
        req,
        await service.review({
          ...input,
          actor: req.auth,
          complaintId: req.params.complaintId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createByComplaintIdResolution: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'summary',
        'resolution',
        'actionsTaken',
        'followUp',
        'staffNotes',
        'financialHold'
      ]);
      return send(
        res,
        req,
        await service.resolve({
          ...input,
          actor: req.auth,
          complaintId: req.params.complaintId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createByComplaintIdObjections: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'reason',
        'message',
        'evidenceRefs'
      ]);
      return send(
        res,
        req,
        await service.object({
          ...input,
          actor: req.auth,
          complaintId: req.params.complaintId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createByComplaintIdDecision: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'summary',
        'decision',
        'actionsTaken',
        'financialHold',
        'financialDecision'
      ]);
      return send(
        res,
        req,
        await service.decide({
          ...input,
          actor: req.auth,
          complaintId: req.params.complaintId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createCasesByComplaintIdObjections: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'reason',
        'message',
        'evidenceRefs'
      ]);
      return send(
        res,
        req,
        await service.object({
          ...input,
          actor: req.auth,
          complaintId: req.params.complaintId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    }
  };
}
