import { body } from '../validators/incident.validator.js';

import { metadata } from '../utils/app-error.js';
function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function createIncidentController({ service } = {}) {
  return {
    getIncidentConfig: async (req, res) =>
      send(
        res,
        req,
        typeof service.config === 'function'
          ? await service.config({ actor: req.auth })
          : { hotline: null }
      ),
    createIncidents: async (req, res) => {
      const input = body(req, [
        'visitId',
        'expectedVersion',
        'severity',
        'urgency',
        'category',
        'description',
        'summary',
        'details',
        'type',
        'observedAt',
        'immediateAction',
        'contactPreference',
        'evidenceRefs',
        'photoRefs',
        'timeline',
        'petId'
      ]);
      return send(
        res,
        req,
        await service.report({
          ...input,
          actor: req.auth,
          idempotencyKey: req.get('Idempotency-Key')
        }),
        201
      );
    },
    createVisitsByVisitIdIncidents: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'severity',
        'urgency',
        'category',
        'description',
        'summary',
        'details',
        'type',
        'observedAt',
        'immediateAction',
        'contactPreference',
        'evidenceRefs',
        'photoRefs',
        'timeline',
        'petId'
      ]);
      return send(
        res,
        req,
        await service.report({
          ...input,
          actor: req.auth,
          visitId: req.params.visitId,
          idempotencyKey: req.get('Idempotency-Key')
        }),
        201
      );
    },
    getIncidents: async (req, res) =>
      send(res, req, await service.list({ actor: req.auth, query: req.query })),
    getVisitsByVisitIdIncidents: async (req, res) =>
      send(
        res,
        req,
        await service.list({
          actor: req.auth,
          query: { ...req.query, visitId: req.params.visitId }
        })
      ),
    getIncidentsByIncidentId: async (req, res) =>
      send(
        res,
        req,
        await service.detail({
          actor: req.auth,
          incidentId: req.params.incidentId
        })
      ),
    getCasesByCaseId: async (req, res) =>
      send(
        res,
        req,
        await service.detail({ actor: req.auth, caseId: req.params.caseId })
      ),
    createCasesByCaseIdActions: async (req, res) => {
      const input = body(req, ['expectedVersion', 'note']);
      return send(
        res,
        req,
        await service.addAction({
          ...input,
          actor: req.auth,
          caseId: req.params.caseId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createIncidentsByIncidentIdActions: async (req, res) => {
      const input = body(req, ['expectedVersion', 'note']);
      return send(
        res,
        req,
        await service.addAction({
          ...input,
          actor: req.auth,
          incidentId: req.params.incidentId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createCasesByCaseIdSuspensionProposals: async (req, res) => {
      const input = body(req, ['expectedVersion', 'reason']);
      return send(
        res,
        req,
        await service.proposeSuspension({
          ...input,
          actor: req.auth,
          caseId: req.params.caseId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createIncidentsByIncidentIdSuspensionProposals: async (req, res) => {
      const input = body(req, ['expectedVersion', 'reason']);
      return send(
        res,
        req,
        await service.proposeSuspension({
          ...input,
          actor: req.auth,
          incidentId: req.params.incidentId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createCasesByCaseIdResolutions: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'targetState',
        'state',
        'summary',
        'resolution',
        'customerResult',
        'chargeVisit',
        'proposal',
        'actionsTaken',
        'customerContacted',
        'veterinaryContacted',
        'followUp',
        'staffNotes',
        'financialDecision'
      ]);
      return send(
        res,
        req,
        await service.resolve({
          ...input,
          actor: req.auth,
          caseId: req.params.caseId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    },
    createIncidentsByIncidentIdResolutions: async (req, res) => {
      const input = body(req, [
        'expectedVersion',
        'targetState',
        'state',
        'summary',
        'resolution',
        'customerResult',
        'chargeVisit',
        'proposal',
        'actionsTaken',
        'customerContacted',
        'veterinaryContacted',
        'followUp',
        'staffNotes',
        'financialDecision'
      ]);
      return send(
        res,
        req,
        await service.resolve({
          ...input,
          actor: req.auth,
          incidentId: req.params.incidentId,
          idempotencyKey: req.get('Idempotency-Key')
        })
      );
    }
  };
}
