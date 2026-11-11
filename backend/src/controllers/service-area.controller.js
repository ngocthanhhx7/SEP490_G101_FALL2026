import { metadata } from '../utils/app-error.js';
export function createServiceAreaController(service) {
  return {
    list: async (req, res) => res.json({ data: await service.list(req.auth, req.query), meta: metadata(req) }),
    change: async (req, res) => res.json({ data: await service.change(req.auth, req.body, req.get('idempotency-key')), meta: metadata(req) })
  };
}
