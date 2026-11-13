import { metadata } from '../utils/app-error.js';
import { id } from '../validators/pet-care.validator.js';

// HTTP translation for Staff closing a visit that was not checked out (UC-33, GBR-24).
export function createVisitClosureController(service) {
  const send = (req, res, data) => res.json({ data, meta: metadata(req) });
  return {
    list: async (req, res) => send(req, res, await service.needsAction(req.auth)),
    details: async (req, res) => send(req, res, await service.details(req.auth, id(req.params.id))),
    close: async (req, res) => send(req, res, await service.close(req.auth, id(req.params.id), req.body, req.get('idempotency-key')))
  };
}
