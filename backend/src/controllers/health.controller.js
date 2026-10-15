import { errorPayload, metadata } from '../utils/app-error.js';

export function createHealthController(service) {
  return {
    health: (req, res) => res.json({ data: service.health(), meta: metadata(req) }),
    ready: async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!await service.readiness()) return res.status(503).json(errorPayload(req, 'NOT_READY', 'Service is not ready'));
      res.json({ data: { status: 'ready' }, meta: metadata(req) });
    }
  };
}
