import { metadata } from '../utils/app-error.js';
import { validateFinanceSourceInput } from '../validators/finance-source.validator.js';

export function createFinanceSourceController({ service, webhook, bookingCancellation }) {
  const visitCommand = method => async (req, res) => {
    const input = validateFinanceSourceInput(req.body, method === 'updateChecklist'
      ? ['expectedVersion', 'items', 'customerNote'] : ['expectedVersion', 'mediaId']);
    const data = await service[method]({ ...input, visitId: req.params.id, actor: req.auth,
      idempotencyKey: req.get('Idempotency-Key') });
    res.status(200).json({ data, meta: metadata(req) });
  };
  return Object.freeze({
    assignedVisitSummary: async (req, res) => {
      const data = await service.readAssignedVisitSummary(req.auth, req.params.id);
      res.set('Cache-Control', 'private, no-store'); res.vary('Cookie');
      res.status(200).json({ data, meta: metadata(req) });
    },
    execution: async (req, res) => {
      const data = await service.readVisit(req.auth, req.params.id);
      res.status(200).json({ data, meta: metadata(req) });
    },
    checkIn: visitCommand('checkIn'), checkOut: visitCommand('checkOut'), checklist: visitCommand('updateChecklist'),
    assessment: async (req, res) => {
      const input = validateFinanceSourceInput(req.body, ['expectedVersion', 'totalTaxVnd', 'evidenceReference']);
      const data = await service.confirmAssessment({ ...input, bookingId: req.params.id, actor: req.auth,
        idempotencyKey: req.get('Idempotency-Key') });
      res.status(201).json({ data, meta: metadata(req) });
    },
    payment: async (req, res) => {
      const data = await webhook.handleWebhook(req.body);
      res.status(200).json({ data, meta: metadata(req) });
    },
    adminBookingRefunds: async (req, res) => {
      const data = await bookingCancellation.listBookingRefunds(req.auth, req.query);
      res.status(200).json({ data, meta: metadata(req) });
    }
  });
}
