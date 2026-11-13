import { metadata } from '../utils/app-error.js';

// HTTP translation for the Staff visit board list (R3 10.1.1).
export function createNeedsActionController(service) {
  return { list: async (req, res) => res.json({ data: await service.list(req.auth, req.query), meta: metadata(req) }) };
}
