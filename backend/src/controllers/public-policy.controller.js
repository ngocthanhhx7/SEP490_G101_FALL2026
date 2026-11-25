import { metadata } from '../utils/app-error.js';
export function createPublicPolicyController({ service }) {
  return {
    getPublicPolicies: async (req, res) =>
      res.json({ data: await service.list(), meta: metadata(req) }),
    getPublicPolicyVersion: async (req, res) => {
      const data = await service.readVersion(req.params.slug, req.params.version);
      res.json({ data, meta: metadata(req) });
    }
  };
}
