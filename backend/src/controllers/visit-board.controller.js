import { metadata } from '../utils/app-error.js';
import { body } from '../validators/visit-board.validator.js';
const send = (res, req, data, status = 200) =>
  res.status(status).json({ data, meta: metadata(req) });

export function createVisitBoardController({ service } = {}) {
  return {
    getStaffVisitBoard: async (req, res) =>
      send(res, req, await service.list({ actor: req.auth, query: req.query })),
    getVisitsByVisitIdDispatch: async (req, res) =>
      send(
        res,
        req,
        await service.detail({ actor: req.auth, visitId: req.params.visitId })
      ),
    createVisitsByVisitIdRemedies: async (req, res) =>
      send(
        res,
        req,
        await service.proposeRemedy({
          ...body(req, ['expectedVersion', 'message', 'alternatives']),
          actor: req.auth,
          visitId: req.params.visitId,
          idempotencyKey: req.get('idempotency-key')
        }),
        201
      ),
    createVisitsByVisitIdRemediesByRemedyIdResponses: async (req, res) =>
      send(
        res,
        req,
        await service.respondRemedy({
          ...body(req, [
            'expectedVersion',
            'remedyVersion',
            'choice',
            'alternativeId',
            'confirmed',
            'message'
          ]),
          actor: req.auth,
          visitId: req.params.visitId,
          remedyId: req.params.remedyId,
          idempotencyKey: req.get('idempotency-key')
        })
      ),
    createVisitsByVisitIdAssignments: async (req, res) =>
      send(
        res,
        req,
        await service.manualAssign({
          ...body(req, ['expectedVersion', 'sitterId', 'reason']),
          actor: req.auth,
          visitId: req.params.visitId,
          idempotencyKey: req.get('idempotency-key')
        })
      )
  };
}
