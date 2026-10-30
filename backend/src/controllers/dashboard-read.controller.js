import { metadata } from '../utils/app-error.js';

export function createDashboardReadController({ service, targetParam }) {
  return async (req, res) => {
    const result = await service.read({ actor: req.auth, query: req.query,
      targetId: targetParam ? req.params[targetParam] : undefined });
    res.status(result.pending ? 202 : 200).json({ data: result.pending ? null : result.data,
      meta: { ...metadata(req), ...(result.pending ? { integration: 'INTEGRATION_PENDING' } : {}) } });
  };
}
